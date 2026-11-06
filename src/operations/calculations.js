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
export function calculateAvailableStock({ totalProduced = 0, totalSold = 0, totalRejected = 0, otherAdjustments = 0 } = {}) {
  // Available Stock = Total Production − Total Sold − Rejected Bricks + Other Receipts/Adjustments
  return Math.max(0, Number(totalProduced || 0) - Number(totalSold || 0) - Number(totalRejected || 0) + Number(otherAdjustments || 0));
}

export function calculateRawMaterialStock({ totalPurchased = 0, totalConsumed = 0, otherAdjustments = 0 } = {}) {
  // Available Stock = Total Purchased − Consumed in Production + Other Valid Stock Adjustments
  return Math.max(0, Number(totalPurchased || 0) - Number(totalConsumed || 0) + Number(otherAdjustments || 0));
}

// Cement consumption lines-per-sack ratio based on JM Bricks production records:
// Standard: 150 lines uses 18 sacks (~8.33 lines per sack)
export const CEMENT_LINES_PER_SACK = {
  4: 7.27, // 4-inch (8 bricks/line): ~58 bricks/sack -> 371 lines = 51 sacks
  5: 8.56, // 5-inch (6 bricks/line): ~51 bricks/sack -> 951 lines = 111 sacks
  6: 8.33, // 6-inch (5 bricks/line): ~42 bricks/sack -> 150 lines = 18 sacks
  8: 8.33, // 8-inch (4 bricks/line): ~33-34 bricks/sack -> 150 lines = 18 sacks
};

export function calculateCementConsumption(size, lines) {
  const l = Number(lines || 0);
  if (l <= 0) return 0;
  const ratio = CEMENT_LINES_PER_SACK[Number(size)] || 8.33;
  return Math.max(1, Math.round(l / ratio));
}

export function validateCementStock({ availableCement = 0, cementNeeded = 0 } = {}) {
  const avail = Number(availableCement || 0);
  const needed = Number(cementNeeded || 0);
  const sufficient = avail >= needed;
  const balanceAfter = avail - needed;
  return {
    available: avail,
    needed,
    sufficient,
    balanceAfter,
    canProceed: sufficient && balanceAfter >= 0,
    errorMessage: sufficient ? null : `Insufficient cement stock! Production requires ${needed} bags of cement, but only ${avail} bags are available in stock. Cannot allow cement stock to become negative.`
  };
}
