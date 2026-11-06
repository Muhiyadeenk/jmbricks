import React,{useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {BarChart,Bar,XAxis,YAxis,CartesianGrid,Tooltip,ResponsiveContainer,Legend} from 'recharts';
import {ShoppingBag,Wallet,Package,Users,Truck,AlertTriangle,Download,Printer} from 'lucide-react';
import {Button,Card,SectionTitle,StatCard,Table,Field,EmptyState,Dialog} from '../components';
import {supabase} from '../lib/supabase';
import {today,currency} from './api';
import {groupSales,shiftDate,downloadCsv} from './reporting';
const definitions={daily:['Daily sales',[['date','Date'],['revenue','Revenue'],['collected','Cash collected']]],weekly:['Weekly sales',[['date','Week starting Monday'],['revenue','Revenue'],['collected','Cash collected']]],monthly:['Monthly sales',[['date','Month'],['revenue','Revenue'],['collected','Cash collected']]],products:['Sales by brick product',[['code','Code'],['name','Product'],['size_label','Size'],['quantity','Bricks sold'],['revenue','Net revenue']]],purchases:['Purchases by supplier',[['name','Supplier'],['transactions','Purchases'],['amount','Purchase value']]],production:['Production',[['code','Code'],['name','Product'],['produced','Produced'],['rejected','Rejected'],['net','Good bricks'],['cement_used','Cement Used (Bags)']]],stock:['Stock at period end',[['code','Code'],['name','Product'],['unit','Unit'],['quantity','Available'],['minimum_stock','Minimum'],['value','Inventory value']]],expenses:['Expenses by category',[['category','Category'],['amount','Recorded amount']]],customers:['Customer balances at period end',[['name','Customer'],['balance','Outstanding']]],suppliers:['Supplier balances at period end',[['name','Supplier'],['balance','Outstanding']]],costs:['Cost review',[['date','Date'],['source','Source'],['description','Description'],['amount','Amount'],['treatment','Treatment'],['reason','Review reason']]],profit:['Estimated profit',[['metric','Measure'],['amount','Amount']]]};
const monetary=new Set(['revenue','collected','amount','balance','value','total']);
function useSnapshot(from,to,revision,previewLoader){const [state,setState]=useState({data:null,loading:true,error:''});useEffect(()=>{let active=true;setState({data:null,loading:true,error:''});(previewLoader?Promise.resolve().then(()=>({data:previewLoader(from,to)})):supabase.rpc('report_snapshot',{p_from:from,p_to:to})).then(({data,error})=>{if(active)setState({data,error:error?.message||'',loading:false})}).catch(e=>{if(active)setState({data:null,error:e.message,loading:false})});return()=>{active=false}},[from,to,revision,previewLoader]);return state;}
function SnapshotState({state}){if(state.loading)return <Card><p role="status">Calculating reports…</p></Card>;if(state.error)return <Card><p role="alert" className="auth-error">{state.error}</p><p>Check your connection and apply the Phase 4 migration. Use Refresh to try again.</p></Card>;return null;}
function Chart({rows,settings,title}){return <Card><SectionTitle title={title} subtitle={`Revenue and cash collected · ${settings.currency}`}/>{rows.some(r=>Number(r.revenue)||Number(r.collected))?<div className="report-chart" role="img" aria-label={`${title}. Exact amounts are available in Reports.`}><ResponsiveContainer width="100%" height={260}><BarChart data={rows}><CartesianGrid vertical={false} stroke="#edf0ed"/><XAxis dataKey="date" tick={{fontSize:11}} minTickGap={20}/><YAxis tick={{fontSize:11}} width={65}/><Tooltip formatter={v=>currency(v,settings.currency)}/><Legend/><Bar name="Revenue" dataKey="revenue" fill="#23754d" radius={[3,3,0,0]}/><Bar name="Cash collected" dataKey="collected" fill="#acc7b5" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer></div>:<EmptyState title="No sales or payments in this period" description="Your chart will appear when transactions are recorded." action={<Link className="btn secondary" to="/sales">Open sales</Link>}/>}</Card>}
function ReportTable({rows,columns,settings,onRow}){
  return <Table rows={rows.map((r,i)=>({...r,id:r.id||i}))} columns={columns.map(([key,label])=>({key,label,render:r=>{
    const val=r?.[key];
    if(val==null)return key==='cement_used'?'—':'Unknown';
    if(monetary.has(key))return currency(val,settings.currency);
    if(key==='cement_used'){
      const num=Number(val);
      return Number.isFinite(num)?num.toLocaleString():String(val);
    }
    return val;
  }}))} onRow={onRow}/>;
}
export function LiveDashboard({settings,revision,onDetail}){
 const end=today(settings.timezone),monthStart=end.slice(0,7)+'-01';const startDate=new Date(`${monthStart}T00:00:00Z`);startDate.setUTCMonth(startDate.getUTCMonth()-5);
 const state=useSnapshot(startDate.toISOString().slice(0,10),end,revision);
 if(!state.data)return <SnapshotState state={state}/>;
 const d=state.data,s=d.summary,day=d.daily.find(r=>r.date===end);const week=d.daily.filter(r=>r.date>=shiftDate(end,-6));
 // Expenses for today are returned from the same snapshot's dated cost records.
 const expenseToday=d.costs.filter(r=>r.source==='expense'&&r.date===end).reduce((sum,r)=>sum+Math.round(Number(r.amount)*100),0)/100;
 return <><div className="stats-grid report-stats">{[["Today's sales",currency(day?.revenue,settings.currency),ShoppingBag,'Net of discounts'],["Today's expenses",currency(expenseToday,settings.currency),Wallet,'Recorded operating expense entries'],['Available bricks',Number(s.bricks).toLocaleString(),Package,'Finished bricks; materials shown separately'],['Customers owe',currency(s.customer_due,settings.currency),Users,'All unpaid sales through today'],['Suppliers owed',currency(s.supplier_due,settings.currency),Truck,'All unpaid purchases through today'],['Low-stock alerts',s.low_stock,AlertTriangle,'Active inventory at or below minimum']].map(([label,value,icon,foot])=><StatCard key={label} {...{label,value,icon,foot}}/>)}</div><div className="connection-grid"><Chart rows={week} settings={settings} title="Weekly sales · last 7 days"/><Chart rows={groupSales(d.daily,'monthly')} settings={settings} title="Monthly sales · last 6 months"/></div><div className="connection-grid">{[['recent_sales','Recent sales','sales'],['recent_purchases','Recent purchases','purchases']].map(([key,title,kind])=><Card key={key}><SectionTitle title={title} action={<Link className="text-link" to={`/${kind}`}>View all</Link>}/><ReportTable rows={d[key]} settings={settings} columns={ [['date','Date'],['name',kind==='sales'?'Customer':'Supplier'],['total','Total']]} onRow={r=>onDetail({kind,id:r.id})}/></Card>)}</div><Card><SectionTitle title="Stock by brick product" subtitle="Distinct product codes remain separate, including matching size labels." action={<Link className="text-link" to="/stock">Manage stock</Link>}/><ReportTable rows={d.stock.filter(r=>r.kind==='finished_brick')} settings={settings} columns={definitions.stock[1]}/></Card></>;
}
const reportGroups=[['Sales',['daily','weekly','monthly','products']],['Operations',['purchases','production','stock','expenses']],['Balances',['customers','suppliers']],['Profit',['profit','costs']]];
export default function Reports({settings,revision,owner,previewLoader,previewDate}){
 const end=previewDate||today(settings.timezone);
 const [draft,setDraft]=useState({from:end.slice(0,7)+'-01',to:end}),[range,setRange]=useState(draft),[period,setPeriod]=useState('month'),[kind,setKind]=useState('daily'),[refresh,setRefresh]=useState(0),[review,setReview]=useState(null);
 const [cementData,setCementData]=useState({loaded:false,total:0,byCode:{},byName:{}});
 const state=useSnapshot(range.from,range.to,`${revision}-${refresh}`,previewLoader),data=state.data;
 const salesReport=['daily','weekly','monthly','products'].includes(kind);

 useEffect(()=>{
  if(kind!=='production'||previewLoader||!supabase)return;
  let active=true;
  supabase
   .from('production_register')
   .select('production_date,product_code,product_name,cement_packs_used,status')
   .gte('production_date',range.from)
   .lte('production_date',range.to)
   .eq('status','completed')
   .then(({data:cData,error:cErr})=>{
    if(!active||cErr||!Array.isArray(cData))return;
    const byCode={};
    const byName={};
    let total=0;
    for(const row of cData){
     const bags=Number(row?.cement_packs_used||0);
     if(!Number.isNaN(bags)){
      total+=bags;
      if(row?.product_code)byCode[row.product_code]=(byCode[row.product_code]||0)+bags;
      if(row?.product_name)byName[row.product_name]=(byName[row.product_name]||0)+bags;
     }
    }
    setCementData({loaded:true,total,byCode,byName});
   })
   .catch(()=>{});
  return()=>{active=false;};
 },[kind,range.from,range.to,previewLoader,revision]);

 let rows=data?(kind==='weekly'||kind==='monthly'?groupSales(data.daily,kind):data[kind]||[]):[];
 if(data&&kind==='profit'){const s=data.summary;rows=[{metric:'Sales revenue',amount:s.revenue},{metric:'Cost of bricks sold (known costs)',amount:s.known_cogs},{metric:'Reviewed operating costs',amount:s.operating_costs},{metric:'Estimated profit',amount:s.estimated_profit}];}
 if(data&&kind==='production'){
  rows=(data.production||[]).map(r=>{
   let cement=r?.cement_used!=null?Number(r.cement_used):null;
   if(cement==null&&cementData.loaded){
    if(r?.code&&cementData.byCode?.[r.code]!=null){
     cement=cementData.byCode[r.code];
    }else if(r?.name&&cementData.byName?.[r.name]!=null){
     cement=cementData.byName[r.name];
    }else{
     cement=0;
    }
   }
   return{
    ...r,
    cement_used:cement!=null&&!Number.isNaN(cement)?cement:(cementData.loaded?0:null)
   };
  });
 }

 let totalCement=null;
 if(data&&kind==='production'){
  if(cementData.loaded){
   totalCement=cementData.total;
  }else if(Array.isArray(data.production)&&data.production.some(r=>r?.cement_used!=null)){
   totalCement=data.production.reduce((s,r)=>s+Number(r?.cement_used||0),0);
  }
 }

 const [title,columns]=definitions[kind];
 function preset(value){setPeriod(value);if(value==='custom')return;const from=value==='today'?end:value==='week'?shiftDate(end,-((new Date(`${end}T00:00:00Z`).getUTCDay()+6)%7)):end.slice(0,7)+'-01';setDraft({from,to:end});setRange({from,to:end});}
 function exportReport(){downloadCsv(`JM-${previewLoader?'SAMPLE-':''}${kind}-${range.from}-${range.to}.csv`,[...columns.map(([key,label])=>({key,label})),{key:'data_source',label:'Data source'},{key:'period_from',label:'Period from'},{key:'period_to',label:'Period to / as of'},{key:'currency',label:'Currency'}],rows.map(r=>({...r,data_source:previewLoader?'SAMPLE - not business records':'Supabase business records',period_from:range.from,period_to:range.to,currency:settings.currency})));}
 const sum=key=>rows.reduce((n,r)=>n+Number(r[key]||0),0);
 const summary=!data?[]:salesReport?[['Sales revenue',data.summary.revenue],['Cash collected',data.summary.collected]]:kind==='purchases'?[['Purchases',data.summary.purchases],['Paid to suppliers',data.summary.supplier_paid]]:kind==='customers'?[['Customers owe',data.summary.customer_due]]:kind==='suppliers'?[['Suppliers owed',data.summary.supplier_due]]:kind==='expenses'?[['Total expenses',data.summary.expenses]]:kind==='profit'?[['Estimated profit',data.summary.estimated_profit],['Sales revenue',data.summary.revenue]]:kind==='production'?[['Good bricks',sum('net'),'quantity'],['Rejected bricks',sum('rejected'),'quantity'],['Total Cement Consumed',totalCement!=null?`${Number(totalCement).toLocaleString()} Bags`:'—','text']]:kind==='stock'?[['Finished bricks',data.summary.bricks,'quantity'],['Low-stock products',data.summary.low_stock,'quantity']]:[['Awaiting cost review',data.summary.unreviewed_costs,'quantity']];
 return <div className="reports-clean">
 <Card className="report-controls no-print"><div className="report-control-main"><Field label="Choose report"><select value={kind} onChange={e=>setKind(e.target.value)}>{reportGroups.map(([group,keys])=><optgroup key={group} label={group}>{keys.map(k=><option key={k} value={k}>{definitions[k][0]}</option>)}</optgroup>)}</select></Field><Field label="Period"><select value={period} onChange={e=>preset(e.target.value)}><option value="today">Today</option><option value="week">This week</option><option value="month">This month</option><option value="custom">Custom dates</option></select></Field><div className="report-control-actions"><Button variant="secondary" disabled={!data} onClick={()=>window.print()}><Printer size={16}/>Print</Button><Button variant="secondary" disabled={!data} onClick={exportReport}><Download size={16}/>Export CSV</Button></div></div>
 {period==='custom'&&<form className="report-custom-dates" onSubmit={e=>{e.preventDefault();setRange({...draft})}}><Field label="From" type="date" required max={draft.to} value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})}/><Field label="To" type="date" required min={draft.from} max={end} value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/><Button type="submit">Apply dates</Button></form>}</Card>
 {!data?<SnapshotState state={state}/>:<div className="report-print">
 <div className="report-heading"><div><span className="report-eyebrow">{previewLoader?'SAMPLE REPORT':'BUSINESS REPORT'} · {settings.currency}</span><h2>{title}</h2><p>{settings.business_name} · {range.from} — {range.to}</p></div><span className="report-date-note">{['stock','customers','suppliers'].includes(kind)?`As of ${range.to}`:'Selected period'}</span></div>
 <div className="report-total-grid">{summary.map(([label,value,type])=><Card key={label} className="report-total"><span>{label}</span><strong>{value==null?'Needs cost review':type==='quantity'?Number(value).toLocaleString():type==='text'?value:currency(value,settings.currency)}</strong>{label==='Estimated profit'&&<small>Estimate only · not audited profit</small>}</Card>)}</div>
 {previewLoader&&<p className="report-context">Sample figures only. Connect Supabase to see your business records.</p>}
 {kind==='profit'&&data.summary.estimated_profit==null&&<div className="report-alert"><AlertTriangle size={18}/><div><strong>Profit estimate is incomplete</strong><p>{data.summary.unknown_cost_items} sale lines have unknown costs · {data.summary.unreviewed_costs} costs need review. Confirm costing in Settings.</p><button className="text-link" type="button" onClick={()=>setKind('costs')}>Open cost review</button></div></div>}
 {kind==='costs'&&<p className="report-context">{owner?'Open a row to review its cost treatment.':'The owner can review these costs.'} Each cost must be counted once.</p>}
 {['daily','weekly','monthly'].includes(kind)&&<Chart rows={rows} settings={settings} title="Sales trend"/>}
 <Card className="report-data"><SectionTitle title="Report details" subtitle={`${rows.length} ${rows.length===1?'record':'records'}`}/><ReportTable rows={rows} columns={columns} settings={settings} onRow={kind==='costs'&&owner?r=>setReview(r):undefined}/></Card>
 <details className="report-explanation"><summary>How to read this report</summary><div><p>Dates use {settings.timezone}. Revenue follows sale dates; cash collected follows payment dates and may relate to older sales. Weekly and monthly totals include only the selected dates.</p><p>Stock and outstanding balances include earlier transactions through {range.to}. Purchases are separate from operating expenses. Unknown inventory values are shown as Unknown.</p>{['profit','costs'].includes(kind)&&<><p>Estimated profit is revenue less the saved moving weighted-average cost of bricks sold and reviewed operating costs. Unknown costs are never treated as zero. Taxes, depreciation and unrecorded costs are excluded.</p><p>Operating costs are deducted once. Inventory treatment means already included in inventory cost. Capital assets are outside the estimate. Already counted identifies a duplicate operating record; include its reference in the review reason. The latest owner review applies, including to historical reports. Reviews are retained in the audit history.</p></>}{previewLoader&&<p>Sample payments occur on invoice dates. Sample stock is available only as of 12 October 2026. Historical sample stock and cost valuations are unavailable.</p>}</div></details>
 </div>}
 {review&&<CostReview row={review} settings={settings} onClose={()=>setReview(null)} onSaved={()=>{setReview(null);setRefresh(x=>x+1)}}/>}</div>;
}
function CostReview({row,settings,onClose,onSaved}){const [treatment,setTreatment]=useState(row.treatment==='unreviewed'?'':row.treatment),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');return <Dialog title="Review cost treatment" onClose={()=>{if(!busy)onClose()}}><p>{row.description} · {currency(row.amount,settings.currency)}</p><form onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setError('');try{const {error}=await supabase.rpc('review_cost',{p_source:row.source,p_id:row.id,p_treatment:treatment,p_reason:reason});if(error)throw error;onSaved()}catch(e){setError(e.message)}finally{setBusy(false)}}}><Field label="Cost treatment"><select required value={treatment} onChange={e=>setTreatment(e.target.value)}><option value="">Choose after checking this cost</option><option value="operating">Operating — deduct once from profit</option><option value="inventory">Already included in inventory cost</option><option value="asset">Capital asset — outside operating estimate</option><option value="duplicate">Already counted in another operating record</option></select></Field><Field label="Reason / reference to related cost" required minLength={3} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/><p className="help">Confirm this treatment against your production costing and related purchases. This records a review without changing the original transaction.</p>{error&&<p role="alert" className="auth-error">{error}</p>}<Button disabled={busy}>{busy?'Saving…':'Confirm cost review'}</Button></form></Dialog>}
