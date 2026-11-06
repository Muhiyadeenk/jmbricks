import test from 'node:test';
import assert from 'node:assert/strict';
import {cents,lineCents,totals,quantityRules,calculateAvailableStock,calculateCementConsumption,validateCementStock,calculateRawMaterialStock} from '../src/operations/calculations.js';
test('exact-cent money conversion avoids binary float arithmetic',()=>{assert.equal(cents('0.29'),29n);assert.equal(cents('1500.05'),150005n);});
test('fractional material quantities round per line',()=>{assert.equal(lineCents('0.125','0.04'),1n);assert.equal(lineCents('10.5','4'),4200n);});
test('multi-item sale totals distinguish discount and cash received',()=>{assert.deepEqual(totals([{quantity:'50',price:'30'},{quantity:'2',price:'20'}],'10','200'),{subtotal:1540,total:1530,balance:1330,valid:true});});
test('payment and discount cannot exceed the total',()=>{assert.equal(totals([{quantity:'1',price:'10'}],'11','0').valid,false);assert.equal(totals([{quantity:'1',price:'10'}],'0','11').valid,false);});
test('invalid precision, negatives and nonnumeric input are rejected',()=>{assert.equal(cents('-1'),null);assert.equal(cents('NaN'),null);assert.equal(cents('0.001'),null);assert.equal(lineCents('0.0001','2'),null);assert.equal(totals([{quantity:'',price:'3'}]),null);});

test('whole-unit HTML quantity limits accept integers without a fractional step offset',()=>{for(const unit of ['brick','piece','bag']){const rule=quantityRules(unit);assert.deepEqual(rule,{min:'1',step:'1'});assert.equal((100-Number(rule.min))%Number(rule.step),0);}assert.deepEqual(quantityRules('kg'),{min:'0.001',step:'0.001'});});

test('calculateAvailableStock matches required formula: Total Production - Total Sold - Rejected + Other Adjustments', () => {
  // Example from user prompt:
  assert.equal(calculateAvailableStock({
    totalProduced: 2960,
    totalSold: 500,
    totalRejected: 0,
    otherAdjustments: 0
  }), 2460);

  // Example after sale deletion of 500:
  assert.equal(calculateAvailableStock({
    totalProduced: 2960,
    totalSold: 0,
    totalRejected: 0,
    otherAdjustments: 0
  }), 2960);

  // Example with rejected bricks and adjustments:
  assert.equal(calculateAvailableStock({
    totalProduced: 3000,
    totalSold: 500,
    totalRejected: 20,
    otherAdjustments: 10
  }), 2490);

  // Negative result clamps to 0:
  assert.equal(calculateAvailableStock({
    totalProduced: 100,
    totalSold: 200
  }), 0);
});

test('calculateCementConsumption calculates correct cement bags based on production formula', () => {
  // 150 lines of 8-inch yields 18 cement sacks
  assert.equal(calculateCementConsumption(8, 150), 18);
  // 66 lines of 8-inch yields 8 cement sacks
  assert.equal(calculateCementConsumption(8, 66), 8);
  // 124 lines of 8-inch yields 15 cement sacks
  assert.equal(calculateCementConsumption(8, 124), 15);
  // 371 lines of 4-inch yields 51 cement sacks
  assert.equal(calculateCementConsumption(4, 371), 51);
  // 951 lines of 5-inch yields 111 cement sacks
  assert.equal(calculateCementConsumption(5, 951), 111);
  // 0 lines yields 0 cement sacks
  assert.equal(calculateCementConsumption(8, 0), 0);
});

test('validateCementStock enforces sufficient stock and prevents negative cement stock', () => {
  // Sufficient stock
  const ok = validateCementStock({ availableCement: 100, cementNeeded: 50 });
  assert.equal(ok.sufficient, true);
  assert.equal(ok.canProceed, true);
  assert.equal(ok.balanceAfter, 50);
  assert.equal(ok.errorMessage, null);

  // Exact stock match
  const exact = validateCementStock({ availableCement: 18, cementNeeded: 18 });
  assert.equal(exact.sufficient, true);
  assert.equal(exact.canProceed, true);
  assert.equal(exact.balanceAfter, 0);

  // Insufficient stock: blocks production and returns clear warning
  const blocked = validateCementStock({ availableCement: 10, cementNeeded: 18 });
  assert.equal(blocked.sufficient, false);
  assert.equal(blocked.canProceed, false);
  assert.equal(blocked.balanceAfter, -8);
  assert.match(blocked.errorMessage, /Insufficient cement stock! Production requires 18 bags/);
  assert.match(blocked.errorMessage, /only 10 bags are available/);
});

test('calculateRawMaterialStock correctly computes available stock from purchases, consumption and adjustments', () => {
  // Available Stock = Total Purchased - Consumed in Production + Other Valid Stock Adjustments
  // e.g. Total Purchased = 312 Bags, Consumed in Production = 18 Bags => Available Stock = 294 Bags
  assert.equal(
    calculateRawMaterialStock({ totalPurchased: 312, totalConsumed: 18, otherAdjustments: 0 }),
    294
  );
  assert.equal(
    calculateRawMaterialStock({ totalPurchased: 150, totalConsumed: 50, otherAdjustments: 5 }),
    105
  );
  // Never negative
  assert.equal(
    calculateRawMaterialStock({ totalPurchased: 10, totalConsumed: 20, otherAdjustments: 0 }),
    0
  );
});
