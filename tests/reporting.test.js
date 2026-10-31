import test from 'node:test';
import assert from 'node:assert/strict';
import {groupSales,shiftDate,csvText} from '../src/operations/reporting.js';
test('calendar shifts cross leap days and years without local timezone effects',()=>{assert.equal(shiftDate('2024-03-01',-1),'2024-02-29');assert.equal(shiftDate('2025-01-01',-1),'2024-12-31')});
test('Monday weeks group only provided days and separate cash from revenue',()=>{assert.deepEqual(groupSales([{date:'2026-10-11',revenue:'.10',collected:2},{date:'2026-10-12',revenue:'.10',collected:1},{date:'2026-10-13',revenue:'.20',collected:0}],'weekly'),[{date:'2026-10-05',revenue:.1,collected:2},{date:'2026-10-12',revenue:.3,collected:1}])});
test('monthly grouping crosses years',()=>{assert.equal(groupSales([{date:'2025-12-31',revenue:1,collected:0},{date:'2026-01-01',revenue:2,collected:0}],'monthly').length,2)});
test('CSV quotes commas newlines and quotes, blocks formulas but preserves numeric negatives',()=>{const csv=csvText([{key:'v',label:'Value'}],[{v:'=1+2'},{v:' \t@cmd'},{v:'A,"B"\nC'},{v:-12.5},{v:null}]);assert.equal(csv,'\ufeff"Value"\r\n"\'=1+2"\r\n"\' \t@cmd"\r\n"A,""B""\nC"\r\n"-12.5"\r\n"Unknown"')});
