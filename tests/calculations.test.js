import test from 'node:test';
import assert from 'node:assert/strict';
import {cents,lineCents,totals,quantityRules} from '../src/operations/calculations.js';
test('exact-cent money conversion avoids binary float arithmetic',()=>{assert.equal(cents('0.29'),29n);assert.equal(cents('1500.05'),150005n);});
test('fractional material quantities round per line',()=>{assert.equal(lineCents('0.125','0.04'),1n);assert.equal(lineCents('10.5','4'),4200n);});
test('multi-item sale totals distinguish discount and cash received',()=>{assert.deepEqual(totals([{quantity:'50',price:'30'},{quantity:'2',price:'20'}],'10','200'),{subtotal:1540,total:1530,balance:1330,valid:true});});
test('payment and discount cannot exceed the total',()=>{assert.equal(totals([{quantity:'1',price:'10'}],'11','0').valid,false);assert.equal(totals([{quantity:'1',price:'10'}],'0','11').valid,false);});
test('invalid precision, negatives and nonnumeric input are rejected',()=>{assert.equal(cents('-1'),null);assert.equal(cents('NaN'),null);assert.equal(cents('0.001'),null);assert.equal(lineCents('0.0001','2'),null);assert.equal(totals([{quantity:'',price:'3'}]),null);});

test('whole-unit HTML quantity limits accept integers without a fractional step offset',()=>{for(const unit of ['brick','piece','bag']){const rule=quantityRules(unit);assert.deepEqual(rule,{min:'1',step:'1'});assert.equal((100-Number(rule.min))%Number(rule.step),0);}assert.deepEqual(quantityRules('kg'),{min:'0.001',step:'0.001'});});
