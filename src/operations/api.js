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
  const [prodInventory, allProducts, customers, suppliers, categories] = await Promise.all([
    allRows('production_inventory')
      .then(rows => rows.map(p => ({ ...p, brick_size: p.production_brick_size, default_quantity: p.production_default_quantity })))
      .catch(() => []),
    allRows('products', q => q.eq('is_active', true)).catch(() => []),
    allRows('customers', q => q.eq('is_active', true)).catch(() => []),
    allRows('suppliers', q => q.eq('is_active', true)).catch(() => []),
    allRows('expense_categories', q => q.eq('is_active', true)).catch(() => []),
  ]);

  // Combine: finished bricks from production_inventory with raw materials from products table
  const brickIds = new Set(prodInventory.map(p => p.id));
  const rawProducts = allProducts.filter(p => !brickIds.has(p.id) && p.kind === 'raw_material');

  // If there are raw materials, fetch latest stock_movements balances for them
  if (rawProducts.length > 0) {
    try {
      const rawIds = rawProducts.map(p => p.id);
      const { data: movements } = await supabase
        .from('stock_movements')
        .select('product_id, balance_after, posting_number')
        .in('product_id', rawIds)
        .order('posting_number', { ascending: false });

      if (movements && movements.length > 0) {
        const latestBalance = {};
        for (const m of movements) {
          if (latestBalance[m.product_id] === undefined) {
            latestBalance[m.product_id] = m.balance_after;
          }
        }
        rawProducts.forEach(p => {
          if (latestBalance[p.id] !== undefined) {
            p.available_quantity = Number(latestBalance[p.id]);
          } else if (p.available_quantity === undefined) {
            p.available_quantity = 0;
          }
        });
      }
    } catch (e) {
      console.warn('Could not load raw material stock balances:', e);
    }
  }

  const products = [...prodInventory, ...rawProducts];

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
