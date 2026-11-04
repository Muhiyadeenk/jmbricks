import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapePdf,
  hexToRgb,
  cleanPhoneNumber,
  numberToWordsINR,
  formatDateDisplay,
  buildInvoicePdfBytes
} from '../src/operations/pdfInvoiceGenerator.js';

test('cleanPhoneNumber handles 10-digit Indian numbers and prefixes', () => {
  assert.equal(cleanPhoneNumber('9847947772'), '919847947772');
  assert.equal(cleanPhoneNumber('+91 98479 47772'), '919847947772');
  assert.equal(cleanPhoneNumber('09847947772'), '919847947772');
  assert.equal(cleanPhoneNumber('919847947772'), '919847947772');
  assert.equal(cleanPhoneNumber(''), '');
});

test('numberToWordsINR handles typical brick sale amounts', () => {
  assert.equal(numberToWordsINR(18496), 'Eighteen Thousand Four Hundred Ninety Six Rupees Only');
  assert.equal(numberToWordsINR(56250), 'Fifty Six Thousand Two Hundred Fifty Rupees Only');
  assert.equal(numberToWordsINR(0), 'Zero Rupees Only');
});

test('formatDateDisplay formats YYYY-MM-DD properly', () => {
  const formatted = formatDateDisplay('2026-11-04');
  assert.match(formatted, /04/);
  assert.match(formatted, /Nov/);
  assert.match(formatted, /2026/);
});

test('buildInvoicePdfBytes produces valid PDF structure', () => {
  const sampleData = {
    record: {
      id: 'test-sale-1',
      receipt_number: 25,
      sale_date: '2026-11-04',
      customer_name: 'Muhiyadeen K',
      customer_phone: '9847947772',
      notes: 'Test notes',
      payment_method: 'cash',
      subtotal: 18496,
      discount: 0,
      total: 18496,
      amount_received: 0,
      outstanding_balance: 18496
    },
    items: [
      { product_name: '8-inch Brick', quantity: 200, unit_price: 34, line_total: 6800 }
    ],
    customerName: 'Muhiyadeen K',
    customerPhone: '9847947772',
    customerLocation: 'kunnumpuram',
    primaryLocation: 'kunnumpuram',
    extraLocations: [
      { location: 'vengara', product_name: '5-inch Brick', quantity: 344, price: 34, amount: 11696 }
    ],
    subtotal: 18496,
    discount: 0,
    grandTotal: 18496,
    amountPaid: 0,
    outstanding: 18496,
    settings: {
      business_name: 'JM HOLLO BRICKS',
      business_address: 'Palakkaparamba, Malappuram',
      currency: 'INR'
    }
  };

  const bytes = buildInvoicePdfBytes(sampleData);
  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.length > 1000, 'PDF should have reasonable content length');

  const textDecoder = new TextDecoder('latin1');
  const pdfString = textDecoder.decode(bytes);

  assert.ok(pdfString.startsWith('%PDF-1.4'), 'Should have valid PDF header');
  assert.ok(pdfString.includes('%%EOF'), 'Should have valid PDF EOF marker');
  assert.ok(pdfString.includes('xref'), 'Should have xref table');
  assert.ok(pdfString.includes('JM BRICKS'), 'Should contain company name');
  assert.ok(pdfString.includes('9747495127'), 'Should contain phone number');
  assert.ok(pdfString.includes('S-25'), 'Should contain receipt number');
  assert.ok(pdfString.includes('Muhiyadeen K'), 'Should contain customer name');
  assert.ok(pdfString.includes('LOCATION 1'), 'Should contain primary location');
  assert.ok(pdfString.includes('LOCATION 2'), 'Should contain secondary location');
  assert.ok(pdfString.includes('VENGARA'), 'Should contain secondary location name');
});
