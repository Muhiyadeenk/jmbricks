import React,{useEffect,useRef,useState} from 'react';
import {useLocation,useNavigate,Link} from 'react-router-dom';
import {Plus,Search,RefreshCw,History,Package,Factory,Wallet,ShoppingBag,ShoppingCart,Printer,Trash2} from 'lucide-react';
import {Button,Card,Badge,EmptyState,Field,SectionTitle,Table,Dialog,Brick,number} from '../components';
import {supabase} from '../lib/supabase';
import {catalog as loadCatalog,history,formats,detail,movements,currency,today,execute} from './api';
import OperationForm,{titles} from './OperationForm';
import SalesInvoice from './SalesInvoice';
import Reports,{LiveDashboard} from './Reports';
import Production,{ProductionOverview,displayDate} from './Production';
const blankCatalog={products:[],customers:[],suppliers:[],categories:[]};
export default function Operations({profile,settings}) {
  const location=useLocation();const navigate=useNavigate();
  const page=location.pathname.slice(1)||'dashboard';
  const [catalog,setCatalog]=useState(blankCatalog),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [revision,setRevision]=useState(0),[modal,setModal]=useState(null),[selected,setSelected]=useState(null),[stockHistory,setStockHistory]=useState(null),[message,setMessage]=useState('');
  const [productionNew,setProductionNew]=useState(false);
  const [busy,setBusy]=useState(false),[saveError,setSaveError]=useState('');
  const storageKey=`jm-pending-${profile.id}`;
  const [pending,setPending]=useState(()=>{try{return JSON.parse(sessionStorage.getItem(storageKey)||'null')}catch{return null}});
  const lock=useRef(false);
  const canWrite=profile.role==='owner'||profile.role==='staff',owner=profile.role==='owner';
  useEffect(()=>{
    let alive=true;
    if(!catalog.products.length && !catalog.customers.length) setLoading(true);
    setError('');
    loadCatalog().then(data=>{if(alive)setCatalog(data)}).catch(()=>{if(alive)setError('Could not load inventory and contacts. Check your connection and apply the database migrations and production register update.')}).finally(()=>{if(alive)setLoading(false)});
    return()=>{alive=false};
  },[revision]);
  function open(kind,initial={}){if(kind==='production'){navigate('/production');setProductionNew(true);return;}setSaveError('');setMessage('');setModal({kind,initial});}
  function clearPending(){sessionStorage.removeItem(storageKey);setPending(null);}
  function completed(request,result){
    clearPending();setModal(null);setMessage(request.kind.startsWith('delete_')?'Entry deleted. Stock, balances and reports have been updated.':`${titles[request.kind]} saved successfully.`);if(request.kind.startsWith('delete_'))setSelected(null);setRevision(v=>v+1);
    if(request.kind==='sale'||request.kind==='purchase')setSelected({kind:request.kind==='sale'?'sales':'purchases',id:result.id});
    else if(request.kind.endsWith('_payment'))setSelected({kind:request.kind==='customer_payment'?'sales':'purchases',id:result.transaction_id});
  }
  async function send(request){
    if(lock.current)return;lock.current=true;setBusy(true);setSaveError('');
    try{const result=await execute(request);completed(request,result);}
    catch(err){
      if(!err.uncertain){clearPending();setModal({kind:request.kind,initial:request.payload});}
      setSaveError(err.message);
    }finally{lock.current=false;setBusy(false);}
  }
  async function submit(kind,payload){
    if(lock.current||pending)return;
    const request={id:crypto.randomUUID(),kind,payload:{...payload,currency:settings.currency}};
    try{sessionStorage.setItem(storageKey,JSON.stringify(request));}
    catch{setSaveError('Allow session storage so interrupted submissions can be retried safely. Nothing has been sent.');return;}
    setPending(request);await send(request);
  }
  async function checkPending(){
    if(lock.current)return;lock.current=true;setBusy(true);setSaveError('');
    try{
      const {data,error}=await supabase.from('operation_requests').select('result').eq('id',pending.id).maybeSingle();
      if(error)throw error;
      if(data)completed(pending,data.result);
      else setSaveError('No completed record is visible yet. Retry the original submission below; the same request ID prevents duplication.');
    }catch{setSaveError('Unable to verify the saved status. Restore the connection and retry.');}
    finally{lock.current=false;setBusy(false);}
  }
  if(loading)return <div className="empty" role="status">Loading your business records…</div>;
  if(error)return <Card><EmptyState title="Workspace unavailable" description={error} action={<Button onClick={()=>setRevision(v=>v+1)}>Try again</Button>}/></Card>;
  return <><div className="operations-heading"><div><h1>{page==='dashboard'?'Daily operations':page==='stock'?'Stock management':formats[page]?.title||'Reports'}</h1><p>{page==='production'?'Record daily production and automatically update stock.':`Live business records · ${today(settings.timezone)}`}</p></div><Button variant="secondary" onClick={()=>setRevision(v=>v+1)}><RefreshCw size={16}/>Refresh</Button></div>{message&&<div className="notice" role="status">{message}</div>}{!settings.costing_confirmed&&<div className="notice">Before entering stock or sales, the owner must confirm inventory costing in <Link className="text-link" to="/settings">Settings</Link>.</div>}
    {page==='dashboard'&&<><div className="quick-actions"><span>Quick actions</span>{[['sale',ShoppingBag],['purchase',ShoppingCart],['production',Factory],['expense',Wallet]].map(([kind,Icon])=><Button key={kind} disabled={!canWrite} onClick={()=>open(kind)}><Icon size={16}/>{titles[kind]}</Button>)}</div><ProductionOverview settings={settings} revision={revision}/><LiveDashboard settings={settings} revision={revision} onDetail={setSelected}/></>}
    {page==='stock'&&<StockPage catalog={catalog} settings={settings} owner={owner} open={open} onHistory={setStockHistory}/>}
    {(page==='production'||productionNew)&&<Production catalog={catalog} settings={settings} profile={profile} revision={revision} onChanged={()=>setRevision(v=>v+1)} openNew={productionNew} onOpened={()=>setProductionNew(false)}/>}
    {formats[page]&&page!=='production'&&<HistoryPage key={page} kind={page} revision={revision} catalog={catalog} settings={settings} canWrite={canWrite} owner={owner} open={open} onDetail={id=>setSelected({kind:page,id})}/>}
    {page==='production'&&owner&&<Card><SectionTitle title="Product configuration" subtitle="Manage brick sizes and bricks per line. Product changes never add stock."/><Button onClick={()=>open('product')}>Configure a product</Button>{catalog.products.map(p=><div className="product-footer" key={p.id}><span>{p.code} · {p.name} · {p.default_quantity||'—'} bricks/line</span><Button variant="secondary" onClick={()=>open('product',p)}>Edit configuration</Button></div>)}<details><summary>Authorized stock corrections</summary><p>Verified opening balances and corrections require a reason and an owner account.</p>{catalog.products.filter(p=>p.is_stocked).map(p=><Button key={p.id} variant="secondary" onClick={()=>open('adjustment',{product_id:p.id})}>{p.code} · adjustment</Button>)}</details></Card>}{page==='reports'&&<Reports settings={settings} revision={revision} owner={owner}/>}
    {modal&&!pending&&<OperationForm key={`${modal.kind}-${modal.initial.id||''}`} {...modal} catalog={catalog} settings={settings} busy={busy} error={saveError} onSubmit={submit} onClose={()=>setModal(null)} onCustomerUpdate={cust => {
      if (cust) {
        if (cust._deleted) {
          setCatalog(prev => ({ ...prev, customers: prev.customers.filter(c => c.id !== cust.id) }));
        } else {
          setCatalog(prev => ({ ...prev, customers: [cust, ...prev.customers.filter(c => c.id !== cust.id)] }));
        }
      }
    }}/>}
    {pending&&<Dialog title="Submission status" onClose={()=>{}}><p>{busy?'Saving your entry…':'This entry needs confirmation. Keep its request ID and retry the original submission if the connection was interrupted.'}</p><div className="notice">{titles[pending.kind]}<br/>Request: {pending.id}</div>{saveError&&<div className="auth-error" role="alert">{saveError}</div>}<div className="dialog-actions"><Button variant="secondary" disabled={busy} onClick={checkPending}>Check saved status</Button><Button disabled={busy} onClick={()=>send(pending)}>{busy?'Please wait…':'Retry original entry'}</Button></div></Dialog>}
    {selected&&!modal&&!pending&&<TransactionDetail key={`${selected.kind}-${selected.id}-${revision}`} {...selected} catalog={catalog} settings={settings} canWrite={canWrite} owner={owner} onClose={()=>setSelected(null)} onPayment={open}/>}
    {stockHistory&&!modal&&!pending&&<MovementHistory product={stockHistory} onClose={()=>setStockHistory(null)}/>}
  </>;
}
function StockPage({catalog,settings,owner,open,onHistory}){
 const [search,setSearch]=useState(''),[filter,setFilter]=useState('all');
 const status=p=>!p.is_stocked?'Not tracked':Number(p.available_quantity)===0?'Out of Stock':Number(p.available_quantity)<=Number(p.minimum_stock||0)?'Low Stock':'In Stock';

 // Filtered list based on search and status
 const matchesSearch = p => `${p.name} ${p.code} ${p.size_label||''}`.toLowerCase().includes(search.toLowerCase());

 // Separate into Finished Bricks and Raw Materials
 const brickList = catalog.products.filter(p => p.kind === 'finished_brick' && matchesSearch(p) && (filter==='all'||filter==='finished_brick'||String(p.brick_size)===filter||status(p)===filter||(filter==='inactive'&&!p.is_active)));

 // Standard raw material templates
 const stdRawTemplates = [
   { name: 'Cement', code: 'RM-CEMENT', unit: 'bag', minimum_stock: 50 },
   { name: 'Baby Metal', code: 'RM-BABYMETAL', unit: 'tonne', minimum_stock: 10 },
   { name: 'Dust', code: 'RM-DUST', unit: 'tonne', minimum_stock: 10 },
   { name: 'Chemical', code: 'RM-CHEMICAL', unit: 'litre', minimum_stock: 20 },
 ];

 // Combine standard raw materials with any custom raw materials in catalog
 const rawList = useMemo(() => {
   const existingRaw = catalog.products.filter(p => p.kind === 'raw_material');
   const result = [];
   const seenCodes = new Set();

   // 1. First add/match standard raw materials
   stdRawTemplates.forEach(std => {
     const found = existingRaw.find(p => p.code === std.code || p.name.toLowerCase() === std.name.toLowerCase());
     if (found) {
       result.push(found);
       seenCodes.add(found.id);
     } else {
       // Display standard material template ready in yard
       result.push({
         id: `std-${std.code}`,
         code: std.code,
         name: std.name,
         kind: 'raw_material',
         unit: std.unit,
         is_stocked: true,
         is_active: true,
         available_quantity: 0,
         minimum_stock: std.minimum_stock,
         isTemplate: true
       });
     }
   });

   // 2. Add other raw materials created in catalog
   existingRaw.forEach(p => {
     if (!seenCodes.has(p.id)) {
       result.push(p);
     }
   });

   return result.filter(p => matchesSearch(p) && (filter==='all'||filter==='raw_material'||status(p)===filter||(filter==='inactive'&&!p.is_active)));
 }, [catalog.products, search, filter]);

 const showBricks = filter === 'all' || filter === 'finished_brick' || ['4','5','6','8'].includes(filter) || (brickList.length > 0 && filter !== 'raw_material');
 const showRaw = filter === 'all' || filter === 'raw_material' || (rawList.length > 0 && !['4','5','6','8','finished_brick'].includes(filter));

 return (
   <div className="stock-refresh">
     <div className="stock-intro">
       <div>
         <span className="eyebrow">JM BRICKS · INVENTORY</span>
         <h2>Yard & Raw Material Stock</h2>
         <p>Finished bricks ready for sale and raw materials for daily manufacturing.</p>
       </div>
       <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
         <Button onClick={()=>open('purchase')} style={{ background: '#25744f', color: '#fff', border: 'none' }}>+ Purchase Raw Material</Button>
         <Link className="btn secondary" to="/production">Daily Production →</Link>
       </div>
     </div>

     {/* Category Filter Pills & Search */}
     <div className="toolbar" style={{ flexWrap: 'wrap', gap: '12px' }}>
       <div className="search" style={{ flex: '1 1 260px' }}>
         <Search size={18}/>
         <input aria-label="Search products" placeholder="Search brick size, cement, baby metal, dust…" value={search} onChange={e=>setSearch(e.target.value)}/>
       </div>
       <select aria-label="Filter products" value={filter} onChange={e=>setFilter(e.target.value)} style={{ minWidth: '180px' }}>
         {[['all','All Inventory'],['finished_brick','🧱 Finished Bricks Only'],['raw_material','📦 Raw Materials Only'],... [4,5,6,8].map(s=>[String(s),`${s}-inch Bricks`]),['Low Stock','⚠️ Low Stock Items'],['Out of Stock','❌ Out of Stock'],['inactive','Inactive']].map(([v,l])=><option key={v} value={v}>{l}</option>)}
       </select>
     </div>

     {/* 1. Finished Brick Stock Section */}
     {showBricks && (
       <section style={{ marginBottom: '32px' }}>
         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '2px solid #e1ebe3', paddingBottom: '8px' }}>
           <h3 style={{ margin: 0, fontSize: '18px', color: '#1a4e36', display: 'flex', alignItems: 'center', gap: '8px' }}>
             🧱 Finished Brick Stock
             <Badge tone="neutral">{brickList.length} sizes</Badge>
           </h3>
           <Link to="/production" style={{ fontSize: '13px', color: '#25744f', fontWeight: 600, textDecoration: 'none' }}>View Production History →</Link>
         </div>

         <div className="product-grid">
           {[4,5,6,8].filter(size=>!catalog.products.some(p=>Number(p.brick_size)===size)&&(filter==='all'||filter==='finished_brick'||filter===String(size))&&!search).map(size=><Card key={`missing-${size}`} className="product-card unconfigured"><div className="product-top"><span>BRICK COLLECTION</span><Badge tone="neutral">Setup needed</Badge></div><div className="brick-stage"><span className="stock-size">{size}<small>INCH</small></span><Brick/></div><h3>{size}-inch Brick</h3><div className="stock-pending"><strong>—</strong><span>Stock available after setup</span></div><Link className="stock-setup" to="/production">Configure this brick <span>↗</span></Link></Card>)}
           {brickList.map(p=>(
             <Card className="product-card" key={p.id}>
               <div className="product-top">
                 <span>{p.code}</span>
                 <Badge tone={status(p)==='In Stock'?'green':status(p)==='Low Stock'?'amber':'neutral'}>{!p.is_active?'Inactive':status(p)}</Badge>
               </div>
               <div className="brick-stage">
                 {p.brick_size&&<span className="stock-size">{p.brick_size}<small>INCH</small></span>}
                 <Brick/>
               </div>
               <h3>{p.name}</h3>
               <p>{p.length_mm} × {p.width_mm} × {p.height_mm} mm{p.size_label?` · ${p.size_label}`:''}</p>
               <div className="product-numbers">
                 <div>
                   <strong>{number(p.available_quantity)}</strong>
                   <small>Bricks available in yard</small>
                 </div>
                 <b>{currency(p.selling_price,settings.currency)}<small>selling price / brick</small></b>
               </div>
               <div className="product-footer">Minimum stock<strong>{number(p.minimum_stock)}</strong></div>
               <div className="product-footer">Stock value<strong>{p.inventory_value==null?'Unknown':currency(p.inventory_value,settings.currency)}</strong></div>
               {[['total_produced','Total produced'],['total_sold','Total sold'],['total_rejected','Rejected bricks']].map(([key,label])=><div className="product-footer" key={key}>{label}<strong>{number(p[key]||0)}</strong></div>)}
               <div className="product-buttons">
                 {p.is_stocked&&<Button variant="secondary" onClick={()=>onHistory(p)}><History size={14}/>History</Button>}
               </div>
             </Card>
           ))}
         </div>
       </section>
     )}

     {/* 2. Raw Material Stock Section */}
     {showRaw && (
       <section style={{ marginBottom: '32px' }}>
         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '2px solid #e1ebe3', paddingBottom: '8px' }}>
           <h3 style={{ margin: 0, fontSize: '18px', color: '#1a4e36', display: 'flex', alignItems: 'center', gap: '8px' }}>
             📦 Raw Material Stock
             <Badge tone="neutral">{rawList.length} materials</Badge>
           </h3>
           <Button variant="secondary" onClick={()=>open('purchase')} style={{ fontSize: '12px', padding: '6px 12px' }}>+ Purchase Stock</Button>
         </div>

         <div className="product-grid">
           {rawList.map(p=>(
             <Card className="product-card" key={p.id} style={{ borderColor: '#d3e2d6' }}>
               <div className="product-top">
                 <span>{p.code}</span>
                 <Badge tone={status(p)==='In Stock'?'green':status(p)==='Low Stock'?'amber':'neutral'}>{!p.is_active?'Inactive':status(p)}</Badge>
               </div>
               <div className="brick-stage" style={{ background: 'linear-gradient(135deg, #f0f7f2, #e3efe7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                 <Package size={64} color="#1b6641" style={{ filter: 'drop-shadow(0 8px 12px rgba(27,102,65,0.18))' }}/>
               </div>
               <h3>{p.name}</h3>
               <p style={{ textTransform: 'capitalize' }}>Unit: <strong>{p.unit === 'piece' ? 'Nos' : p.unit}</strong> · Yard Raw Material</p>
               <div className="product-numbers" style={{ background: '#eaf4ee' }}>
                 <div>
                   <strong style={{ color: '#145c38' }}>{number(p.available_quantity || 0)}</strong>
                   <small>{p.unit === 'piece' ? 'Nos' : p.unit} available in yard</small>
                 </div>
                 <b>Stock Status<small>{status(p)}</small></b>
               </div>
               <div className="product-footer">Material Code<strong>{p.code}</strong></div>
               <div className="product-footer">Minimum reserve<strong>{number(p.minimum_stock || 0)} {p.unit}</strong></div>
               <div className="product-buttons" style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                 <Button onClick={()=>open('purchase')} style={{ flex: 1, fontSize: '12px', background: '#1c6843', color: '#fff', border: 'none' }}>+ Purchase</Button>
                 {!p.isTemplate && <Button variant="secondary" onClick={()=>onHistory(p)} style={{ fontSize: '12px' }}><History size={14}/>History</Button>}
               </div>
             </Card>
           ))}
         </div>
       </section>
     )}

     {!brickList.length && !rawList.length && (
       <Card><EmptyState title="No stock items found" description="Change your search or filter to see inventory."/></Card>
     )}
   </div>
 );
}
function HistoryPage({kind,revision,catalog,settings,canWrite,owner,open,onDetail}){
 const [filters,setFilters]=useState({search:'',from:'',to:'',category:'',status:'active'}),[page,setPage]=useState(0),[result,setResult]=useState({rows:[],count:0}),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [purchaseItemsMap,setPurchaseItemsMap]=useState({});
 const change=(key,value)=>{setFilters(f=>({...f,[key]:value}));setPage(0)};
 useEffect(()=>{let alive=true;setLoading(true);setError('');const timer=setTimeout(()=>{history(kind,filters,page).then(r=>{if(alive)setResult(r)}).catch(e=>{if(alive)setError(e.message)}).finally(()=>{if(alive)setLoading(false)})},200);return()=>{alive=false;clearTimeout(timer)}},[kind,filters,page,revision]);

 useEffect(()=>{
   if(kind!=='purchases'||!result.rows.length){setPurchaseItemsMap({});return;}
   let alive=true;
   const ids=result.rows.map(r=>r.id);
   supabase.from('purchase_items').select('purchase_id,product_name,quantity,unit,description').in('purchase_id',ids).then(({data,error})=>{
     if(alive&&data&&!error){
       const map={};
       data.forEach(it=>{
         if(!map[it.purchase_id])map[it.purchase_id]=[];
         map[it.purchase_id].push(it);
       });
       setPurchaseItemsMap(map);
     }
   });
   return()=>{alive=false};
 },[kind,result.rows]);

 function getPurchaseSummary(r){
   const items=purchaseItemsMap[r.id]||[];
   if(!items.length)return{material:'Raw Material',quantity:'—'};
   const material=items.map(i=>i.product_name||i.description||'Raw Material').join(', ');
   const quantity=items.map(i=>`${i.quantity}${i.unit?` ${i.unit}`:''}`).join(', ');
   return{material,quantity};
 }

 function getPaymentBadge(r){
   const out=Number(r.outstanding_balance||0),tot=Number(r.total||0);
   if(out<=0)return <Badge tone="green">Paid</Badge>;
   if(out<tot&&out>0)return <Badge tone="amber">Partial</Badge>;
   return <Badge tone="amber">Pending</Badge>;
 }

 const f=formats[kind];
 const cols=[{key:f.date,label:'Date'},{key:f.search,label:kind==='sales'?'Customer':kind==='purchases'?'Supplier':kind==='production'?'Product':'Description'}];
 if(kind==='purchases'){
   cols.push(
     {key:'raw_material',label:'Raw Material',render:r=>getPurchaseSummary(r).material},
     {key:'quantity',label:'Quantity',render:r=>getPurchaseSummary(r).quantity}
   );
 }
 if(kind==='production')cols.push({key:'quantity_produced',label:'Produced'},{key:'rejected_quantity',label:'Rejected'},{key:'net_quantity',label:'Net quantity'});
 else cols.push({key:kind==='expenses'?'amount':'total',label:'Total',render:r=>currency(kind==='expenses'?r.amount:r.total,r.currency)});
 if(kind==='purchases')cols.push({key:'payment_status',label:'Payment',render:r=>getPaymentBadge(r)});
 if(['sales','purchases'].includes(kind))cols.push({key:'outstanding_balance',label:'Outstanding',render:r=><Badge tone={Number(r.outstanding_balance)>0?'amber':'green'}>{currency(r.outstanding_balance,r.currency)}</Badge>});
 if(kind==='expenses')cols.push({key:'category_name',label:'Category'});
 cols.push({key:'status',label:'Status',render:r=><Badge tone={r.deleted_at?'neutral':'green'}>{r.deleted_at?'Deleted':'Active'}</Badge>});
 if(owner)cols.push({key:'delete',label:'Action',render:r=>!r.deleted_at&&<Button variant="secondary" className="delete-action" onClick={()=>open(`delete_${f.operation}`,{transaction_id:r.id})}><Trash2 size={14}/>Delete</Button>});

 return (
   <>
     <div className="toolbar">
       <div className="search">
         <Search size={18}/>
         <input aria-label="Search records" placeholder={`Search ${kind==='sales'?'customers':kind==='purchases'?'suppliers':kind==='production'?'products':'descriptions'}…`} value={filters.search} onChange={e=>change('search',e.target.value)}/>
       </div>
       <Field label="From" type="date" value={filters.from} onChange={e=>change('from',e.target.value)}/>
       <Field label="To" type="date" min={filters.from} value={filters.to} onChange={e=>change('to',e.target.value)}/>
       {kind==='expenses'&&<select aria-label="Expense category" value={filters.category} onChange={e=>change('category',e.target.value)}><option value="">All categories</option>{catalog.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>}
       <select aria-label="Record status" value={filters.status} onChange={e=>change('status',e.target.value)}><option value="active">Active entries</option><option value="deleted">Deleted entries</option><option value="all">All entries</option></select>
       {canWrite&&<Button onClick={()=>open(f.operation)}><Plus size={16}/>{titles[f.operation]}</Button>}
       {kind==='expenses'&&owner&&<Button variant="secondary" onClick={()=>open('category')}>Add category</Button>}
     </div>
     <Card>
       <SectionTitle title={`${f.title} history`} subtitle={`${result.count} matching records · 25 per page`}/>
       {loading?<div className="empty" role="status">Loading records…</div>:error?<p className="auth-error" role="alert">{error}</p>:kind==='purchases'?(
         <>
           <div className="purchase-desktop-table">
             <Table rows={result.rows} columns={cols} onRow={row=>onDetail(row.id)}/>
           </div>
           <div className="purchase-mobile-cards">
             {result.rows.length===0?<EmptyState title="No purchases recorded" description="Click 'Purchase raw material' to record material purchases."/>:result.rows.map(r=>{
               const summary=getPurchaseSummary(r);
               return (
                 <div className="purchase-card" key={r.id}>
                   <div className="purchase-card-header">
                     <div>
                       <div className="purchase-card-supplier">{r.supplier_name||'Unknown supplier'}</div>
                       <div className="purchase-card-date">{r.purchase_date}{r.reference_number?` · Ref: P-${r.reference_number}`:''}</div>
                     </div>
                     <div>{getPaymentBadge(r)}</div>
                   </div>
                   <div className="purchase-card-grid">
                     <div className="purchase-card-stat full-width">
                       <span className="purchase-card-label">Raw Material</span>
                       <strong className="purchase-card-val material-pill">📦 {summary.material}</strong>
                     </div>
                     <div className="purchase-card-stat">
                       <span className="purchase-card-label">Quantity</span>
                       <strong className="purchase-card-val">{summary.quantity}</strong>
                     </div>
                     <div className="purchase-card-stat">
                       <span className="purchase-card-label">Total Amount</span>
                       <strong className="purchase-card-val total-amount">{currency(r.total,r.currency)}</strong>
                     </div>
                     {Number(r.outstanding_balance)>0&&(
                       <div className="purchase-card-stat">
                         <span className="purchase-card-label">Balance Due</span>
                         <strong className="purchase-card-val balance-due">{currency(r.outstanding_balance,r.currency)}</strong>
                       </div>
                     )}
                     <div className="purchase-card-stat">
                       <span className="purchase-card-label">Status</span>
                       <span style={{fontSize:'13px',fontWeight:600,color:r.deleted_at?'#b42318':'#2e6945'}}>{r.deleted_at?'Deleted':'Active'}</span>
                     </div>
                   </div>
                   <div className="purchase-card-actions">
                     <Button variant="secondary" onClick={()=>onDetail(r.id)}>View Details</Button>
                     {owner&&!r.deleted_at&&<Button variant="secondary" className="delete-action" onClick={()=>open(`delete_${f.operation}`,{transaction_id:r.id})}><Trash2 size={16}/>Delete</Button>}
                   </div>
                 </div>
               );
             })}
           </div>
         </>
       ):(
         <Table rows={result.rows} columns={cols} onRow={row=>onDetail(row.id)}/>
       )}
       <Pagination page={page} count={result.count} setPage={setPage}/>
     </Card>
   </>
 );
}
function Pagination({page,count,setPage}){return <div className="pagination"><Button variant="secondary" disabled={!page} onClick={()=>setPage(p=>p-1)}>Previous</Button><span>Page {page+1} of {Math.max(1,Math.ceil(count/25))}</span><Button variant="secondary" disabled={(page+1)*25>=count} onClick={()=>setPage(p=>p+1)}>Next</Button></div>}
function TransactionDetail({kind,id,catalog,settings,canWrite,owner,onClose,onPayment}){
 const [data,setData]=useState(null),[error,setError]=useState('');
 const [previousBalance,setPreviousBalance]=useState(0);
 useEffect(()=>{
  let alive=true;
  detail(kind,id).then(v=>{
    if(alive) setData(v);
    if(alive && kind==='sales' && v?.record?.customer_id){
      supabase
        .from('sales_history')
        .select('outstanding_balance, sale_date, id')
        .eq('customer_id', v.record.customer_id)
        .neq('id', v.record.id)
        .is('deleted_at', null)
        .then(({data:priorSales})=>{
          if(alive && priorSales){
            const priorTotal = priorSales
              .filter(s => s.sale_date <= v.record.sale_date)
              .reduce((sum, s) => sum + Number(s.outstanding_balance || 0), 0);
            setPreviousBalance(priorTotal);
          }
        });
    }
  }).catch(e=>{if(alive)setError(e.message)});
  return()=>{alive=false};
 },[kind,id]);

 if (kind === 'sales') {
  return (
    <Dialog title="Sales Invoice" onClose={onClose}>
      {error ? (
        <p className="auth-error" role="alert">{error}</p>
      ) : !data ? (
        <p role="status">Loading invoice details…</p>
      ) : (
        <>
          {data.record.deleted_at && (
            <div className="notice no-print">
              <strong>Deleted entry · excluded from active reports</strong>
              <p>{data.record.deletion_reason}</p>
              <small>{new Date(data.record.deleted_at).toLocaleString('en-IN')}</small>
            </div>
          )}
          <SalesInvoice
            record={data.record}
            items={data.items}
            payments={data.payments}
            catalog={catalog}
            settings={settings}
            previousBalance={previousBalance}
          />
          <div className="dialog-actions no-print" style={{ marginTop: '16px' }}>
            {owner && !data.record.deleted_at && (
              <Button variant="secondary" className="delete-action" onClick={()=>onPayment('delete_sale',{transaction_id:id})}>
                <Trash2 size={16}/> Delete Sale
              </Button>
            )}
            {canWrite && !data.record.deleted_at && Number(data.record.outstanding_balance) > 0 && (
              <Button onClick={()=>onPayment('customer_payment',{transaction_id:id,outstanding:data.record.outstanding_balance})}>
                Receive payment
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
 }

 return <Dialog title={`${formats[kind].title} details`} onClose={onClose}>{error?<p className="auth-error" role="alert">{error}</p>:!data?<p role="status">Loading transaction…</p>:<>{data.record.deleted_at&&<div className="notice"><strong>Deleted entry · excluded from active reports</strong><p>{data.record.deletion_reason}</p><small>{new Date(data.record.deleted_at).toLocaleString('en-IN')}</small></div>}<div className="receipt"><div className="receipt-head"><h2>{settings.business_name}</h2><p>{kind==='purchases'?`Purchase P-${data.record.reference_number}`:formats[kind].title}</p><p>{data.record[formats[kind].date]}</p></div><h3>{data.record[formats[kind].search]}</h3>{(data.record.customer_phone||data.record.supplier_phone)&&<p>{data.record.customer_phone||data.record.supplier_phone}</p>}{(data.record.customer_location||catalog?.customers?.find(c=>c.id===data.record.customer_id||c.name===data.record.customer_name)?.location)&&<p style={{color:'#1a6640',fontWeight:600}}>📍 {data.record.customer_location||catalog?.customers?.find(c=>c.id===data.record.customer_id||c.name===data.record.customer_name)?.location}</p>}{data.items.length>0&&<Table rows={data.items} columns={[{key:'name',label:'Product',render:r=>`${r.product_name||r.description}${r.product_code?` · ${r.product_code}`:''}`},{key:'quantity',label:'Quantity'},{key:'unit',label:'Unit price',render:r=>currency(r.unit_price??r.unit_cost,data.record.currency)},{key:'line_total',label:'Total',render:r=>currency(r.line_total,data.record.currency)}]}/ >}{kind==='production'?<dl className="review-list"><dt>Produced</dt><dd>{data.record.quantity_produced}</dd><dt>Rejected</dt><dd>{data.record.rejected_quantity}</dd><dt>Net bricks</dt><dd>{data.record.net_quantity}</dd><dt>Cost / good brick</dt><dd>{data.record.unit_cost===null?'Unknown':currency(data.record.unit_cost,settings.currency)}</dd></dl>:<dl className="review-list"><dt>Total</dt><dd>{currency(data.record.total??data.record.amount,data.record.currency)}</dd>{kind!=='expenses'&&<><dt>Paid</dt><dd>{currency(data.record.amount_received??data.record.amount_paid,data.record.currency)}</dd><dt>Outstanding</dt><dd>{currency(data.record.outstanding_balance,data.record.currency)}</dd></>}</dl>}{data.payments.length>0&&<><h3>Payments recorded</h3><Table rows={data.payments} columns={[{key:'payment_date',label:'Date'},{key:'payment_method',label:'Method'},{key:'amount',label:'Amount',render:r=>currency(r.amount,data.record.currency)}]}/></>}{data.record.notes&&<p className="receipt-notes">{data.record.notes}</p>}<p className="receipt-id">Record: {id}</p></div><div className="dialog-actions no-print">{owner&&!data.record.deleted_at&&['purchases','expenses'].includes(kind)&&<Button variant="secondary" className="delete-action" onClick={()=>onPayment(`delete_${formats[kind].operation}`,{transaction_id:id})}><Trash2 size={16}/>Delete</Button>}{['purchases'].includes(kind)&&canWrite&&!data.record.deleted_at&&Number(data.record.outstanding_balance)>0&&<Button onClick={()=>onPayment('supplier_payment',{transaction_id:id,outstanding:data.record.outstanding_balance})}>Pay supplier</Button>}</div></>}</Dialog>;
}
function MovementHistory({product,onClose}){
 const [page,setPage]=useState(0),[result,setResult]=useState({rows:[],count:0}),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let alive=true;setLoading(true);movements(product.id,page).then(r=>{if(alive)setResult(r)}).catch(e=>{if(alive)setError(e.message)}).finally(()=>{if(alive)setLoading(false)});return()=>{alive=false}},[product.id,page]);
 return <Dialog title={`Stock history · ${product.code}`} onClose={onClose}><p>{product.name} · {product.unit}</p>{loading?<p role="status">Loading movements…</p>:error?<p role="alert" className="auth-error">{error}</p>:<Table rows={result.rows} columns={[{key:'movement_date',label:'Date'},{key:'movement_type',label:'Source'},{key:'quantity_change',label:'Change'},{key:'balance_after',label:'Balance'},{key:'reason',label:'Reason'}]}/>}<Pagination page={page} count={result.count} setPage={setPage}/><p className="help">History is read-only. Corrections require a new authorized adjustment.</p></Dialog>;
}
