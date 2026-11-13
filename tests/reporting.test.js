import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupSales,
  shiftDate,
  csvText,
  getPeriodDates,
  calculateDelta,
  formatDateDisplay
} from '../src/operations/reporting.js';

test('calendar shifts cross leap days and years without local timezone effects',()=>{assert.equal(shiftDate('2024-03-01',-1),'2024-02-29');assert.equal(shiftDate('2025-01-01',-1),'2024-12-31')});
test('Monday weeks group only provided days and separate cash from revenue',()=>{assert.deepEqual(groupSales([{date:'2026-10-11',revenue:'.10',collected:2},{date:'2026-10-12',revenue:'.10',collected:1},{date:'2026-10-13',revenue:'.20',collected:0}],'weekly'),[{date:'2026-10-05',revenue:.1,collected:2},{date:'2026-10-12',revenue:.3,collected:1}])});
test('monthly grouping crosses years',()=>{assert.equal(groupSales([{date:'2025-12-31',revenue:1,collected:0},{date:'2026-01-01',revenue:2,collected:0}],'monthly').length,2)});
test('CSV quotes commas newlines and quotes, blocks formulas but preserves numeric negatives',()=>{const csv=csvText([{key:'v',label:'Value'}],[{v:'=1+2'},{v:' \t@cmd'},{v:'A,"B"\nC'},{v:-12.5},{v:null}]);assert.equal(csv,'\ufeff"Value"\r\n"\'=1+2"\r\n"\' \t@cmd"\r\n"A,""B""\nC"\r\n"-12.5"\r\n"Unknown"')});

test('getPeriodDates properly resolves all reporting intervals and comparison periods', () => {
  const baseDate = '2026-11-13'; // Friday

  const today = getPeriodDates('today', baseDate);
  assert.equal(today.from, '2026-11-13');
  assert.equal(today.to, '2026-11-13');
  assert.equal(today.prevFrom, '2026-11-12');
  assert.equal(today.prevTo, '2026-11-12');

  const yesterday = getPeriodDates('yesterday', baseDate);
  assert.equal(yesterday.from, '2026-11-12');
  assert.equal(yesterday.to, '2026-11-12');
  assert.equal(yesterday.prevFrom, '2026-11-11');
  assert.equal(yesterday.prevTo, '2026-11-11');

  const thisWeek = getPeriodDates('this_week', baseDate);
  assert.equal(thisWeek.from, '2026-11-09'); // Monday
  assert.equal(thisWeek.to, '2026-11-13');
  assert.equal(thisWeek.prevFrom, '2026-11-02');
  assert.equal(thisWeek.prevTo, '2026-11-06');

  const thisMonth = getPeriodDates('this_month', baseDate);
  assert.equal(thisMonth.from, '2026-11-01');
  assert.equal(thisMonth.to, '2026-11-13');
  assert.equal(thisMonth.prevFrom, '2026-10-01');
  assert.equal(thisMonth.prevTo, '2026-10-13');
});

test('calculateDelta properly computes directions, percentages, and favorable/unfavorable metrics', () => {
  // Revenue increase is favorable
  const revUp = calculateDelta(11500, 10000, false, 'Sales revenue');
  assert.equal(revUp.diff, 1500);
  assert.equal(revUp.percent, 15);
  assert.equal(revUp.direction, 'up');
  assert.equal(revUp.isFavorable, true);
  assert.ok(revUp.narrative.includes('increased by 15%'));

  // Expenses increase is UNFAVORABLE
  const expUp = calculateDelta(4500, 3000, true, 'Operating expenses');
  assert.equal(expUp.diff, 1500);
  assert.equal(expUp.percent, 50);
  assert.equal(expUp.direction, 'up');
  assert.equal(expUp.isFavorable, false);
  assert.ok(expUp.narrative.includes('unfavourable'));

  // Expenses decrease is FAVORABLE
  const expDown = calculateDelta(2000, 3500, true, 'Expenses');
  assert.equal(expDown.direction, 'down');
  assert.equal(expDown.isFavorable, true);
  assert.ok(expDown.narrative.includes('favourable'));
});
