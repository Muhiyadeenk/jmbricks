// Read-only preview adapter. Never imported by the authenticated workspace.
import {sales,purchases,production,expenses,products,previewDate} from './sampleData.js';
import {shiftDate} from './operations/reporting.js';
export function sampleReportSnapshot(from,to,empty=false){
 if(!from||!to||from>to||to>previewDate||new Date(to)-new Date(from)>3660*86400000)throw new Error('Choose a valid sample date range ending 12 October 2026 or earlier.');
 const within=r=>!empty&&r.date>=from&&r.date<=to,asof=r=>!empty&&r.date<=to;
 const ss=sales.filter(within),ps=purchases.filter(within),es=expenses.filter(within),pr=production.filter(within);
 const sum=(rows,key)=>rows.reduce((a,r)=>a+Number(r[key]||0),0);
 const customers=sales.filter(asof).filter(r=>r.total>r.paid).map(r=>({id:r.id,name:r.name,balance:r.total-r.paid}));
 const suppliers=purchases.filter(asof).filter(r=>r.total>r.paid).map(r=>({id:r.id,name:r.name,balance:r.total-r.paid}));
 const daily=[];for(let date=from;date<=to;date=shiftDate(date,1)){const rows=ss.filter(r=>r.date===date);daily.push({date,revenue:sum(rows,'total'),collected:sum(rows,'paid')});}
 const stock=!empty&&to===previewDate?products.map(p=>({id:p.id,code:p.code,name:p.name,size_label:p.size,unit:'brick',quantity:p.stock,minimum_stock:p.min,value:null,kind:'finished_brick'})):[];
 return {from,to,summary:{revenue:sum(ss,'total'),collected:sum(ss,'paid'),purchases:sum(ps,'total'),supplier_paid:sum(ps,'paid'),expenses:sum(es,'total'),known_cogs:0,unknown_cost_items:ss.length,unreviewed_costs:es.length,operating_costs:0,estimated_profit:null,costing_confirmed:false,customer_due:sum(customers,'balance'),supplier_due:sum(suppliers,'balance'),bricks:sum(stock,'quantity'),low_stock:stock.filter(p=>p.quantity<=p.minimum_stock).length},daily,
 products:products.flatMap(p=>{const rows=ss.filter(s=>s.product===p.name);return rows.length?[{id:p.id,code:p.code,name:p.name,size_label:p.size,quantity:sum(rows,'quantity'),revenue:sum(rows,'total')}]:[]}),
 purchases:ps.map(p=>({id:p.id,name:p.name,transactions:1,amount:p.total})),
 production:pr.map(p=>({id:p.id,code:products.find(x=>x.name===p.name)?.code,name:p.name,produced:p.quantity,rejected:p.rejected,net:p.quantity-p.rejected,cement_used:p.cement||0})),
 expenses:es.map(e=>({id:e.id,category:e.category,amount:e.total})),stock,customers,suppliers,
 costs:es.map(e=>({id:e.id,date:e.date,source:'expense',description:e.name,amount:e.total,treatment:'unreviewed',reason:'Sample only'})),recent_sales:ss.slice(0,5),recent_purchases:ps.slice(0,5)};
}
