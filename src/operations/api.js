import { supabase } from '../lib/supabase';
export const formats = {
  sales: { table: 'sales_history', date: 'sale_date', search: 'customer_name', operation: 'sale', title: 'Sales' },
  purchases: { table: 'purchases_history', date: 'purchase_date', search: 'supplier_name', operation: 'purchase', title: 'Purchases' },
  production: { table: 'production_history', date: 'production_date', search: 'product_name', operation: 'production', title: 'Production' },
  expenses: { table: 'expenses_history', date: 'expense_date', search: 'description', operation: 'expense', title: 'Expenses' },
};
export function today(timezone) {
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get=k=>parts.find(p=>p.type===k).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export const currency = (value, code='INR') => new Intl.NumberFormat('en-IN',{style:'currency',currency:code,minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value||0));
export async function allRows(table, configure=q=>q) {
  const rows=[];
  for(let offset=0;;offset+=500){
    const {data,error}=await configure(supabase.from(table).select('*')).order('id').range(offset,offset+499);
    if(error) throw error;
    rows.push(...data);
    if(data.length<500) return rows;
  }
}
export async function catalog() {
  const [products,customers,suppliers,categories]=await Promise.all([
    allRows('production_inventory').then(rows=>rows.map(p=>({...p,brick_size:p.production_brick_size,default_quantity:p.production_default_quantity}))),
    allRows('customers',q=>q.eq('is_active',true)),
    allRows('suppliers',q=>q.eq('is_active',true)),
    allRows('expense_categories',q=>q.eq('is_active',true)),
  ]);
  customers.sort((a,b)=>{
    if(a.created_at && b.created_at){
      const diff=new Date(b.created_at)-new Date(a.created_at);
      if(!isNaN(diff)&&diff!==0) return diff;
    }
    if(a.created_at && !b.created_at) return -1;
    if(!a.created_at && b.created_at) return 1;
    return (a.name||'').localeCompare(b.name||'');
  });
  return {products,customers,suppliers,categories};
}
export async function history(kind,filters,page=0) {
  const f=formats[kind];
  let query=supabase.from(f.table).select('*',{count:'exact'}).order(f.date,{ascending:false}).order('created_at',{ascending:false}).order('id');
  if(['sales','purchases','expenses'].includes(kind)&&filters.status!=='all')query=filters.status==='deleted'?query.not('deleted_at','is',null):query.is('deleted_at',null);
  if(filters.from)query=query.gte(f.date,filters.from);
  if(filters.to)query=query.lte(f.date,filters.to);
  if(filters.search.trim())query=query.ilike(f.search,`%${filters.search.trim().replace(/[%_\\]/g,'\\$&')}%`);
  if(filters.category)query=query.eq('category_id',filters.category);
  const {data,error,count}=await query.range(page*25,page*25+24);
  if(error)throw error;
  return {rows:data,count};
}
export async function detail(kind,id) {
  const f=formats[kind];
  const {data,error}=await supabase.from(f.table).select('*').eq('id',id).single();
  if(error)throw error;
  const items=kind==='sales'?await allRows('sale_items',q=>q.eq('sale_id',id)):kind==='purchases'?await allRows('purchase_items',q=>q.eq('purchase_id',id)):[];
  const payments=kind==='sales'?await allRows('customer_payments',q=>q.eq('sale_id',id)):kind==='purchases'?await allRows('supplier_payments',q=>q.eq('purchase_id',id)):[];
  return {record:data,items,payments};
}
export async function movements(productId,page=0) {
  const {data,error,count}=await supabase.from('stock_movements').select('*',{count:'exact'}).eq('product_id',productId).order('posting_number',{ascending:false}).range(page*25,page*25+24);
  if(error)throw error;
  return {rows:data,count};
}
export async function execute(request) {
 try {
  const response=await supabase.rpc('execute_operation',{p_kind:request.kind,p_request_id:request.id,p_payload:request.payload});
  if(response.error){
    const err=new Error(response.error.message||'Unable to save. Please try again.');
    err.uncertain=!response.status || response.status>=500 || !response.error.code;
    throw err;
  }
  return response.data;
 } catch(error) {
   if(typeof error.uncertain!=='boolean')error.uncertain=true;
   throw error;
 }
}

export async function updateSaleBill({ saleId, payload, originalSale, catalog, currentUserId }) {
  // Always fetch fresh DB state to ensure accurate current stock diffs and avoid double-adjustments on retries
  let origRecord = originalSale?.record;
  let origItems = originalSale?.items;
  let origPayments = originalSale?.payments;

  try {
    const fresh = await detail('sales', saleId);
    if (fresh && fresh.record) {
      origRecord = fresh.record;
      origItems = fresh.items;
      origPayments = fresh.payments;
    }
  } catch (e) {
    // Fall back to originalSale passed from form if fresh read fails
  }

  const userId = currentUserId || origRecord?.created_by || '631e8bd7-7f52-4119-bade-caa73a851f1d';
  const receiptNum = origRecord?.receipt_number || saleId;

  // 1. Calculate stock movement differences per product
  const origQtyMap = {};
  (origItems || []).forEach(it => {
    origQtyMap[it.product_id] = (origQtyMap[it.product_id] || 0) + Number(it.quantity || 0);
  });

  const newQtyMap = {};
  (payload.items || []).forEach(it => {
    newQtyMap[it.product_id] = (newQtyMap[it.product_id] || 0) + Number(it.quantity || 0);
  });

  const allProductIds = new Set([...Object.keys(origQtyMap), ...Object.keys(newQtyMap)]);

  for (const prodId of allProductIds) {
    const qOrig = origQtyMap[prodId] || 0;
    const qNew = newQtyMap[prodId] || 0;
    const diff = qOrig - qNew; // diff > 0: customer bought less -> return to stock; diff < 0: customer bought more -> deduct

    if (diff !== 0) {
      const { data: latestSm } = await supabase
        .from('stock_movements')
        .select('balance_after')
        .eq('product_id', prodId)
        .order('posting_number', { ascending: false })
        .limit(1);

      let currentBalance = 0;
      if (latestSm && latestSm.length > 0 && latestSm[0].balance_after != null) {
        currentBalance = Number(latestSm[0].balance_after);
      } else {
        const prod = catalog?.products?.find(p => p.id === prodId);
        currentBalance = Number(prod?.available_quantity || 0);
      }
      const newBalance = currentBalance + diff;
      const prodName = catalog?.products?.find(p => p.id === prodId)?.name || 'Brick';

      const movementPayload = {
        id: crypto.randomUUID(),
        request_id: crypto.randomUUID(),
        product_id: prodId,
        movement_date: payload.date || origRecord.sale_date,
        movement_type: 'adjustment',
        quantity_change: diff,
        balance_after: newBalance,
        created_by: userId,
        reason: diff > 0
          ? `Edit sale #${receiptNum}: returned ${diff} ${prodName} to stock`
          : `Edit sale #${receiptNum}: deducted ${-diff} ${prodName} for updated bill`
      };

      const { error: smErr } = await supabase.from('stock_movements').insert(movementPayload);
      if (smErr) throw smErr;
    }
  }

  // 2. Update sale_items: update existing rows in-place to preserve stock_movements foreign keys
  const origItemByProduct = {};
  (origItems || []).forEach(it => {
    origItemByProduct[it.product_id] = it;
  });

  const remainingOrigIds = new Set((origItems || []).map(it => it.id));

  for (const newItem of payload.items) {
    const existing = origItemByProduct[newItem.product_id];
    if (existing) {
      remainingOrigIds.delete(existing.id);
      const { error: updItemErr } = await supabase
        .from('sale_items')
        .update({
          quantity: Number(newItem.quantity),
          unit_price: Number(newItem.price)
        })
        .eq('id', existing.id);
      if (updItemErr) throw updItemErr;
    } else {
      const prod = catalog?.products?.find(p => p.id === newItem.product_id);
      const { error: insItemErr } = await supabase
        .from('sale_items')
        .insert({
          id: crypto.randomUUID(),
          sale_id: saleId,
          product_id: newItem.product_id,
          product_name: prod?.name || 'Finished Brick',
          product_code: prod?.code || '',
          size_label: prod?.size_label || `${prod?.brick_size || 4}-inch`,
          quantity: Number(newItem.quantity),
          unit_price: Number(newItem.price),
          cost_method: 'moving_weighted_average',
        });
      if (insItemErr) throw insItemErr;
    }
  }

  // Remove any items that are no longer part of the bill (if not referenced by stock_movements)
  for (const idToDelete of remainingOrigIds) {
    try {
      await supabase.from('sale_items').delete().eq('id', idToDelete);
    } catch (e) {
      // Ignored if protected by immutable stock movement foreign key
    }
  }

  // 3. Update sales record
  // Note: in PostgreSQL, 'total' is a generated column and cannot be updated directly.
  // Postgres automatically recalculates 'total' when 'subtotal' and 'discount' are updated.
  const subtotal = payload.items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.price) || 0), 0);
  const discount = Number(payload.discount) || 0;

  const saleUpdatePayload = {
    sale_date: payload.date,
    customer_id: payload.contact_id || null,
    customer_name: payload.name || origRecord?.customer_name,
    customer_phone: payload.phone || origRecord?.customer_phone || '',
    subtotal,
    discount,
    notes: payload.notes || '',
  };

  let { error: updateSaleErr } = await supabase
    .from('sales')
    .update(saleUpdatePayload)
    .eq('id', saleId);

  // If subtotal is also a generated column in this schema, retry without it
  if (updateSaleErr && updateSaleErr.message && /subtotal.*DEFAULT/i.test(updateSaleErr.message)) {
    delete saleUpdatePayload.subtotal;
    const retry = await supabase
      .from('sales')
      .update(saleUpdatePayload)
      .eq('id', saleId);
    updateSaleErr = retry.error;
  }

  if (updateSaleErr) throw updateSaleErr;

  // 4. Update customer_payments
  const paidAmount = Number(payload.paid) || 0;
  const existingPayments = origPayments || [];

  if (existingPayments.length <= 1) {
    if (existingPayments.length === 1) {
      if (paidAmount > 0) {
        const { error: payErr } = await supabase
          .from('customer_payments')
          .update({
            amount: paidAmount,
            payment_method: payload.payment_method || 'cash',
            payment_date: payload.date || origRecord?.sale_date,
          })
          .eq('id', existingPayments[0].id);
        if (payErr) throw payErr;
      } else {
        const { error: delPayErr } = await supabase
          .from('customer_payments')
          .delete()
          .eq('id', existingPayments[0].id);
        if (delPayErr) {
          // If deletion violates foreign key constraint, set amount to 0
          await supabase
            .from('customer_payments')
            .update({ amount: 0 })
            .eq('id', existingPayments[0].id);
        }
      }
    } else if (paidAmount > 0) {
      const { error: insPayErr } = await supabase
        .from('customer_payments')
        .insert({
          id: crypto.randomUUID(),
          request_id: crypto.randomUUID(),
          sale_id: saleId,
          payment_date: payload.date || origRecord?.sale_date,
          amount: paidAmount,
          payment_method: payload.payment_method || 'cash',
          notes: '',
          created_by: userId,
        });
      if (insPayErr) throw insPayErr;
    }
  }

  return { id: saleId, receipt_number: receiptNum };
}
