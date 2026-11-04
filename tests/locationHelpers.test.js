import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeliveryLocations, formatSaleNotesWithLocations, formatWhatsAppInvoiceMessage } from '../src/operations/locationHelpers.js';

test('parseDeliveryLocations handles plain legacy notes', () => {
  const result = parseDeliveryLocations('Site note · 📍 Location: Kunnumpuram');
  assert.equal(result.primaryLocation, 'Kunnumpuram');
  assert.equal(result.userNotes, 'Site note');
  assert.deepEqual(result.extraLocations, []);
});

test('formatSaleNotesWithLocations and parseDeliveryLocations round-trip multiple locations', () => {
  const bricks = [
    { id: 'b1', name: '8 Inch Hollow', size_label: '8 Inch' },
    { id: 'b2', name: '6 Inch Hollow', size_label: '6 Inch' },
    { id: 'b3', name: '5 Inch Hollow', size_label: '5 Inch' },
  ];

  const extra = [
    { location: 'Vengara', product_id: 'b2', quantity: '500', price: '35' },
    { location: 'Tirur', product_id: 'b3', quantity: '800', price: '30' }
  ];

  const formatted = formatSaleNotesWithLocations('Rush delivery', 'Kunnumpuram', extra, bricks);
  assert.match(formatted, /📍 Delivery Locations:/);
  assert.match(formatted, /Location 1 \(Kunnumpuram\)/);
  assert.match(formatted, /Location 2 \(Vengara\): 6 Inch – 500 bricks @ ₹35 = ₹17,500/);
  assert.match(formatted, /Location 3 \(Tirur\): 5 Inch – 800 bricks @ ₹30 = ₹24,000/);

  const parsed = parseDeliveryLocations(formatted);
  assert.equal(parsed.primaryLocation, 'Kunnumpuram');
  assert.equal(parsed.userNotes, 'Rush delivery');
  assert.equal(parsed.extraLocations.length, 2);
  assert.equal(parsed.extraLocations[0].location, 'Vengara');
  assert.equal(parsed.extraLocations[0].quantity, '500');
  assert.equal(parsed.extraLocations[1].location, 'Tirur');
  assert.equal(parsed.extraLocations[1].quantity, '800');
});

test('formatWhatsAppInvoiceMessage formats all locations for WhatsApp sharing', () => {
  const record = {
    receipt_number: 105,
    sale_date: '2026-11-04',
    notes: '<!--LOCATIONS_DATA:{"primaryLocation":"Kunnumpuram","extraLocations":[{"location":"Vengara","product_id":"b2","quantity":"500","price":"35"},{"location":"Tirur","product_id":"b3","quantity":"800","price":"30"}]}-->'
  };
  const items = [
    { product_id: 'b1', quantity: 1000, unit_price: 45 }
  ];
  const catalog = {
    products: [
      { id: 'b1', size_label: '8 Inch' },
      { id: 'b2', size_label: '6 Inch' },
      { id: 'b3', size_label: '5 Inch' }
    ]
  };

  const { text, shareUrl } = formatWhatsAppInvoiceMessage({
    record,
    items,
    customerName: 'Engineer Latheef',
    customerPhone: '9446663786',
    subtotal: 86500,
    grandTotal: 86500,
    amountPaid: 30000,
    outstanding: 56500,
    catalog
  });

  assert.match(text, /S-105/);
  assert.match(text, /Engineer Latheef/);
  assert.match(text, /Location 1: Kunnumpuram/);
  assert.match(text, /Location 2: Vengara/);
  assert.match(text, /Location 3: Tirur/);
  assert.match(shareUrl, /wa\.me\/919446663786/);
});
