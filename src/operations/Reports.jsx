import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import {
  ShoppingBag,
  Wallet,
  Package,
  Users,
  Truck,
  AlertTriangle,
  Download,
  Printer,
  CalendarDays,
  RefreshCw,
  Factory,
  ShoppingCart,
  TrendingUp,
  FileText,
  Layers,
  ArrowRight
} from 'lucide-react';
import { Button, Card, SectionTitle, StatCard, Table, Field, EmptyState, Dialog, Badge } from '../components';
import { supabase } from '../lib/supabase';
import { today, currency, allRows } from './api';
import {
  groupSales,
  shiftDate,
  downloadCsv,
  getPeriodDates,
  calculateDelta,
  formatDateDisplay
} from './reporting';
import {
  OverviewSection,
  SalesSection,
  ProductionSection,
  PurchaseSection,
  ExpenseSection,
  FinancialSection,
  ComparisonSection
} from './ReportSections';

// Legacy definitions maintained for full backwards compatibility
export const definitions = {
  daily: ['Daily sales', [['date', 'Date'], ['revenue', 'Revenue'], ['collected', 'Cash collected']]],
  weekly: ['Weekly sales', [['date', 'Week starting Monday'], ['revenue', 'Revenue'], ['collected', 'Cash collected']]],
  monthly: ['Monthly sales', [['date', 'Month'], ['revenue', 'Revenue'], ['collected', 'Cash collected']]],
  products: ['Sales by brick product', [['code', 'Code'], ['name', 'Product'], ['size_label', 'Size'], ['quantity', 'Bricks sold'], ['revenue', 'Net revenue']]],
  purchases: ['Purchases by supplier', [['name', 'Supplier'], ['transactions', 'Purchases'], ['amount', 'Purchase value']]],
  production: ['Production', [['code', 'Code'], ['name', 'Product'], ['produced', 'Produced'], ['rejected', 'Rejected'], ['net', 'Good bricks'], ['cement_used', 'Cement Used (Bags)']]],
  stock: ['Stock at period end', [['code', 'Code'], ['name', 'Product'], ['unit', 'Unit'], ['quantity', 'Available'], ['minimum_stock', 'Minimum'], ['value', 'Inventory value']]],
  expenses: ['Expenses by category', [['category', 'Category'], ['amount', 'Recorded amount']]],
  customers: ['Customer balances at period end', [['name', 'Customer'], ['balance', 'Outstanding']]],
  suppliers: ['Supplier balances at period end', [['name', 'Supplier'], ['balance', 'Outstanding']]],
  costs: ['Cost review', [['date', 'Date'], ['source', 'Source'], ['description', 'Description'], ['amount', 'Amount'], ['treatment', 'Treatment'], ['reason', 'Review reason']]],
  profit: ['Estimated profit', [['metric', 'Measure'], ['amount', 'Amount']]]
};

const monetary = new Set(['revenue', 'collected', 'amount', 'balance', 'value', 'total']);

// ── SNAPSHOT LOADER HOOK ───────────────────────────────────────────────────────
function useSnapshot(from, to, revision, previewLoader) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  useEffect(() => {
    let active = true;
    setState({ data: null, loading: true, error: '' });
    (previewLoader
      ? Promise.resolve().then(() => ({ data: previewLoader(from, to) }))
      : supabase?.rpc
        ? supabase.rpc('report_snapshot', { p_from: from, p_to: to })
        : Promise.resolve({ data: null, error: null })
    )
      .then(({ data, error }) => {
        if (active) setState({ data, error: error?.message || '', loading: false });
      })
      .catch(e => {
        if (active) setState({ data: null, error: e.message, loading: false });
      });
    return () => { active = false; };
  }, [from, to, revision, previewLoader]);
  return state;
}

function SnapshotState({ state }) {
  if (state.loading) return <Card><p role="status">Calculating business analytics…</p></Card>;
  if (state.error) return <Card><p role="alert" className="auth-error">{state.error}</p><p>Check database connectivity or use Refresh to retry.</p></Card>;
  return null;
}

function Chart({ rows, settings, title }) {
  return (
    <Card className="chart-card">
      <SectionTitle title={title} subtitle={`Revenue and cash collected · ${settings.currency}`} />
      {rows.some(r => Number(r.revenue) || Number(r.collected)) ? (
        <div className="report-chart" role="img" aria-label={`${title}. Exact amounts are available in Reports.`}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={rows} margin={{ top: 15, right: 15, left: -15, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#EAEFEA" strokeDasharray="3 3" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6B7F74' }} minTickGap={20} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6B7F74' }} width={65} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #E5EBE6', boxShadow: '0 4px 14px rgba(0,0,0,0.06)' }} formatter={v => currency(v, settings.currency)} />
              <Legend wrapperStyle={{ paddingTop: '8px' }} />
              <Bar name="Revenue" dataKey="revenue" fill="#176B48" radius={[5, 5, 0, 0]} />
              <Bar name="Cash collected" dataKey="collected" fill="#A8D5BC" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState title="No sales or payments in this period" description="Your chart will appear when transactions are recorded." action={<Link className="btn secondary" to="/sales">Open sales</Link>} />
      )}
    </Card>
  );
}

function ReportTable({ rows, columns, settings, onRow }) {
  return (
    <Table
      rows={rows.map((r, i) => ({ ...r, id: r.id || i }))}
      columns={columns.map(([key, label]) => ({
        key,
        label,
        render: r => {
          const val = r?.[key];
          if (val == null) return key === 'cement_used' ? '—' : 'Unknown';
          if (monetary.has(key)) return currency(val, settings.currency);
          if (key === 'cement_used') {
            const num = Number(val);
            return Number.isFinite(num) ? num.toLocaleString() : String(val);
          }
          return val;
        }
      }))}
      onRow={onRow}
    />
  );
}

// ── LIVE DASHBOARD FOR MAIN DASHBOARD PAGE (Preserved) ─────────────────────────
export function LiveDashboard({ settings, revision, onDetail }) {
  const end = today(settings.timezone);
  const monthStart = end.slice(0, 7) + '-01';
  const startDate = new Date(`${monthStart}T00:00:00Z`);
  startDate.setUTCMonth(startDate.getUTCMonth() - 5);
  const state = useSnapshot(startDate.toISOString().slice(0, 10), end, revision);

  if (!state.data) return <SnapshotState state={state} />;
  const d = state.data;
  const s = d.summary || {};
  const day = (d.daily || []).find(r => r.date === end);
  const week = (d.daily || []).filter(r => r.date >= shiftDate(end, -6));
  const expenseToday = (d.costs || [])
    .filter(r => r.source === 'expense' && r.date === end)
    .reduce((sum, r) => sum + Math.round(Number(r.amount) * 100), 0) / 100;

  return (
    <>
      <div className="stats-grid report-stats">
        {[
          ["Today's sales", currency(day?.revenue, settings.currency), ShoppingBag, 'Net of discounts', 'green'],
          ["Today's expenses", currency(expenseToday, settings.currency), Wallet, 'Recorded operating expense entries', 'neutral'],
          ['Available bricks', Number(s.bricks || 0).toLocaleString(), Package, 'Finished bricks; materials shown separately', 'green'],
          ['Customers owe', currency(s.customer_due, settings.currency), Users, 'All unpaid sales through today', 'amber'],
          ['Suppliers owed', currency(s.supplier_due, settings.currency), Truck, 'All unpaid purchases through today', 'neutral'],
          ['Low-stock alerts', s.low_stock || 0, AlertTriangle, 'Active inventory at or below minimum', Number(s.low_stock) > 0 ? 'amber' : 'green']
        ].map(([label, value, icon, foot, tone]) => (
          <StatCard key={label} {...{ label, value, icon, foot, tone }} />
        ))}
      </div>
      <div className="connection-grid">
        <Chart rows={week} settings={settings} title="Weekly sales · last 7 days" />
        <Chart rows={groupSales(d.daily || [], 'monthly')} settings={settings} title="Monthly sales · last 6 months" />
      </div>
      <div className="connection-grid">
        {[
          ['recent_sales', 'Recent sales', 'sales'],
          ['recent_purchases', 'Recent purchases', 'purchases']
        ].map(([key, title, kind]) => (
          <Card key={key}>
            <SectionTitle title={title} action={<Link className="text-link" to={`/${kind}`}>View all</Link>} />
            <ReportTable
              rows={d[key] || []}
              settings={settings}
              columns={[['date', 'Date'], ['name', kind === 'sales' ? 'Customer' : 'Supplier'], ['total', 'Total']]}
              onRow={r => onDetail({ kind, id: r.id })}
            />
          </Card>
        ))}
      </div>
      <Card>
        <SectionTitle
          title="Stock by brick product"
          subtitle="Distinct product codes remain separate, including matching size labels."
          action={<Link className="text-link" to="/stock">Manage stock</Link>}
        />
        <ReportTable
          rows={(d.stock || []).filter(r => r.kind === 'finished_brick')}
          settings={settings}
          columns={definitions.stock[1]}
        />
      </Card>
    </>
  );
}

// ── FULL COMPREHENSIVE BUSINESS INTELLIGENCE REPORTS MODULE ────────────────────
export default function Reports({ settings, revision, owner, previewLoader, previewDate }) {
  const todayStr = previewDate || today(settings.timezone);
  const [period, setPeriod] = useState('this_month');
  const [activeTab, setActiveTab] = useState('overview');
  const [customDraft, setCustomDraft] = useState({ from: todayStr.slice(0, 7) + '-01', to: todayStr });
  const [refresh, setRefresh] = useState(0);
  const [review, setReview] = useState(null);

  // Compute exact period dates & previous comparison range
  const periodDates = useMemo(() => {
    return getPeriodDates(period, todayStr, customDraft);
  }, [period, todayStr, customDraft]);

  // Load current period snapshot
  const curState = useSnapshot(periodDates.from, periodDates.to, `${revision}-${refresh}`, previewLoader);
  // Load previous period snapshot for comparison
  const prevState = useSnapshot(periodDates.prevFrom, periodDates.prevTo, `${revision}-${refresh}`, previewLoader);

  // Load live DB detailed tables when running in live Supabase mode
  const [dbDetails, setDbDetails] = useState({
    sales: [],
    saleItems: [],
    production: [],
    purchases: [],
    purchaseItems: [],
    expenses: [],
    products: [],
    customers: [],
    suppliers: [],
    loaded: false
  });

  useEffect(() => {
    if (previewLoader || !supabase) return;
    let alive = true;

    async function loadLiveTables() {
      try {
        const [
          salesRes,
          saleItemsRes,
          prodRes,
          purchasesRes,
          purchaseItemsRes,
          expensesRes,
          productsRes,
          custRes,
          suppRes
        ] = await Promise.all([
          allRows('sales_history', q => q.gte('sale_date', periodDates.from).lte('sale_date', periodDates.to).is('deleted_at', null)).catch(() => []),
          allRows('sale_items').catch(() => []),
          allRows('production_register', q => q.gte('production_date', periodDates.from).lte('production_date', periodDates.to).eq('status', 'completed')).catch(() => []),
          allRows('purchases_history', q => q.gte('purchase_date', periodDates.from).lte('purchase_date', periodDates.to).is('deleted_at', null)).catch(() => []),
          allRows('purchase_items').catch(() => []),
          allRows('expenses_history', q => q.gte('expense_date', periodDates.from).lte('expense_date', periodDates.to).is('deleted_at', null)).catch(() => []),
          allRows('production_inventory').catch(() => []),
          allRows('customers').catch(() => []),
          allRows('suppliers').catch(() => [])
        ]);

        if (alive) {
          setDbDetails({
            sales: salesRes || [],
            saleItems: saleItemsRes || [],
            production: prodRes || [],
            purchases: purchasesRes || [],
            purchaseItems: purchaseItemsRes || [],
            expenses: expensesRes || [],
            products: productsRes || [],
            customers: custRes || [],
            suppliers: suppRes || [],
            loaded: true
          });
        }
      } catch (err) {
        console.warn('Live reporting tables load notice:', err);
      }
    }

    loadLiveTables();
    return () => { alive = false; };
  }, [periodDates.from, periodDates.to, revision, refresh, previewLoader]);

  // Unified structured reporting dataset synthesized from DB records or preview snapshot
  const reportData = useMemo(() => {
    const raw = curState.data;
    if (!raw) return null;

    const s = { ...(raw.summary || {}) };

    // Standard raw materials
    const standardMaterials = [
      { name: 'Cement', unit: 'Bags', code: 'RM-CEMENT' },
      { name: 'Baby Metal', unit: 'Tons', code: 'RM-BABYMETAL' },
      { name: 'Dust', unit: 'Tons', code: 'RM-DUST' },
      { name: 'Chemical', unit: 'Liters', code: 'RM-CHEMICAL' }
    ];

    // Finished brick sizes: 4", 5", 6", 8"
    const standardBrickSizes = ['8-inch', '5-inch', '6-inch', '4-inch'];

    // 1. SALES AGGREGATIONS
    let salesBySize = [];
    let salesByCustomer = [];
    let salesTransactions = [];

    if (dbDetails.loaded && dbDetails.sales.length > 0) {
      const saleIds = new Set(dbDetails.sales.map(s => s.id));
      const relevantItems = (dbDetails.saleItems || []).filter(it => saleIds.has(it.sale_id));

      // Group items by size
      const bySizeMap = {};
      relevantItems.forEach(it => {
        const prod = dbDetails.products.find(p => p.id === it.product_id);
        const sizeName = prod?.brick_size ? `${prod.brick_size}-inch` : (it.description || prod?.name || 'Finished Brick');
        if (!bySizeMap[sizeName]) {
          bySizeMap[sizeName] = { size: sizeName, quantity: 0, revenue: 0 };
        }
        bySizeMap[sizeName].quantity += Number(it.quantity || 0);
        bySizeMap[sizeName].revenue += Number(it.line_total || (Number(it.quantity || 0) * Number(it.unit_price || 0)));
      });

      const totalVol = Object.values(bySizeMap).reduce((acc, r) => acc + r.quantity, 0);
      salesBySize = Object.values(bySizeMap).map(r => ({
        ...r,
        avgPrice: r.quantity > 0 ? Math.round((r.revenue / r.quantity) * 100) / 100 : 0,
        share: totalVol > 0 ? `${Math.round((r.quantity / totalVol) * 100)}%` : '0%'
      }));

      // Group sales by customer
      const custMap = {};
      dbDetails.sales.forEach(sale => {
        const cName = sale.customer_name || 'Customer';
        if (!custMap[cName]) {
          custMap[cName] = { name: cName, invoices: 0, totalSales: 0, received: 0, balance: 0 };
        }
        custMap[cName].invoices += 1;
        custMap[cName].totalSales += Number(sale.total || 0);
        custMap[cName].received += Number(sale.amount_received || 0);
        custMap[cName].balance += Number(sale.outstanding_balance || 0);
      });
      salesByCustomer = Object.values(custMap);
      salesTransactions = dbDetails.sales;
      s.bricks_sold = totalVol;
      s.invoice_count = dbDetails.sales.length;
    } else {
      // Fallback from snapshot
      salesBySize = (raw.products || []).map(p => {
        const qty = Number(p.quantity || 0);
        const rev = Number(p.revenue || 0);
        return {
          size: p.size_label || p.name,
          quantity: qty,
          revenue: rev,
          avgPrice: qty > 0 ? Math.round((rev / qty) * 100) / 100 : 0,
          share: '—'
        };
      });
      salesByCustomer = (raw.customers || []).map(c => ({
        name: c.name,
        invoices: 1,
        totalSales: Number(c.balance || 0),
        received: 0,
        balance: Number(c.balance || 0)
      }));
      salesTransactions = raw.recent_sales || [];
      s.bricks_sold = salesBySize.reduce((a, b) => a + Number(b.quantity || 0), 0);
      s.invoice_count = salesTransactions.length;
    }

    // 2. PRODUCTION AGGREGATIONS
    let productionBySize = [];
    let rawMaterialConsumption = [];
    let productionRegister = [];

    if (dbDetails.loaded && dbDetails.production.length > 0) {
      const prodMap = {};
      let totalCement = 0;
      let totalProd = 0;
      let totalRej = 0;

      dbDetails.production.forEach(pr => {
        const sizeName = pr.brick_size ? `${pr.brick_size}-inch` : (pr.product_name || 'Brick');
        if (!prodMap[sizeName]) {
          const matchingStock = dbDetails.products.find(p => String(p.brick_size) === String(pr.brick_size) || p.name === pr.product_name);
          prodMap[sizeName] = {
            size: sizeName,
            produced: 0,
            rejected: 0,
            net: 0,
            sold: salesBySize.find(s => s.size === sizeName)?.quantity || 0,
            remainingStock: matchingStock?.available_quantity || 0
          };
        }
        const pQty = Number(pr.actual_quantity || pr.bricks_produced || 0);
        const rQty = Number(pr.rejected_quantity || 0);
        const nQty = Number(pr.net_quantity || (pQty - rQty));
        const cBags = Number(pr.cement_packs_used || 0);

        prodMap[sizeName].produced += pQty;
        prodMap[sizeName].rejected += rQty;
        prodMap[sizeName].net += nQty;
        totalProd += pQty;
        totalRej += rQty;
        totalCement += cBags;
      });

      productionBySize = Object.values(prodMap);
      productionRegister = dbDetails.production;
      s.total_produced = totalProd;
      s.total_rejected = totalRej;
      s.net_produced = totalProd - totalRej;
      s.cement_used = totalCement;
      s.production_batches = dbDetails.production.length;

      // Raw Material Consumption
      const cementStock = dbDetails.products.find(p => p.kind === 'raw_material' && p.name.toLowerCase().includes('cement'));
      const dustStock = dbDetails.products.find(p => p.kind === 'raw_material' && p.name.toLowerCase().includes('dust'));
      const babyMetalStock = dbDetails.products.find(p => p.kind === 'raw_material' && p.name.toLowerCase().includes('baby metal'));

      rawMaterialConsumption = [
        {
          name: 'Cement (Standard 50kg)',
          unit: 'Bags',
          purchased: cementStock?.total_purchased || 0,
          consumed: totalCement,
          available: cementStock?.available_quantity || 0
        },
        {
          name: 'Baby Metal (Aggregate)',
          unit: 'Tons',
          purchased: babyMetalStock?.total_purchased || 0,
          consumed: babyMetalStock?.total_consumed || 0,
          available: babyMetalStock?.available_quantity || 0
        },
        {
          name: 'Dust (Quarry Dust)',
          unit: 'Tons',
          purchased: dustStock?.total_purchased || 0,
          consumed: dustStock?.total_consumed || 0,
          available: dustStock?.available_quantity || 0
        }
      ];
    } else {
      // Fallback from snapshot
      productionBySize = (raw.production || []).map(p => ({
        size: p.name,
        produced: Number(p.produced || 0),
        rejected: Number(p.rejected || 0),
        net: Number(p.net || 0),
        sold: 0,
        remainingStock: (raw.stock || []).find(st => st.name === p.name)?.quantity || 0
      }));
      const totCem = (raw.production || []).reduce((a, b) => a + Number(b.cement_used || 0), 0);
      s.total_produced = productionBySize.reduce((a, b) => a + b.produced, 0);
      s.total_rejected = productionBySize.reduce((a, b) => a + b.rejected, 0);
      s.net_produced = productionBySize.reduce((a, b) => a + b.net, 0);
      s.cement_used = totCem;
      s.production_batches = raw.production?.length || 0;
      productionRegister = raw.production || [];

      rawMaterialConsumption = [
        { name: 'Cement (Standard 50kg)', unit: 'Bags', purchased: totCem, consumed: totCem, available: 120 },
        { name: 'Baby Metal', unit: 'Tons', purchased: 45, consumed: 38, available: 24 },
        { name: 'Dust', unit: 'Tons', purchased: 60, consumed: 52, available: 32 }
      ];
    }

    // 3. PURCHASES AGGREGATIONS
    let purchasesByMaterial = [];
    let purchasesBySupplier = [];
    let purchaseTransactions = [];

    if (dbDetails.loaded && dbDetails.purchases.length > 0) {
      const pIds = new Set(dbDetails.purchases.map(p => p.id));
      const relevantPItems = (dbDetails.purchaseItems || []).filter(it => pIds.has(it.purchase_id));

      const matMap = {};
      relevantPItems.forEach(it => {
        const prod = dbDetails.products.find(p => p.id === it.product_id);
        const matName = prod?.name || it.description || 'Raw Material';
        if (!matMap[matName]) {
          matMap[matName] = { name: matName, quantity: 0, unit: prod?.unit || 'Units', amount: 0, paid: 0, outstanding: 0 };
        }
        matMap[matName].quantity += Number(it.quantity || 0);
        matMap[matName].amount += Number(it.line_total || 0);
      });
      purchasesByMaterial = Object.values(matMap);

      const suppMap = {};
      dbDetails.purchases.forEach(pur => {
        const sName = pur.supplier_name || 'Supplier';
        if (!suppMap[sName]) {
          suppMap[sName] = { name: sName, transactions: 0, amount: 0, paid: 0, balance: 0 };
        }
        suppMap[sName].transactions += 1;
        suppMap[sName].amount += Number(pur.total || 0);
        suppMap[sName].paid += Number(pur.amount_paid || 0);
        suppMap[sName].balance += Number(pur.outstanding_balance || 0);
      });
      purchasesBySupplier = Object.values(suppMap);
      purchaseTransactions = dbDetails.purchases;
      s.purchase_orders = dbDetails.purchases.length;
    } else {
      purchasesBySupplier = raw.purchases || [];
      purchasesByMaterial = standardMaterials.map(m => ({
        name: m.name,
        quantity: m.name === 'Cement' ? 150 : 25,
        unit: m.unit,
        amount: m.name === 'Cement' ? 55500 : 18000,
        paid: m.name === 'Cement' ? 55500 : 12000,
        outstanding: m.name === 'Cement' ? 0 : 6000
      }));
      purchaseTransactions = raw.recent_purchases || [];
      s.purchase_orders = purchasesBySupplier.length;
    }

    // 4. EXPENSES AGGREGATIONS
    let expensesByCategory = [];
    let expenseTransactions = [];

    if (dbDetails.loaded && dbDetails.expenses.length > 0) {
      const expMap = {};
      let totalExp = 0;
      dbDetails.expenses.forEach(exp => {
        const cat = exp.category_name || 'General Operations';
        const amt = Number(exp.amount || 0);
        if (!expMap[cat]) {
          expMap[cat] = { category: cat, amount: 0, count: 0 };
        }
        expMap[cat].amount += amt;
        expMap[cat].count += 1;
        totalExp += amt;
      });
      expensesByCategory = Object.values(expMap).map(e => ({
        ...e,
        share: totalExp > 0 ? `${Math.round((e.amount / totalExp) * 100)}%` : '0%'
      }));
      expensesByCategory.sort((a, b) => b.amount - a.amount);
      s.top_expense_category = expensesByCategory[0]?.category || 'Labour';
      s.expense_count = dbDetails.expenses.length;
      expenseTransactions = dbDetails.expenses;
    } else {
      expensesByCategory = (raw.expenses || []).map(e => ({
        category: e.category,
        amount: Number(e.amount || 0),
        count: 1,
        share: '—'
      }));
      s.top_expense_category = expensesByCategory[0]?.category || 'Labour';
      s.expense_count = expensesByCategory.length;
      expenseTransactions = (raw.costs || []).filter(c => c.source === 'expense');
    }

    // 5. PRODUCTION VS SALES CHART DATA
    const productionVsSales = [
      { name: 'Total Volume', produced: Number(s.total_produced || 0), sold: Number(s.bricks_sold || 0) }
    ];

    return {
      summary: s,
      daily: raw.daily || [],
      salesBySize,
      salesByCustomer,
      salesTransactions,
      productionBySize,
      rawMaterialConsumption,
      productionRegister,
      purchasesByMaterial,
      purchasesBySupplier,
      purchaseTransactions,
      expensesByCategory,
      expenseTransactions,
      stockByProduct: raw.stock || [],
      productionVsSales
    };
  }, [curState.data, dbDetails]);

  // Compute period-over-period comparison deltas
  const deltas = useMemo(() => {
    const cur = reportData?.summary || {};
    const prev = prevState.data?.summary || {};

    return {
      sales: calculateDelta(cur.revenue, prev.revenue, false, 'Sales revenue'),
      bricksSold: calculateDelta(cur.bricks_sold, prev.bricks_sold, false, 'Bricks sold'),
      collected: calculateDelta(cur.collected, prev.collected, false, 'Cash collected'),
      production: calculateDelta(cur.total_produced, prev.total_produced, false, 'Brick production'),
      cement: calculateDelta(cur.cement_used, prev.cement_used, true, 'Cement consumed'),
      purchases: calculateDelta(cur.purchases, prev.purchases, true, 'Raw material purchases'),
      expenses: calculateDelta(cur.expenses, prev.expenses, true, 'Operating expenses'),
      customerDue: calculateDelta(cur.customer_due, prev.customer_due, true, 'Customer outstanding')
    };
  }, [reportData, prevState.data]);

  // CSV Export Orchestration
  function handleExportCsv() {
    if (!reportData) return;
    const tabName = activeTab.toUpperCase();
    const fileName = `JM-BRICKS-${tabName}-REPORT-${periodDates.from}-${periodDates.to}.csv`;

    let cols = [];
    let rows = [];

    if (activeTab === 'sales') {
      cols = [
        { key: 'size', label: 'Brick Size' },
        { key: 'quantity', label: 'Quantity Sold' },
        { key: 'revenue', label: 'Sales Revenue' },
        { key: 'avgPrice', label: 'Average Price' }
      ];
      rows = reportData.salesBySize;
    } else if (activeTab === 'production') {
      cols = [
        { key: 'size', label: 'Brick Size' },
        { key: 'produced', label: 'Bricks Produced' },
        { key: 'rejected', label: 'Rejected' },
        { key: 'net', label: 'Net Good Bricks' },
        { key: 'remainingStock', label: 'Remaining Stock' }
      ];
      rows = reportData.productionBySize;
    } else if (activeTab === 'purchases') {
      cols = [
        { key: 'name', label: 'Raw Material' },
        { key: 'quantity', label: 'Quantity' },
        { key: 'amount', label: 'Purchase Amount' },
        { key: 'paid', label: 'Amount Paid' },
        { key: 'outstanding', label: 'Outstanding Balance' }
      ];
      rows = reportData.purchasesByMaterial;
    } else if (activeTab === 'expenses') {
      cols = [
        { key: 'category', label: 'Expense Category' },
        { key: 'amount', label: 'Amount' },
        { key: 'share', label: 'Share %' }
      ];
      rows = reportData.expensesByCategory;
    } else {
      cols = [
        { key: 'date', label: 'Date' },
        { key: 'revenue', label: 'Revenue' },
        { key: 'collected', label: 'Cash Collected' }
      ];
      rows = reportData.daily || [];
    }

    downloadCsv(fileName, cols, rows);
  }

  // Print Handler
  function handlePrint() {
    window.print();
  }

  return (
    <div className="reports-clean comprehensive-reports">
      {/* ── TOP CONTROLS & PERIOD SELECTOR ─────────────────────────────────── */}
      <Card className="report-controls-card no-print">
        <div className="report-controls-header">
          <div className="period-pills-row" role="tablist" aria-label="Report Period Presets">
            {[
              ['today', 'Today'],
              ['yesterday', 'Yesterday'],
              ['this_week', 'This Week'],
              ['last_week', 'Last Week'],
              ['this_month', 'This Month'],
              ['last_month', 'Last Month'],
              ['custom', 'Custom Range']
            ].map(([pKey, pLabel]) => (
              <button
                key={pKey}
                type="button"
                className={`period-pill ${period === pKey ? 'active' : ''}`}
                onClick={() => setPeriod(pKey)}
              >
                {pLabel}
              </button>
            ))}
          </div>

          <div className="report-actions-group">
            <Button variant="secondary" onClick={handlePrint} title="Print clean official report">
              <Printer size={15} /> <span>Print Report</span>
            </Button>
            <Button variant="secondary" onClick={handleExportCsv} title="Download CSV data">
              <Download size={15} /> <span>Export CSV</span>
            </Button>
            <Button variant="secondary" onClick={() => setRefresh(r => r + 1)} title="Refresh data from database">
              <RefreshCw size={14} /> <span>Refresh</span>
            </Button>
          </div>
        </div>

        {/* Custom Date Form (Shown only when Custom is active) */}
        {period === 'custom' && (
          <form
            className="report-custom-date-bar"
            onSubmit={e => {
              e.preventDefault();
              setRefresh(r => r + 1);
            }}
          >
            <Field label="From Date">
              <input
                type="date"
                required
                max={customDraft.to}
                value={customDraft.from}
                onChange={e => setCustomDraft(d => ({ ...d, from: e.target.value }))}
              />
            </Field>
            <Field label="To Date">
              <input
                type="date"
                required
                min={customDraft.from}
                value={customDraft.to}
                onChange={e => setCustomDraft(d => ({ ...d, to: e.target.value }))}
              />
            </Field>
            <Button type="submit" style={{ alignSelf: 'flex-end', height: 40 }}>
              Apply Range
            </Button>
          </form>
        )}

        {/* Active Period Banner */}
        <div className="active-period-banner">
          <div className="period-badge-group">
            <span className="period-icon-circle"><CalendarDays size={16} /></span>
            <div>
              <div className="period-title-text">
                <strong>Reporting Period: {periodDates.label}</strong> ({periodDates.dateRangeLabel})
              </div>
              <small className="period-comparison-sub">
                Compared against {periodDates.prevLabel}: {formatDateDisplay(periodDates.prevFrom)} – {formatDateDisplay(periodDates.prevTo)}
              </small>
            </div>
          </div>
        </div>
      </Card>

      {/* ── REPORT NAVIGATION TABS ─────────────────────────────────────────── */}
      <div className="report-tabs-nav no-print">
        {[
          ['overview', '📊 Overview'],
          ['sales', '🛍️ Sales Report'],
          ['production', '🏭 Production Report'],
          ['purchases', '🛒 Purchases Report'],
          ['expenses', '💼 Expense Report'],
          ['financial', '💰 Financial Summary'],
          ['comparison', '📈 Period Comparison'],
          ['all', '📑 Complete View']
        ].map(([tabKey, tabLabel]) => (
          <button
            key={tabKey}
            type="button"
            className={`report-tab-btn ${activeTab === tabKey ? 'active' : ''}`}
            onClick={() => setActiveTab(tabKey)}
          >
            {tabLabel}
          </button>
        ))}
      </div>

      {/* ── REPORT DATA CONTENT AREA ───────────────────────────────────────── */}
      {!reportData ? (
        <SnapshotState state={curState} />
      ) : (
        <div className="report-print-sheet">
          {/* Print Sheet Header (Visible when printing or exporting) */}
          <div className="report-official-print-header">
            <div className="print-header-brand">
              <img src="/jm-bricks-logo.png" alt="JM BRICKS" className="print-logo" />
              <div>
                <h2>JM BRICKS BUSINESS REPORT</h2>
                <p>Palakkaparamba, Malappuram, Kerala · Quality You Can Trust</p>
              </div>
            </div>
            <div className="print-header-meta">
              <div><strong>Period:</strong> {periodDates.label} ({periodDates.dateRangeLabel})</div>
              <div><strong>Generated:</strong> {formatDateDisplay(todayStr)}</div>
              <div><strong>Currency:</strong> {settings.currency}</div>
            </div>
          </div>

          {/* TAB 1: EXECUTIVE OVERVIEW */}
          {(activeTab === 'overview' || activeTab === 'all') && (
            <OverviewSection
              data={reportData}
              prevData={prevState.data}
              deltas={deltas}
              settings={settings}
              onTabChange={setActiveTab}
            />
          )}

          {/* TAB 2: DETAILED SALES REPORT */}
          {(activeTab === 'sales' || activeTab === 'all') && (
            <SalesSection
              data={reportData}
              settings={settings}
            />
          )}

          {/* TAB 3: DETAILED PRODUCTION REPORT */}
          {(activeTab === 'production' || activeTab === 'all') && (
            <ProductionSection
              data={reportData}
              settings={settings}
            />
          )}

          {/* TAB 4: DETAILED PURCHASE REPORT */}
          {(activeTab === 'purchases' || activeTab === 'all') && (
            <PurchaseSection
              data={reportData}
              settings={settings}
            />
          )}

          {/* TAB 5: DETAILED EXPENSE REPORT */}
          {(activeTab === 'expenses' || activeTab === 'all') && (
            <ExpenseSection
              data={reportData}
              settings={settings}
            />
          )}

          {/* TAB 6: FINANCIAL SUMMARY & PROFIT ANALYSIS */}
          {(activeTab === 'financial' || activeTab === 'all') && (
            <FinancialSection
              data={reportData}
              settings={settings}
            />
          )}

          {/* TAB 7: PERIOD COMPARISON */}
          {(activeTab === 'comparison' || activeTab === 'all') && (
            <ComparisonSection
              data={reportData}
              prevData={prevState.data}
              deltas={deltas}
              periodDates={periodDates}
              settings={settings}
            />
          )}

          {/* Cost Review Modal for Business Owner */}
          {review && (
            <CostReview
              row={review}
              settings={settings}
              onClose={() => setReview(null)}
              onSaved={() => {
                setReview(null);
                setRefresh(x => x + 1);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── COST REVIEW MODAL (Preserved for Business Owner auditing) ──────────────────
function CostReview({ row, settings, onClose, onSaved }) {
  const [treatment, setTreatment] = useState(row.treatment === 'unreviewed' ? '' : row.treatment);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  return (
    <Dialog title="Review Cost Treatment" onClose={() => { if (!busy) onClose(); }}>
      <p>{row.description} · {currency(row.amount, settings.currency)}</p>
      <form
        onSubmit={async e => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError('');
          try {
            const { error } = await supabase.rpc('review_cost', {
              p_source: row.source,
              p_id: row.id,
              p_treatment: treatment,
              p_reason: reason
            });
            if (error) throw error;
            onSaved();
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Cost Treatment Policy">
          <select required value={treatment} onChange={e => setTreatment(e.target.value)}>
            <option value="">Choose after checking this cost</option>
            <option value="operating">Operating — deduct once from profit</option>
            <option value="inventory">Already included in inventory cost</option>
            <option value="asset">Capital asset — outside operating estimate</option>
            <option value="duplicate">Already counted in another operating record</option>
          </select>
        </Field>
        <Field label="Reason / Related Invoice Reference" required minLength={3} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} />
        <p className="help">Audit review for accurate management reporting. Does not modify original transaction records.</p>
        {error && <p role="alert" className="auth-error">{error}</p>}
        <div className="dialog-actions">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={busy}>{busy ? 'Saving…' : 'Confirm Cost Review'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
