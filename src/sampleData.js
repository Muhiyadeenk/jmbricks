// Stage 1 fixtures only. Replace this adapter with Supabase queries in Stage 3.
export const previewDate='2026-10-12';
export const products=[
 {id:1,name:'6-inch Brick',code:'HB-0601',size:'400 × 150 × 200 mm',stock:4800,min:1000,price:38},
 {id:2,name:'8-inch Brick',code:'HB-0801',size:'400 × 200 × 200 mm',stock:3250,min:1000,price:48},
 {id:3,name:'4-inch Brick',code:'HB-0401',size:'400 × 100 × 200 mm',stock:650,min:1000,price:28},
 {id:4,name:'5-inch Brick',code:'HB-0501',size:'400 × 125 × 200 mm',stock:0,min:500,price:42}
];
export const sales=[{id:'S-0104',date:previewDate,name:'Rahman Constructions',product:'6-inch Brick',quantity:600,total:22800,paid:22800},{id:'S-0103',date:previewDate,name:'A K Builders',product:'8-inch Brick',quantity:350,total:16800,paid:10000},{id:'S-0102',date:previewDate,name:'Faisal M.',product:'4-inch Brick',quantity:200,total:5600,paid:5600},{id:'S-0101',date:'2026-10-11',name:'Greenfield Homes',product:'6-inch Brick',quantity:800,total:30400,paid:15000}];
export const purchases=[{id:'P-0028',date:previewDate,name:'Malabar Building Supplies',product:'8-inch Brick',quantity:500,total:16000,paid:10000},{id:'P-0027',date:'2026-10-11',name:'Metro Cement Traders',product:'Cement · raw material',quantity:50,total:18500,paid:18500}];
export const expenses=[{id:'E-0042',date:previewDate,name:'Daily production wages',category:'Labour',total:4200},{id:'E-0041',date:previewDate,name:'Local delivery fuel',category:'Fuel',total:1250}];
export const production=[{id:'PR-DEMO-1',date:previewDate,name:'5-inch Brick',lines:140,factor:6,quantity:840,rejected:10,cement:18},{id:'PR-DEMO-2',date:previewDate,name:'4-inch Brick',lines:150,factor:8,quantity:1200,rejected:0,cement:18},{id:'PR-DEMO-3',date:previewDate,name:'6-inch Brick',lines:152,factor:5,quantity:760,rejected:0,cement:17},{id:'PR-DEMO-4',date:previewDate,name:'8-inch Brick',lines:150,factor:4,quantity:600,rejected:0,cement:18}];
export const weekly=[{name:'Tue',sales:18000},{name:'Wed',sales:28000},{name:'Thu',sales:23000},{name:'Fri',sales:38000},{name:'Sat',sales:31000},{name:'Sun',sales:30400},{name:'Mon',sales:45200}];
export const monthly=[{name:'May',sales:380000},{name:'Jun',sales:420000},{name:'Jul',sales:395000},{name:'Aug',sales:485000},{name:'Sep',sales:510000},{name:'Oct',sales:246000}];
