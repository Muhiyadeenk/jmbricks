// Exact integer-cent preview for two-decimal prices. The database is authoritative.
export function cents(value) {
  const text=String(value);
  if(!/^\d+(\.\d{0,2})?$/.test(text)) return null;
  const [whole,decimal='']=text.split('.');
  return BigInt(whole)*100n+BigInt(decimal.padEnd(2,'0'));
}
export function lineCents(quantity,price) {
  if(!/^\d+(\.\d{0,3})?$/.test(String(quantity)))return null;
  const priceCents=cents(price); if(priceCents===null)return null;
  const [whole,decimal='']=String(quantity).split('.');
  const thousandths=BigInt(whole)*1000n+BigInt(decimal.padEnd(3,'0'));
  return (thousandths*priceCents+500n)/1000n;
}
export function totals(items,discount='0',paid='0') {
  const lines=items.map(item=>lineCents(item.quantity,item.price));
  const d=cents(discount),p=cents(paid);
  if(lines.includes(null)||d===null||p===null)return null;
  const subtotal=lines.reduce((a,b)=>a+b,0n), total=subtotal-d;
  return {subtotal:Number(subtotal)/100,total:Number(total)/100,balance:Number(total-p)/100,valid:d<=subtotal&&p<=total};
}
export function quantityRules(unit) {
  return ['brick','piece','bag'].includes(unit) ? {min:'1',step:'1'} : {min:'0.001',step:'0.001'};
}
