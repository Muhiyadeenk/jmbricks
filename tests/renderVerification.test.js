import React from 'react';
import ReactDOMServer from 'react-dom/server';
import esbuild from 'esbuild';
import fs from 'fs';
import * as locationHelpers from '../src/operations/locationHelpers.js';

function loadComponent(filePath, mockModules = {}) {
  const code = esbuild.transformSync(fs.readFileSync(filePath, 'utf8'), {
    loader: 'jsx',
    format: 'cjs'
  }).code;

  const m = { exports: {} };
  const req = (name) => {
    if (mockModules[name]) return mockModules[name];
    if (name === 'react') return React;
    if (name === 'react-dom') return { createPortal: (node) => node };
    if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
    if (name === '../components') return {
      Button: ({ children }) => React.createElement('button', null, children),
      Field: ({ label, children }) => React.createElement('div', null, label, children),
      Dialog: ({ title, children }) => React.createElement('div', null, title, children),
      Badge: ({ children }) => React.createElement('span', null, children)
    };
    if (name === './api') return { today: () => '2026-11-04', currency: (v) => '₹' + v };
    if (name === './calculations') return { totals: () => ({ subtotal: 0, total: 0, balance: 0, valid: true }) };
    if (name === '../lib/supabase') return { supabase: { from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) } };
    if (name === './locationHelpers') return locationHelpers;
    return {};
  };

  const fn = new Function('require', 'module', 'exports', code);
  fn(req, m, m.exports);
  return m.exports.default || m.exports;
}

const mockCatalog = {
  products: [{ id: 'p1', name: '8 Inch Hollow Brick', kind: 'finished_brick', is_active: true, selling_price: '40', brick_size: 8 }],
  customers: [{ id: 'c1', name: 'Latheef', phone: '9446663786', location: 'Kunnumpuram', is_active: true }]
};

const mockSettings = { timezone: 'Asia/Kolkata', currency: 'INR' };

// Test 1: SaleForm Add Sale
const SaleForm = loadComponent('src/operations/SaleForm.jsx', {});
const addSaleHtml = ReactDOMServer.renderToString(
  React.createElement(SaleForm, {
    initial: {},
    catalog: mockCatalog,
    settings: mockSettings,
    onSubmit: () => {},
    onClose: () => {}
  })
);
console.log('✓ SaleForm Add Sale rendered without errors! Length:', addSaleHtml.length);

// Test 2: SaleForm Edit Sale with multiple locations
const editSaleHtml = ReactDOMServer.renderToString(
  React.createElement(SaleForm, {
    initial: {
      isEditMode: true,
      saleId: 's1',
      receiptNumber: 105,
      items: [{ product_id: 'p1', quantity: '1000', price: '45' }],
      extraLocations: [{ location: 'Vengara', product_id: 'p1', quantity: '500', price: '35' }]
    },
    catalog: mockCatalog,
    settings: mockSettings,
    onSubmit: () => {},
    onClose: () => {}
  })
);
console.log('✓ SaleForm Edit Sale rendered without errors! Length:', editSaleHtml.length);

// Test 3: SalesInvoice
const SalesInvoice = loadComponent('src/operations/SalesInvoice.jsx', {});
const invoiceHtml = ReactDOMServer.renderToString(
  React.createElement(SalesInvoice, {
    record: {
      id: 's1',
      receipt_number: 105,
      sale_date: '2026-11-04',
      total: 86500,
      notes: '<!--LOCATIONS_DATA:{"primaryLocation":"Kunnumpuram","extraLocations":[{"location":"Vengara","product_id":"p1","quantity":"500","price":"35"}]}-->'
    },
    items: [{ id: 'i1', product_id: 'p1', quantity: 1000, unit_price: 45 }],
    payments: [],
    catalog: mockCatalog,
    settings: mockSettings
  })
);
console.log('✓ SalesInvoice rendered without errors! Length:', invoiceHtml.length);

// Test 4: Operations page (HistoryPage for sales)
const Operations = loadComponent('src/operations/Operations.jsx', {
  'react-router-dom': {
    useLocation: () => ({ pathname: '/sales' }),
    useNavigate: () => () => {},
    Link: ({ children, to }) => React.createElement('a', { href: to }, children)
  },
  './OperationForm': { titles: { sale: 'New Sale' } },
  './SalesInvoice': SalesInvoice,
  './Reports': { LiveDashboard: () => null },
  './Production': { ProductionOverview: () => null, displayDate: () => '' }
});

const operationsHtml = ReactDOMServer.renderToString(
  React.createElement(Operations, {
    profile: { role: 'owner', id: 'u1' },
    settings: mockSettings
  })
);
console.log('✓ Operations / Sales page rendered without errors! Length:', operationsHtml.length);
