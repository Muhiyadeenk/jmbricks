// Calendar dates are business-local dates, never parsed in the browser's timezone.
export function shiftDate(date,days){const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
export function groupSales(rows,interval='daily'){
 const groups=new Map();
 for(const row of rows){let key=row.date;if(interval==='monthly')key=key.slice(0,7);if(interval==='weekly'){const day=new Date(`${key}T00:00:00Z`).getUTCDay();key=shiftDate(key,-((day+6)%7));}
 const value=groups.get(key)||{date:key,revenue:0,collected:0};
 // SQL supplies decimal totals; accumulate cents to avoid visible floating-point drift.
 value.revenue+=Math.round(Number(row.revenue)*100);value.collected+=Math.round(Number(row.collected)*100);groups.set(key,value);}
 return [...groups.values()].map(r=>({...r,revenue:r.revenue/100,collected:r.collected/100}));
}
export function csvText(columns,rows){
 const escape=value=>{let s=value==null?'Unknown':String(value);if(typeof value==='string'&&/^[\s\u0000-\u001f]*[=+\-@]/.test(s))s=`'${s}`;return `"${s.replaceAll('"','""')}"`};
 return '\ufeff'+[columns.map(c=>escape(c.label)).join(','),...rows.map(r=>columns.map(c=>escape(r[c.key])).join(','))].join('\r\n');
}
export function downloadCsv(name,columns,rows){const url=URL.createObjectURL(new Blob([csvText(columns,rows)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
