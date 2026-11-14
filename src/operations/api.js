import { supabase } from '../lib/supabase.js';
import { calculateAvailableStock, calculateRawMaterialStock } from './calculations.js';
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
  const [
    products,
    customers,
    suppliers,
    categories,
    activePurchases,
    purchaseItems,
    stockMovements
  ] = await Promise.all([
    allRows('production_inventory').then(rows=>rows.map(p=>{
      const isBrick = p.kind === 'finished_brick';
      // Formula: Available Stock = Total Production − Total Sold − Rejected Bricks + Other Receipts/Adjustments
      const computedAvail = isBrick
        ? calculateAvailableStock({
            totalProduced: p.total_produced,
            totalSold: p.total_sold,
            totalRejected: p.total_rejected,
            otherAdjustments: p.other_stock_change
          })
        : Number(p.available_quantity != null ? p.available_quantity : (p.other_stock_change || 0));

      return {
        ...p,
        brick_size: p.production_brick_size,
        default_quantity: p.production_default_quantity,
        available_quantity: computedAvail,
      };
    })),
    allRows('customers',q=>q.eq('is_active',true)),
    allRows('suppliers',q=>q.eq('is_active',true)),
    allRows('expense_categories',q=>q.eq('is_active',true)),
    allRows('purchases', q => q.is('deleted_at', null)).catch(() => []),
    allRows('purchase_items').catch(() => []),
    allRows('stock_movements').catch(() => []),
  ]);

  // Calculate Total Purchased directly from active database purchase records (strictly excluding deleted purchases)
  const activePurchaseIds = new Set((activePurchases || []).map(p => p.id));
  const activeItems = (purchaseItems || []).filter(item => activePurchaseIds.has(item.purchase_id));

  const purchasedByProduct = {};
  activeItems.forEach(item => {
    purchasedByProduct[item.product_id] = (purchasedByProduct[item.product_id] || 0) + Number(item.quantity || 0);
  });

  // Calculate production consumption and valid adjustments from stock movements
  const consumedByProduct = {};
  const adjustmentsByProduct = {};

  (stockMovements || []).forEach(m => {
    // Exclude stock reversal movements from deleted purchases (e.g. 'Delete purchases ...')
    if (m.reason && m.reason.startsWith('Delete purchases')) return;
    if (m.movement_type === 'purchase') return; // Handled directly from active purchase_items above

    if (m.quantity_change < 0 && (m.production_session_id || m.reason?.toLowerCase().includes('production') || m.reason?.toLowerCase().includes('consumed'))) {
      consumedByProduct[m.product_id] = (consumedByProduct[m.product_id] || 0) + Math.abs(Number(m.quantity_change || 0));
    } else {
      adjustmentsByProduct[m.product_id] = (adjustmentsByProduct[m.product_id] || 0) + Number(m.quantity_change || 0);
    }
  });

  // Apply accurate Total Purchased, Total Consumed in Production, and Available Stock to all raw materials
  products.forEach(p => {
    if (p.kind === 'raw_material') {
      const purchased = purchasedByProduct[p.id] || 0;
      const consumed = consumedByProduct[p.id] || 0;
      const adjustments = adjustmentsByProduct[p.id] || 0;

      p.total_purchased = purchased;
      p.total_consumed = consumed;
      // Formula: Available Stock = Total Purchased − Consumed in Production + Other Valid Stock Adjustments
      p.available_quantity = calculateRawMaterialStock({
        totalPurchased: purchased,
        totalConsumed: consumed,
        otherAdjustments: adjustments
      });
    }
  });
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
  // Always fetch fresh DB state to ensure accurate current items
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

  // 1. Update sale_items:
  // Note: production_inventory calculates total_sold directly from active sale_items (where deleted_at IS NULL).
  // Updating sale_items.quantity automatically and accurately updates total_sold and available_quantity in real time.
  // We update existing rows in-place to preserve foreign key integrity with stock_movements.
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
      // If foreign key prevents delete, set quantity to 0 so it no longer counts in sales or total_sold
      try {
        await supabase.from('sale_items').update({ quantity: 0 }).eq('id', idToDelete);
      } catch (err) {
        // Ignored
      }
    }
  }

  // 2. Update sales record
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

export async function syncProductionCementStock({ payload, originalStatus, catalog, currentUserId }) {
  if (!payload || !payload.items || !Array.isArray(payload.items)) return;

  const totalCementNeeded = payload.items.reduce((s, r) => s + Number(r.cement_packs_used || 0), 0);
  if (totalCementNeeded <= 0 && payload.status !== 'reversed') return;

  // Find Cement product in catalog or database
  let cementProduct = catalog?.products?.find(p =>
    p.kind === 'raw_material' && (p.name.toLowerCase().includes('cement') || (p.code && p.code.toLowerCase().includes('cement')))
  );
  if (!cementProduct) {
    const { data: prods } = await supabase
      .from('products')
      .select('*')
      .eq('kind', 'raw_material');
    cementProduct = prods?.find(p => p.name.toLowerCase().includes('cement') || (p.code && p.code.toLowerCase().includes('cement')));
  }
  if (!cementProduct) return;

  const isCompleting = payload.status === 'completed' && originalStatus !== 'completed';
  const isEditingCompleted = payload.status === 'completed' && originalStatus === 'completed';
  const isReversing = payload.status === 'reversed';

  const userId = currentUserId || '631e8bd7-7f52-4119-bade-caa73a851f1d';
  const ref = payload.reference_number || payload.id;

  // 1. Fetch current cement balance from latest stock movement
  const { data: latestSm } = await supabase
    .from('stock_movements')
    .select('balance_after')
    .eq('product_id', cementProduct.id)
    .order('posting_number', { ascending: false })
    .limit(1);

  let currentBalance = 0;
  if (latestSm && latestSm.length > 0 && latestSm[0].balance_after != null) {
    currentBalance = Number(latestSm[0].balance_after);
  } else {
    currentBalance = Number(cementProduct.available_quantity || 0);
  }

  let quantityChange = 0;
  let reason = '';

  if (isCompleting) {
    // Check for existing deduction for this session to prevent double deduction
    const { data: existingSm } = await supabase
      .from('stock_movements')
      .select('id')
      .eq('product_id', cementProduct.id)
      .eq('production_session_id', payload.id)
      .lt('quantity_change', 0);

    if (existingSm && existingSm.length > 0) {
      // Already deducted, do not double-deduct
      return;
    }

    if (currentBalance < totalCementNeeded) {
      throw new Error(`Insufficient cement stock! Production requires ${totalCementNeeded} bags of cement, but only ${currentBalance} bags are available. Cannot allow negative cement stock.`);
    }

    quantityChange = -totalCementNeeded;
    reason = `Production ${ref}: auto-deducted ${totalCementNeeded} bags cement`;
  } else if (isEditingCompleted) {
    // Check previous net deduction for this session
    const { data: previousMovements } = await supabase
      .from('stock_movements')
      .select('quantity_change')
      .eq('product_id', cementProduct.id)
      .eq('production_session_id', payload.id);

    const netPreviouslyDeducted = (previousMovements || []).reduce((s, m) => s - Number(m.quantity_change), 0);
    const diff = netPreviouslyDeducted - totalCementNeeded;

    if (diff !== 0) {
      if (diff < 0 && currentBalance < -diff) {
        throw new Error(`Insufficient cement stock! Updating production requires ${-diff} more bags of cement, but only ${currentBalance} bags are available.`);
      }
      quantityChange = diff;
      reason = diff < 0
        ? `Edit production ${ref}: deducted ${-diff} additional bags cement`
        : `Edit production ${ref}: restored ${diff} unused bags cement to stock`;
    }
  } else if (isReversing) {
    // Look up what cement was deducted for this session
    const { data: existingDeductions } = await supabase
      .from('stock_movements')
      .select('quantity_change')
      .eq('product_id', cementProduct.id)
      .eq('production_session_id', payload.id)
      .lt('quantity_change', 0);

    const alreadyDeducted = (existingDeductions || []).reduce((s, m) => s + Math.abs(Number(m.quantity_change)), 0);
    const cementToRestore = alreadyDeducted > 0 ? alreadyDeducted : totalCementNeeded;

    if (cementToRestore <= 0) return;

    // Check if reversal was already posted
    const { data: existingReversals } = await supabase
      .from('stock_movements')
      .select('quantity_change')
      .eq('product_id', cementProduct.id)
      .eq('production_session_id', payload.id)
      .gt('quantity_change', 0);

    const alreadyRestored = (existingReversals || []).reduce((s, m) => s + Number(m.quantity_change), 0);
    const netToRestore = cementToRestore - alreadyRestored;

    if (netToRestore <= 0) return;

    quantityChange = netToRestore;
    reason = `Delete production ${ref}: restored ${netToRestore} bags cement to stock`;
  }

  if (quantityChange !== 0) {
    const newBalance = currentBalance + quantityChange;
    if (newBalance < 0) {
      throw new Error(`Cannot complete production: Cement stock would become negative (${newBalance} bags).`);
    }

    const movementPayload = {
      id: crypto.randomUUID(),
      request_id: crypto.randomUUID(),
      product_id: cementProduct.id,
      movement_date: payload.date,
      movement_type: 'adjustment',
      quantity_change: quantityChange,
      balance_after: newBalance,
      created_by: userId,
      reason,
      production_session_id: payload.id
    };

    const { error: smErr } = await supabase.from('stock_movements').insert(movementPayload);
    if (smErr) throw smErr;
  }
}
