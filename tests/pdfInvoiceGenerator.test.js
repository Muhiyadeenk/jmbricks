import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapePdf,
  hexToRgb,
  cleanPhoneNumber,
  validatePhoneNumber,
  generateWhatsAppBillMessage,
  numberToWordsINR,
  formatDateDisplay,
  buildInvoicePdfBytes
} from '../src/operations/pdfInvoiceGenerator.js';

test('cleanPhoneNumber handles 10-digit Indian numbers and prefixes', () => {
  assert.equal(cleanPhoneNumber('9847947772'), '919847947772');
  assert.equal(cleanPhoneNumber('+91 98479 47772'), '919847947772');
  assert.equal(cleanPhoneNumber('09847947772'), '919847947772');
  assert.equal(cleanPhoneNumber('919847947772'), '919847947772');
  assert.equal(cleanPhoneNumber('91919847947772'), '919847947772'); // Prevents accidental double 91
  assert.equal(cleanPhoneNumber(''), '');
});

test('validatePhoneNumber validates 10-digit Indian numbers properly', () => {
  const v1 = validatePhoneNumber('9847947772');
  assert.equal(v1.valid, true);
  assert.equal(v1.cleanNumber, '919847947772');
  assert.equal(v1.core10, '9847947772');
  assert.equal(v1.formatted, '+91 98479 47772');

  const v2 = validatePhoneNumber('+91 97474 95127');
  assert.equal(v2.valid, true);
  assert.equal(v2.cleanNumber, '919747495127');

  const v3 = validatePhoneNumber('12345');
  assert.equal(v3.valid, false);
  assert.match(v3.error, /10 digits/i);

  const v4 = validatePhoneNumber('');
  assert.equal(v4.valid, false);
  assert.match(v4.error, /Please enter a mobile number/i);
});

test('generateWhatsAppBillMessage matches exact requested billing message template', () => {
  const msg = generateWhatsAppBillMessage({
    customerName: 'Muhiyadeen K',
    receiptNumber: '25',
    total: 18496,
    amountReceived: 5000,
    balance: 13496
  });

  assert.ok(msg.includes('Hello Muhiyadeen K,'));
  assert.ok(msg.includes('Thank you for choosing JM BRICKS!'));
  assert.ok(msg.includes('Your sales invoice is ready.'));
  assert.ok(msg.includes('Invoice No: S-25'));
  assert.ok(msg.includes('Total Amount: ₹18,496'));
  assert.ok(msg.includes('Amount Received: ₹5,000'));
  assert.ok(msg.includes('Balance: ₹13,496'));
  assert.ok(msg.includes('Please find your bill attached.'));
  assert.ok(msg.includes('Thank you for your business!'));
  assert.ok(msg.includes('JM BRICKS'));
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
