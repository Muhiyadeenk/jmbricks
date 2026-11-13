import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import esbuild from 'esbuild';
import fs from 'fs';

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
      Button: ({ children, ...props }) => React.createElement('button', props, children),
      Field: ({ label, children, ...props }) => React.createElement('div', { 'data-label': label, ...props }, label, children),
      Dialog: ({ title, children }) => React.createElement('div', null, title, children),
      Badge: ({ children }) => React.createElement('span', null, children),
      Card: ({ children, className }) => React.createElement('div', { className }, children),
      SectionTitle: ({ title, subtitle }) => React.createElement('div', null, title, subtitle),
      number: (v) => String(v ?? '')
    };
    if (name === './api') return { today: () => '2026-11-13', allRows: () => Promise.resolve([]) };
    if (name === './reporting') return { downloadCsv: () => {} };
    if (name === './calculations') return {
      calculateCementConsumption: (size, lines) => {
        const l = Number(lines || 0);
        if (l <= 0) return 0;
        const ratios = { 4: 8, 5: 6, 6: 5, 8: 4 };
        return Math.max(1, Math.round(l / (ratios[size] || 8.33)));
      },
      validateCementStock: () => ({ canProceed: true, sufficient: true, balanceAfter: 100 })
    };
    if (name === '../lib/supabase') return { supabase: null };
    return {};
  };

  const fn = new Function('require', 'module', 'exports', code);
  fn(req, m, m.exports);
  return m.exports;
}

const prodModule = loadComponent('src/operations/Production.jsx');
const { ProductionForm } = prodModule;

test('ProductionForm initial new entry has empty input values (no 0s inserted)', () => {
  const initialNew = {
    id: 'test-session',
    revision: 0,
    date: '2026-11-13',
    status: 'draft',
    notes: '',
    items: [{
      product_id: '',
      size: '',
      default_quantity: '',
      production_lines: '',
      count_1: '',
      count_2: '',
      count_3: '',
      actual_quantity: '',
      rejected_quantity: '',
      cement_packs_used: '',
      line_reading: '',
      starting_line_reading: '',
      ending_line_reading: '',
      cumulative_confirmed: false,
    }]
  };

  const catalog = {
    products: [
      { id: 'p1', name: '8-inch Hollow Brick', kind: 'finished_brick', is_active: true, brick_size: 8, available_quantity: 500 },
      { id: 'c1', name: 'Cement 50kg', kind: 'raw_material', is_active: true, available_quantity: 200 }
    ]
  };

  const html = ReactDOMServer.renderToString(
    React.createElement(ProductionForm, {
      initial: initialNew,
      catalog,
      settings: { timezone: 'Asia/Kolkata', currency: 'INR' },
      owner: true,
      canWrite: true,
      error: '',
      onClose: () => {},
      onSubmit: () => {}
    })
  );

  assert.ok(html.length > 0);
  // Ensure inputs have empty value attribute value=""
  // Specifically production_lines, default_quantity, actual_quantity, rejected_quantity, cement_packs_used, count_1, count_2, count_3
  assert.ok(!html.includes('value="0"'));
  assert.ok(html.includes('placeholder="e.g. 100"'));
  assert.ok(html.includes('placeholder="Auto calculated"'));
});

test('ProductionForm existing saved record preserves actual 0 values', () => {
  const initialSaved = {
    id: 'saved-session',
    revision: 1,
    date: '2026-11-12',
    status: 'draft',
    notes: '',
    items: [{
      product_id: 'p1',
      size: '8',
      default_quantity: 4,
      production_lines: 100,
      count_1: 0,
      count_2: 0,
      count_3: 0,
      actual_quantity: 400,
      rejected_quantity: 0,
      cement_packs_used: 12,
      line_reading: '',
      starting_line_reading: '',
      ending_line_reading: '',
      cumulative_confirmed: false,
    }]
  };

  const catalog = {
    products: [
      { id: 'p1', name: '8-inch Hollow Brick', kind: 'finished_brick', is_active: true, brick_size: 8, available_quantity: 500 }
    ]
  };

  const html = ReactDOMServer.renderToString(
    React.createElement(ProductionForm, {
      initial: initialSaved,
      catalog,
      settings: { timezone: 'Asia/Kolkata', currency: 'INR' },
      owner: true,
      canWrite: true,
      error: '',
      onClose: () => {},
      onSubmit: () => {}
    })
  );

  assert.ok(html.length > 0);
  // Saved record must preserve its 0 values
  assert.ok(html.includes('value="0"'));
  assert.ok(html.includes('value="400"'));
});
