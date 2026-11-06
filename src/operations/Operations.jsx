import React,{useEffect,useRef,useState} from 'react';
import {useLocation,useNavigate,Link} from 'react-router-dom';
import {Plus,Search,RefreshCw,History,Package,Factory,Wallet,ShoppingBag,ShoppingCart,Printer,Trash2,Eye,Edit3,MessageCircle} from 'lucide-react';
import {Button,Card,Badge,EmptyState,Field,SectionTitle,Table,Dialog,Brick,number} from '../components';
import {supabase} from '../lib/supabase';
import {catalog as loadCatalog,history,formats,detail,movements,currency,today,execute,updateSaleBill} from './api';
import {parseDeliveryLocations,formatWhatsAppInvoiceMessage} from './locationHelpers';
import {shareInvoiceViaWhatsApp,downloadBlob} from './pdfInvoiceGenerator.js';
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
      if(!err.uncertain || err.message?.includes('permission denied')){clearPending();setModal({kind:request.kind,initial:request.payload});}
      setSaveError(err.message);
    }finally{lock.current=false;setBusy(false);}
  }
  async function submit(kind,payload){
    if (kind === 'edit_sale') {
      if (lock.current) return;
      lock.current = true;
      setBusy(true);
      setSaveError('');
      try {
        const result = await updateSaleBill({
          saleId: payload.saleId,
          payload,
          originalSale: payload.originalSale,
          catalog,
          currentUserId: profile.id
        });
        clearPending();
        setModal(null);
        setMessage(`Sales Bill #${result.receipt_number} updated successfully.`);
        setRevision(v => v + 1);
        setSelected({ kind: 'sales', id: result.id });
      } catch (err) {
        setSaveError(err.message || 'Unable to update sales bill.');
      } finally {
        lock.current = false;
        setBusy(false);
      }
      return;
    }
    if(lock.current||pending)return;
    const request={id:crypto.randomUUID(),kind,payload:{...payload,currency:settings.currency}};
    try{sessionStorage.setItem(storageKey,JSON.stringify(request));}
    catch{setSaveError('Allow session storage so interrupted submissions can be retried safely. Nothing has been sent.');return;}
    setPending(request);await send(request);
  }
  async function handleStartEditSale(saleId) {
    if (busy) return;
    setBusy(true);
    setSaveError('');
    try {
      const saleData = await detail('sales', saleId);
      if (!saleData || !saleData.record) throw new Error('Sale record could not be loaded.');

      const { userNotes, primaryLocation, extraLocations } = parseDeliveryLocations(saleData.record.notes || '');

      setModal({
        kind: 'edit_sale',
        initial: {
          isEditMode: true,
          saleId: saleData.record.id,
          receiptNumber: saleData.record.receipt_number,
          date: saleData.record.sale_date,
          contact_id: saleData.record.customer_id,
          customer_name: saleData.record.customer_name,
          customer_phone: saleData.record.customer_phone,
          customerLocation: primaryLocation || '',
          deliveryLocation: primaryLocation || '',
          extraLocations: extraLocations || [],
          discount: saleData.record.discount != null ? String(saleData.record.discount) : '0',
          paid: saleData.payments?.[0]?.amount != null ? String(saleData.payments[0].amount) : (saleData.record.amount_received != null ? String(saleData.record.amount_received) : '0'),
          payment_method: saleData.payments?.[0]?.payment_method || 'cash',
          notes: userNotes,
          items: (saleData.items || []).map(i => ({
            product_id: i.product_id,
            quantity: String(i.quantity),
            price: String(i.unit_price)
          })),
          originalSale: saleData
        }
      });
    } catch (err) {
      setSaveError(err.message || 'Unable to load sale details for editing.');
    } finally {
      setBusy(false);
    }
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
    {formats[page]&&page!=='production'&&<HistoryPage key={page} kind={page} revision={revision} catalog={catalog} settings={settings} canWrite={canWrite} owner={owner} open={open} onDetail={id=>setSelected({kind:page,id})} onEditSale={handleStartEditSale}/>}
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
    {pending&&<Dialog title="Submission status" onClose={clearPending}><p>{busy?'Saving your entry…':'This entry needs confirmation. Keep its request ID and retry the original submission if the connection was interrupted.'}</p><div className="notice">{titles[pending.kind]}<br/>Request: {pending.id}</div>{saveError&&<div className="auth-error" role="alert">{saveError}</div>}<div className="dialog-actions"><Button variant="secondary" onClick={clearPending}>Dismiss</Button><Button variant="secondary" disabled={busy} onClick={checkPending}>Check saved status</Button><Button disabled={busy} onClick={()=>send(pending)}>{busy?'Please wait…':'Retry original entry'}</Button></div></Dialog>}
    {selected&&!modal&&!pending&&<TransactionDetail key={`${selected.kind}-${selected.id}-${revision}`} {...selected} catalog={catalog} settings={settings} canWrite={canWrite} owner={owner} onClose={()=>setSelected(null)} onPayment={open} onEditSale={handleStartEditSale}/>}
    {stockHistory&&!modal&&!pending&&<MovementHistory product={stockHistory} onClose={()=>setStockHistory(null)}/>}
  </>;
}
function StockPage({catalog,settings,owner,open,onHistory}){
 const [search,setSearch]=useState(''),[filter,setFilter]=useState('all');
 const status=p=>!p.is_stocked?'Not tracked':Number(p.available_quantity)===0?'Out of Stock':Number(p.available_quantity)<=Number(p.minimum_stock)?'Low Stock':'In Stock';
 const list=catalog.products.filter(p=>`${p.name} ${p.code} ${p.size_label||''}`.toLowerCase().includes(search.toLowerCase())&&(filter==='all'||filter==='inactive'&&!p.is_active||filter==='finished_brick'&&p.kind===filter||filter==='raw_material'&&p.kind===filter||String(p.brick_size)===filter||status(p)===filter));

 // 1. Maintain only ONE unique stock entry per brick size (removes duplicate 4-inch entries)
 const seenSizes = new Set();
 const brickList = list
   .filter(p => p.kind === 'finished_brick')
   .filter(p => {
     const sizeKey = p.brick_size != null ? String(p.brick_size) : (p.name || p.id);
     if (seenSizes.has(sizeKey)) return false;
     seenSizes.add(sizeKey);
     return true;
   });

 // 2. Simplify Raw Material Stock: Display ONLY CEMENT (exclude sand, baby metal, etc.)
 const rawList = list.filter(p => p.kind === 'raw_material' && (
   p.name.toLowerCase().includes('cement') || (p.code && p.code.toLowerCase().includes('cement'))
 ));

 const showBricks = filter === 'all' || filter === 'finished_brick' || ['4','5','6','8'].includes(filter) || brickList.length > 0;
 const showRaw = filter === 'all' || filter === 'raw_material' || rawList.length > 0;

 function renderCard(p) {
   const isCement = p.kind === 'raw_material' && (p.name.toLowerCase().includes('cement') || (p.code && p.code.toLowerCase().includes('cement')));
   return (
     <Card className="product-card" key={p.id}>
       <div className="product-top">
         <span>{p.code}</span>
         <Badge tone={status(p)==='In Stock'?'green':status(p)==='Low Stock'?'amber':'neutral'}>{!p.is_active?'Inactive':status(p)}</Badge>
       </div>
       <div className="brick-stage">
         {p.brick_size&&<span className="stock-size">{p.brick_size}<small>INCH</small></span>}
         {p.kind==='finished_brick'?<Brick/>:<Package size={68} color="#2b6b47"/>}
       </div>
       <h3>{p.name}</h3>
       <p>{p.kind==='finished_brick'?`${p.length_mm} × ${p.width_mm} × ${p.height_mm} mm`:isCement ? 'Standard 50kg Bags' : p.unit}{p.size_label?` · ${p.size_label}`:''}</p>
       <div className="product-numbers">
         <div>
           <strong>{p.is_stocked?number(p.available_quantity):'—'}</strong>
           <small>{p.is_stocked ? (isCement ? 'Bags in stock' : `${p.unit} in stock`) : 'Not stocked'}</small>
         </div>
         {p.kind==='finished_brick'?(
           <b>{currency(p.selling_price,settings.currency)}<small>selling price / {p.unit}</small></b>
         ):(
           <b>Raw Material<small>For brick production</small></b>
         )}
       </div>
       <div className="product-footer">Minimum stock<strong>{number(p.minimum_stock)} {isCement ? 'Bags' : p.unit}</strong></div>
       <div className="product-footer">Stock value<strong>{p.inventory_value==null?'Unknown':currency(p.inventory_value,settings.currency)}</strong></div>
       {p.kind==='finished_brick'?(
         <>
           {[['total_produced','Total production'],['total_sold','Total sold'],['total_rejected','Rejected bricks'],['other_stock_change','Other receipts / adjustments']].map(([key,label])=><div className="product-footer" key={key}>{label}<strong>{number(p[key]||0)}</strong></div>)}
           <div className="product-footer">Last production<strong>{displayDate(p.last_production_date)}</strong></div>
         </>
       ):(
         isCement ? (
           <>
             <div className="product-footer">Total Purchased<strong>{number(p.total_purchased ?? 0)} Bags</strong></div>
             <div className="product-footer">Consumed in Production<strong style={{ color: '#b54708' }}>−{number(p.total_consumed || 0)} Bags</strong></div>
           </>
         ) : (
           <>
             <div className="product-footer">Total Purchased<strong>{number(p.total_purchased ?? 0)} {p.unit}</strong></div>
             {Number(p.total_consumed || 0) > 0 && (
               <div className="product-footer">Consumed in Production<strong style={{ color: '#b54708' }}>−{number(p.total_consumed || 0)} {p.unit}</strong></div>
             )}
           </>
         )
       )}
       <div className="product-buttons">
         {p.is_stocked&&<Button variant="secondary" onClick={()=>onHistory(p)}><History size={14}/>History</Button>}
       </div>
     </Card>
   );
 }

 return (
   <div className="stock-refresh">
     <div className="stock-intro">
       <div>
         <span className="eyebrow">JM BRICKS · INVENTORY</span>
         <h2>Your yard & raw materials at a glance.</h2>
         <p>Finished bricks and manufacturing materials ready for daily production.</p>
       </div>
       <Link className="btn secondary" to="/production">Go to Production →</Link>
     </div>
     <div className="toolbar">
       <div className="search">
         <Search size={18}/>
         <input aria-label="Search products" placeholder="Search product name, code or raw material…" value={search} onChange={e=>setSearch(e.target.value)}/>
       </div>
       <select aria-label="Filter products" value={filter} onChange={e=>setFilter(e.target.value)}>
         {[['all','All inventory'],... [4,5,6,8].map(s=>[String(s),`${s}-inch bricks`]),['finished_brick','Finished bricks only'],['raw_material','Cement stock only'],['Low Stock','Low Stock'],['Out of Stock','Out of Stock'],['inactive','Inactive']].map(([v,l])=><option key={v} value={v}>{l}</option>)}
       </select>
     </div>
     <div className="stock-layout">
       <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
         {/* 1. Finished Brick Stock Section */}
         {showBricks && (
           <div className="stock-section">
             <SectionTitle title="Finished Brick Stock" subtitle="Finished bricks ready for sale" />
             <div className="product-grid" style={{ marginTop: '12px' }}>
               {[4,5,6,8].filter(size=>!catalog.products.some(p=>Number(p.brick_size)===size)&&(filter==='all'||filter==='finished_brick'||filter===String(size))&&!search).map(size=><Card key={`missing-${size}`} className="product-card unconfigured"><div className="product-top"><span>BRICK COLLECTION</span><Badge tone="neutral">Setup needed</Badge></div><div className="brick-stage"><span className="stock-size">{size}<small>INCH</small></span><Brick/></div><h3>{size}-inch Brick</h3><div className="stock-pending"><strong>—</strong><span>Stock available after setup</span></div><Link className="stock-setup" to="/production">Configure this brick <span>↗</span></Link></Card>)}
               {brickList.map(renderCard)}
               {brickList.length === 0 && !search && filter === 'finished_brick' && (
                 <Card style={{ gridColumn: '1 / -1' }}><EmptyState title="No finished bricks found" description="No finished brick products match the selected filter."/></Card>
               )}
             </div>
           </div>
         )}

         {/* 2. Raw Material Stock Section (ONLY CEMENT) */}
         {showRaw && (
           <div className="stock-section">
             <SectionTitle title="Raw Material Stock (Cement)" subtitle="Cement stock ready for daily brick production" />
             <div className="product-grid" style={{ marginTop: '12px' }}>
               {rawList.map(renderCard)}
               {rawList.length === 0 && (
                 <Card style={{ gridColumn: '1 / -1' }}>
                   <EmptyState
                     title="No cement stock records found"
                     description="No cement stock records are currently tracked in your products inventory."
                   />
                 </Card>
               )}
             </div>
           </div>
         )}

         {list.length === 0 && catalog.products.length > 0 && search && (
           <Card><EmptyState title="No items found" description="No products or materials matched your search."/></Card>
         )}
       </div>
       <Card className="inventory-aside">
         <span className="eyebrow">YOUR STOCK, CLEARLY</span>
         <Brick/>
         <h2>Every brick.<br/>Every material.</h2>
         <p>Purchases add raw materials (Cement, M-Sand, P-Sand, Dust). Daily production converts materials into finished bricks. Sales deliver finished bricks.</p>
         <div className="inventory-tip">
           <div>
             <strong>Opening balances & corrections</strong>
             <p>Use an owner-authorized adjustment with a reason. Stock entries must not predate the latest movement for that product.</p>
           </div>
         </div>
         <p>Maintain accurate raw material stocks to easily plan upcoming production runs.</p>
       </Card>
     </div>
   </div>
 );
}
export function formatPurchaseUnit(unit, quantity) {
  if (!unit) return '';
  const u = String(unit).trim().toLowerCase();
  const num = Number(quantity);
  const isPlural = !isNaN(num) && num !== 1;

  if (u === 'bag' || u === 'bags') return isPlural ? 'Bags' : 'Bag';
  if (u === 'load' || u === 'loads') return isPlural ? 'Loads' : 'Load';
  if (u === 'tonne' || u === 'ton' || u === 'tons') return isPlural ? 'Tons' : 'Ton';
  if (u === 'kg' || u === 'kgs') return 'Kg';
  if (u === 'litre' || u === 'liter' || u === 'litres' || u === 'liters') return isPlural ? 'Liters' : 'Liter';
  if (u === 'piece' || u === 'pieces' || u === 'nos' || u === 'no') return isPlural ? 'Nos' : 'No';
  if (u === 'brick' || u === 'bricks') return isPlural ? 'Bricks' : 'Brick';
  return u.charAt(0).toUpperCase() + u.slice(1);
}

function HistoryPage({kind,revision,catalog,settings,canWrite,owner,open,onDetail,onEditSale}){
 const [filters,setFilters]=useState({search:'',from:'',to:'',category:'',status:'active'}),[page,setPage]=useState(0),[result,setResult]=useState({rows:[],count:0}),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [purchaseItemsMap,setPurchaseItemsMap]=useState({});
 const change=(key,value)=>{setFilters(f=>({...f,[key]:value}));setPage(0)};
 useEffect(()=>{let alive=true;setLoading(true);setError('');const timer=setTimeout(()=>{history(kind,filters,page).then(r=>{if(alive)setResult(r)}).catch(e=>{if(alive)setError(e.message)}).finally(()=>{if(alive)setLoading(false)})},200);return()=>{alive=false;clearTimeout(timer)}},[kind,filters,page,revision]);

 useEffect(()=>{
   if(kind!=='purchases'||!result.rows.length){setPurchaseItemsMap({});return;}
   let alive=true;
   const ids=result.rows.map(r=>r.id);
   supabase
     .from('purchase_items')
     .select('purchase_id,product_id,description,quantity,unit,product_code,products(id,name,unit)')
     .in('purchase_id',ids)
     .then(({data,error})=>{
       if(error){
         return supabase
           .from('purchase_items')
           .select('purchase_id,product_id,description,quantity,unit,product_code')
           .in('purchase_id',ids);
       }
       return {data, error: null};
     })
     .then(({data,error})=>{
       if(alive&&data&&!error){
         const map={};
         data.forEach(it=>{
           if(!map[it.purchase_id])map[it.purchase_id]=[];
           map[it.purchase_id].push(it);
         });
         setPurchaseItemsMap(map);
       }
     })
     .catch(()=>{});
   return()=>{alive=false};
 },[kind,result.rows]);

 function getPurchaseSummary(r){
   const items=purchaseItemsMap[r.id]||[];
   if(!items.length)return{material:'—',quantity:'—'};
   const material=items
     .map(i=>i.products?.name || catalog?.products?.find(p=>p.id===i.product_id)?.name || i.description || i.product_code || '')
     .filter(Boolean)
     .join(', ') || '—';
   const quantity=items
     .map(i=>{
       if(i.quantity==null || i.quantity==='') return '—';
       const u = i.unit || i.products?.unit || catalog?.products?.find(p=>p.id===i.product_id)?.unit || '';
       const unitLabel = formatPurchaseUnit(u, i.quantity);
       return unitLabel ? `${i.quantity} ${unitLabel}` : `${i.quantity}`;
     })
     .filter(Boolean)
     .join(', ') || '—';
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
 if(kind==='sales'){
  cols.push({
    key:'actions',
    label:'Actions',
    render:r=>!r.deleted_at&&(
      <div style={{display:'inline-flex',gap:'6px',alignItems:'center'}} onClick={e=>e.stopPropagation()}>
        <Button variant="secondary" title="View Bill" onClick={()=>onDetail(r.id)}>
          <Eye size={14}/>View
        </Button>
        {canWrite&&(
          <Button variant="secondary" title="Edit Bill" onClick={()=>onEditSale?.(r.id)}>
            <Edit3 size={14}/>Edit
          </Button>
        )}
        {owner&&(
          <Button variant="secondary" className="delete-action" title="Delete Bill" onClick={()=>open(`delete_${f.operation}`,{transaction_id:r.id})}>
            <Trash2 size={14}/>Delete
          </Button>
        )}
      </div>
    )
  });
 }else if(owner){
  cols.push({key:'delete',label:'Action',render:r=>!r.deleted_at&&<Button variant="secondary" className="delete-action" onClick={()=>open(`delete_${f.operation}`,{transaction_id:r.id})}><Trash2 size={14}/>Delete</Button>});
 }

 return (
   <>
     <div className="toolbar filter-toolbar">
       <div className="filter-date-row">
         <Field label="From Date" type="date" value={filters.from} onChange={e=>change('from',e.target.value)}/>
         <Field label="To Date" type="date" min={filters.from} value={filters.to} onChange={e=>change('to',e.target.value)}/>
       </div>
       <div className="filter-action-row">
         <div className="search">
           <Search size={18}/>
           <input aria-label="Search records" placeholder={`Search ${kind==='sales'?'customers':kind==='purchases'?'suppliers':kind==='production'?'products':'descriptions'}…`} value={filters.search} onChange={e=>change('search',e.target.value)}/>
         </div>
         {kind==='expenses'&&<select aria-label="Expense category" value={filters.category} onChange={e=>change('category',e.target.value)}><option value="">All categories</option>{catalog.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>}
         <select aria-label="Record status" value={filters.status} onChange={e=>change('status',e.target.value)}><option value="active">Active entries</option><option value="deleted">Deleted entries</option><option value="all">All entries</option></select>
         {canWrite&&<Button onClick={()=>open(f.operation)}><Plus size={16}/>{titles[f.operation]}</Button>}
         {kind==='expenses'&&owner&&<Button variant="secondary" onClick={()=>open('category')}>Add category</Button>}
       </div>
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
function TransactionDetail({kind,id,catalog,settings,canWrite,owner,onClose,onPayment,onEditSale}){
 const [data,setData]=useState(null),[error,setError]=useState('');
 const [previousBalance,setPreviousBalance]=useState(0);
 const [pdfBusy,setPdfBusy]=useState(false);
 const [desktopPrompt,setDesktopPrompt]=useState(null);
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
            {canWrite && !data.record.deleted_at && (
              <Button variant="secondary" onClick={()=>{ onClose(); onEditSale?.(id); }}>
                <Edit3 size={16}/> Edit Bill
              </Button>
            )}
            {data && !data.record.deleted_at && (
              <Button
                variant="secondary"
                disabled={pdfBusy}
                onClick={async () => {
                  setPdfBusy(true);
                  try {
                    const { userNotes, primaryLocation, extraLocations } = parseDeliveryLocations(data.record.notes || '');
                    await shareInvoiceViaWhatsApp({
                      record: data.record,
                      items: data.items,
                      payments: data.payments,
                      customerName: data.record.customer_name,
                      customerPhone: data.record.customer_phone,
                      customerLocation: data.record.customer_location,
                      primaryLocation,
                      extraLocations,
                      cleanNotes: userNotes,
                      subtotal: data.record.subtotal,
                      discount: data.record.discount,
                      grandTotal: data.record.total,
                      amountPaid: data.record.amount_received,
                      outstanding: data.record.outstanding_balance,
                      catalog,
                      settings
                    }, (prompt) => setDesktopPrompt(prompt));
                  } catch (err) {
                    console.error('WhatsApp PDF share error:', err);
                    const { shareUrl } = formatWhatsAppInvoiceMessage({
                      record: data.record,
                      items: data.items,
                      customerName: data.record.customer_name,
                      customerPhone: data.record.customer_phone,
                      subtotal: data.record.subtotal,
                      discount: data.record.discount,
                      grandTotal: data.record.total,
                      amountPaid: data.record.amount_received,
                      outstanding: data.record.outstanding_balance,
                      catalog
                    });
                    window.open(shareUrl, '_blank', 'noopener,noreferrer');
                  } finally {
                    setPdfBusy(false);
                  }
                }}
                style={{ color: '#128c7e', borderColor: '#25d36650', background: '#eafaf1' }}
              >
                <MessageCircle size={16} color="#25d366" /> {pdfBusy ? 'Generating PDF…' : 'WhatsApp'}
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
          {desktopPrompt && (
            <Dialog title="Share Invoice on WhatsApp" onClose={() => setDesktopPrompt(null)}>
              <div style={{ padding: '4px 0' }}>
                <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                  <div style={{ fontSize: '38px', marginBottom: '8px' }}>📄</div>
                  <h3 style={{ margin: '0 0 6px', color: '#132e1e', fontSize: '17px' }}>
                    {desktopPrompt.fileName} Downloaded
                  </h3>
                  <p style={{ margin: 0, color: '#687e70', fontSize: '13px' }}>
                    The official PDF invoice has been downloaded to your computer.
                  </p>
                </div>
                <div style={{ background: '#f4f9f5', border: '1px solid #d5e5da', borderRadius: '8px', padding: '14px', marginBottom: '18px', fontSize: '13px' }}>
                  <p style={{ margin: '0 0 6px', fontWeight: 700, color: '#1a6640', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MessageCircle size={16} color="#25d366" /> WhatsApp Web is opening for:
                  </p>
                  <p style={{ margin: '0 0 6px', color: '#132e1e' }}>
                    <strong>Customer:</strong> {desktopPrompt.customerName} {desktopPrompt.customerPhone ? `(${desktopPrompt.customerPhone})` : ''}
                  </p>
                  <p style={{ margin: 0, color: '#354d3e', fontSize: '12.5px', lineHeight: 1.5 }}>
                    👉 In the opened WhatsApp Web tab, click the <strong>attach (📎)</strong> icon, choose <strong>Document</strong>, and select <strong>{desktopPrompt.fileName}</strong> to send.
                  </p>
                </div>
                <div className="dialog-actions">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => downloadBlob(desktopPrompt.pdfBlob, desktopPrompt.fileName)}
                  >
                    Download PDF Again
                  </Button>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => window.open(desktopPrompt.waUrl, '_blank', 'noopener,noreferrer')}
                    style={{ color: '#128c7e', borderColor: '#25d36650', background: '#eafaf1' }}
                  >
                    <MessageCircle size={15} color="#25d366" /> Open WhatsApp Web
                  </Button>
                  <Button type="button" onClick={() => setDesktopPrompt(null)}>
                    Done
                  </Button>
                </div>
              </div>
            </Dialog>
          )}
        </>
      )}
    </Dialog>
  );
 }

 return <Dialog title={`${formats[kind].title} details`} onClose={onClose}>{error?<p className="auth-error" role="alert">{error}</p>:!data?<p role="status">Loading transaction…</p>:<>{data.record.deleted_at&&<div className="notice"><strong>Deleted entry · excluded from active reports</strong><p>{data.record.deletion_reason}</p><small>{new Date(data.record.deleted_at).toLocaleString('en-IN')}</small></div>}<div className="receipt"><div className="receipt-head"><h2>{settings.business_name}</h2><p>{kind==='purchases'?`Purchase P-${data.record.reference_number}`:formats[kind].title}</p><p>{data.record[formats[kind].date]}</p></div><h3>{data.record[formats[kind].search]}</h3>{(data.record.customer_phone||data.record.supplier_phone)&&<p>{data.record.customer_phone||data.record.supplier_phone}</p>}{(data.record.customer_location||catalog?.customers?.find(c=>c.id===data.record.customer_id||c.name===data.record.customer_name)?.location)&&<p style={{color:'#1a6640',fontWeight:600}}>📍 {data.record.customer_location||catalog?.customers?.find(c=>c.id===data.record.customer_id||c.name===data.record.customer_name)?.location}</p>}{data.items.length>0&&<Table rows={data.items} columns={[{key:'name',label:kind==='purchases'?'Raw Material':'Product',render:r=>`${r.description||r.product_name||r.products?.name||(kind==='purchases'?'Raw Material':'Product')}${r.product_code?` · ${r.product_code}`:''}`},{key:'quantity',label:'Quantity',render:r=>r.quantity!=null?`${r.quantity}${r.unit?` ${formatPurchaseUnit(r.unit,r.quantity)}`:''}`:'—'},{key:'unit',label:'Unit price',render:r=>currency(r.unit_price??r.unit_cost,data.record.currency)},{key:'line_total',label:'Total',render:r=>currency(r.line_total,data.record.currency)}]}/>}{kind==='production'?<dl className="review-list"><dt>Produced</dt><dd>{data.record.quantity_produced}</dd><dt>Rejected</dt><dd>{data.record.rejected_quantity}</dd><dt>Net bricks</dt><dd>{data.record.net_quantity}</dd><dt>Cost / good brick</dt><dd>{data.record.unit_cost===null?'Unknown':currency(data.record.unit_cost,settings.currency)}</dd></dl>:<dl className="review-list"><dt>Total</dt><dd>{currency(data.record.total??data.record.amount,data.record.currency)}</dd>{kind!=='expenses'&&<><dt>Paid</dt><dd>{currency(data.record.amount_received??data.record.amount_paid,data.record.currency)}</dd><dt>Outstanding</dt><dd>{currency(data.record.outstanding_balance,data.record.currency)}</dd></>}</dl>}{data.payments.length>0&&<><h3>Payments recorded</h3><Table rows={data.payments} columns={[{key:'payment_date',label:'Date'},{key:'payment_method',label:'Method'},{key:'amount',label:'Amount',render:r=>currency(r.amount,data.record.currency)}]}/></>}{data.record.notes&&<p className="receipt-notes">{data.record.notes}</p>}<p className="receipt-id">Record: {id}</p></div><div className="dialog-actions no-print">{owner&&!data.record.deleted_at&&['purchases','expenses'].includes(kind)&&<Button variant="secondary" className="delete-action" onClick={()=>onPayment(`delete_${formats[kind].operation}`,{transaction_id:id})}><Trash2 size={16}/>Delete</Button>}{['purchases'].includes(kind)&&canWrite&&!data.record.deleted_at&&Number(data.record.outstanding_balance)>0&&<Button onClick={()=>onPayment('supplier_payment',{transaction_id:id,outstanding:data.record.outstanding_balance})}>Pay supplier</Button>}</div></>}</Dialog>;
}
function MovementHistory({product,onClose}){
 const [page,setPage]=useState(0),[result,setResult]=useState({rows:[],count:0}),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let alive=true;setLoading(true);movements(product.id,page).then(r=>{if(alive)setResult(r)}).catch(e=>{if(alive)setError(e.message)}).finally(()=>{if(alive)setLoading(false)});return()=>{alive=false}},[product.id,page]);
 return <Dialog title={`Stock history · ${product.code}`} onClose={onClose}><p>{product.name} · {product.unit}</p>{loading?<p role="status">Loading movements…</p>:error?<p role="alert" className="auth-error">{error}</p>:<Table rows={result.rows} columns={[{key:'movement_date',label:'Date'},{key:'movement_type',label:'Source'},{key:'quantity_change',label:'Change'},{key:'balance_after',label:'Balance'},{key:'reason',label:'Reason'}]}/>}<Pagination page={page} count={result.count} setPage={setPage}/><p className="help">History is read-only. Corrections require a new authorized adjustment.</p></Dialog>;
}
