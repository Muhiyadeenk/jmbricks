import React, { useState, useMemo } from 'react';
import {
  ShoppingBag,
  Factory,
  ShoppingCart,
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Package,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  Filter,
  Users,
  Truck,
  Layers,
  Percent,
  CircleDollarSign,
  Receipt,
  FileSpreadsheet
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';
import { Button, Card, SectionTitle, Table, Badge, EmptyState } from '../components';
import { currency } from './api';
import { formatDateDisplay } from './reporting';

const CHART_COLORS = ['#176B48', '#25D366', '#2A8F62', '#E9A23B', '#3B82F6', '#8B5CF6', '#EC4899', '#64748B'];

// ── 1. BUSINESS OVERVIEW TAB ──────────────────────────────────────────────────
export function OverviewSection({ data, prevData, deltas, settings, onTabChange }) {
  const s = data?.summary || {};
  const prevS = prevData?.summary || {};

  return (
    <div className="report-tab-content">
      {/* 4 Core Business Overview Cards */}
      <div className="report-kpi-grid">
        {/* Sales KPI Card */}
        <Card className="report-overview-card sales-card">
          <div className="card-top-header">
            <div className="card-title-group">
              <span className="card-icon-box green"><ShoppingBag size={20} /></span>
              <div>
                <h3>Sales Performance</h3>
                <small>Revenue & brick delivery</small>
              </div>
            </div>
            {deltas.sales && (
              <span className={`delta-badge ${deltas.sales.isFavorable ? 'favorable' : 'unfavorable'}`}>
                {deltas.sales.direction === 'up' ? <TrendingUp size={13} /> : deltas.sales.direction === 'down' ? <TrendingDown size={13} /> : null}
                {deltas.sales.badgeText}
              </span>
            )}
          </div>
          <div className="card-main-metric">
            <strong>{currency(s.revenue, settings.currency)}</strong>
            <span className="metric-sublabel">Total Sales</span>
          </div>
          <div className="card-metric-list">
            <div className="metric-row">
              <span>Bricks Sold:</span>
              <strong>{Number(s.bricks_sold || s.bricksSold || 0).toLocaleString()} Bricks</strong>
            </div>
            <div className="metric-row">
              <span>Amount Received:</span>
              <strong className="text-green">{currency(s.collected, settings.currency)}</strong>
            </div>
            <div className="metric-row">
              <span>Customer Balance Due:</span>
              <strong className={Number(s.customer_due || 0) > 0 ? 'text-amber' : ''}>{currency(s.customer_due, settings.currency)}</strong>
            </div>
          </div>
          <div className="card-narrative-footer">
            <p>{deltas.sales?.narrative || 'Sales revenue for the selected period.'}</p>
            <button type="button" className="card-link-btn" onClick={() => onTabChange('sales')}>
              View Sales Details <ArrowRight size={13} />
            </button>
          </div>
        </Card>

        {/* Production KPI Card */}
        <Card className="report-overview-card production-card">
          <div className="card-top-header">
            <div className="card-title-group">
              <span className="card-icon-box dark-green"><Factory size={20} /></span>
              <div>
                <h3>Bricks Made</h3>
                <small>Manufacturing & cement sync</small>
              </div>
            </div>
            {deltas.production && (
              <span className={`delta-badge ${deltas.production.isFavorable ? 'favorable' : 'unfavorable'}`}>
                {deltas.production.direction === 'up' ? <TrendingUp size={13} /> : deltas.production.direction === 'down' ? <TrendingDown size={13} /> : null}
                {deltas.production.badgeText}
              </span>
            )}
          </div>
          <div className="card-main-metric">
            <strong>{Number(s.total_produced || s.produced || 0).toLocaleString()}</strong>
            <span className="metric-sublabel">Total Bricks Produced</span>
          </div>
          <div className="card-metric-list">
            <div className="metric-row">
              <span>Good Bricks:</span>
              <strong className="text-green">{Number(s.net_produced || s.net || s.total_produced || 0).toLocaleString()} Bricks</strong>
            </div>
            <div className="metric-row">
              <span>Cement Consumed:</span>
              <strong>{Number(s.cement_used || 0).toLocaleString()} Bags</strong>
            </div>
            <div className="metric-row">
              <span>Production Batches:</span>
              <strong>{Number(s.production_batches || s.batches || 0)} Batches</strong>
            </div>
          </div>
          <div className="card-narrative-footer">
            <p>{deltas.production?.narrative || 'Production batches completed in this period.'}</p>
            <button type="button" className="card-link-btn" onClick={() => onTabChange('production')}>
              View Production Details <ArrowRight size={13} />
            </button>
          </div>
        </Card>

        {/* Purchases KPI Card */}
        <Card className="report-overview-card purchases-card">
          <div className="card-top-header">
            <div className="card-title-group">
              <span className="card-icon-box amber"><ShoppingCart size={20} /></span>
              <div>
                <h3>Raw Material Purchases</h3>
                <small>Inflow of cement, dust & metal</small>
              </div>
            </div>
            {deltas.purchases && (
              <span className={`delta-badge ${deltas.purchases.isFavorable ? 'favorable' : 'unfavorable'}`}>
                {deltas.purchases.direction === 'up' ? <TrendingUp size={13} /> : deltas.purchases.direction === 'down' ? <TrendingDown size={13} /> : null}
                {deltas.purchases.badgeText}
              </span>
            )}
          </div>
          <div className="card-main-metric">
            <strong>{currency(s.purchases, settings.currency)}</strong>
            <span className="metric-sublabel">Total Purchase Amount</span>
          </div>
          <div className="card-metric-list">
            <div className="metric-row">
              <span>Payments Paid:</span>
              <strong>{currency(s.supplier_paid, settings.currency)}</strong>
            </div>
            <div className="metric-row">
              <span>Supplier Balance Due:</span>
              <strong className={Number(s.supplier_due || 0) > 0 ? 'text-amber' : ''}>{currency(s.supplier_due, settings.currency)}</strong>
            </div>
            <div className="metric-row">
              <span>Purchase Invoices:</span>
              <strong>{Number(s.purchase_orders || s.purchaseCount || 0)} Orders</strong>
            </div>
          </div>
          <div className="card-narrative-footer">
            <p>{deltas.purchases?.narrative || 'Raw material purchases recorded in this period.'}</p>
            <button type="button" className="card-link-btn" onClick={() => onTabChange('purchases')}>
              View Purchase Details <ArrowRight size={13} />
            </button>
          </div>
        </Card>

        {/* Expenses KPI Card */}
        <Card className="report-overview-card expenses-card">
          <div className="card-top-header">
            <div className="card-title-group">
              <span className="card-icon-box purple"><Wallet size={20} /></span>
              <div>
                <h3>Total Expenses</h3>
                <small>Labour, fuel, power & yard upkeep</small>
              </div>
            </div>
            {deltas.expenses && (
              <span className={`delta-badge ${deltas.expenses.isFavorable ? 'favorable' : 'unfavorable'}`}>
                {deltas.expenses.direction === 'up' ? <TrendingUp size={13} /> : deltas.expenses.direction === 'down' ? <TrendingDown size={13} /> : null}
                {deltas.expenses.badgeText}
              </span>
            )}
          </div>
          <div className="card-main-metric">
            <strong>{currency(s.expenses, settings.currency)}</strong>
            <span className="metric-sublabel">Total Expenses</span>
          </div>
          <div className="card-metric-list">
            <div className="metric-row">
              <span>Transactions:</span>
              <strong>{Number(s.expense_count || s.expenseCount || 0)} Entries</strong>
            </div>
            <div className="metric-row">
              <span>Top Expense:</span>
              <strong>{s.top_expense_category || 'General'}</strong>
            </div>
            <div className="metric-row">
              <span>Average Daily:</span>
              <strong>{currency(s.daily_avg_expense || 0, settings.currency)}</strong>
            </div>
          </div>
          <div className="card-narrative-footer">
            <p>{deltas.expenses?.narrative || 'Operating expense entries recorded in this period.'}</p>
            <button type="button" className="card-link-btn" onClick={() => onTabChange('expenses')}>
              View Expense Analytics <ArrowRight size={13} />
            </button>
          </div>
        </Card>
      </div>

      {/* Visual Trend Highlight Grid */}
      <div className="report-charts-grid">
        <Card className="chart-card">
          <SectionTitle
            title="Sales and Money Received"
            subtitle={`Comparing total sales with money received · ${settings.currency}`}
          />
          <div className="chart-container" style={{ height: 260 }}>
            {data?.daily && data.daily.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.daily} margin={{ top: 15, right: 15, left: -10, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#EAEFEA" strokeDasharray="3 3" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6B7F74' }} minTickGap={20} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6B7F74' }} width={65} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #E5EBE6', boxShadow: '0 4px 14px rgba(0,0,0,0.06)' }} formatter={v => currency(v, settings.currency)} />
                  <Legend wrapperStyle={{ paddingTop: '6px' }} />
                  <Bar name="Sales Revenue" dataKey="revenue" fill="#176B48" radius={[4, 4, 0, 0]} />
                  <Bar name="Money Received" dataKey="collected" fill="#25D366" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No trend data for this period" description="Record sales and payments to populate visual trends." />
            )}
          </div>
        </Card>

        <Card className="chart-card">
          <SectionTitle
            title="Sales vs Bricks Made"
            subtitle="Comparing total bricks manufactured vs delivered to customers"
          />
          <div className="chart-container" style={{ height: 260 }}>
            {data?.productionVsSales && data.productionVsSales.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.productionVsSales} margin={{ top: 15, right: 15, left: -10, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#EAEFEA" strokeDasharray="3 3" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6B7F74' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6B7F74' }} width={60} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #E5EBE6' }} formatter={v => Number(v).toLocaleString() + ' Bricks'} />
                  <Legend wrapperStyle={{ paddingTop: '6px' }} />
                  <Bar name="Manufactured" dataKey="produced" fill="#104B35" radius={[4, 4, 0, 0]} />
                  <Bar name="Sold & Delivered" dataKey="sold" fill="#E9A23B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No production or sales comparison" description="Data will appear once production and sales entries exist." />
            )}
          </div>
        </Card>
      </div>

      {/* Stock Health Quick Summary */}
      <Card className="report-stock-health-card">
        <SectionTitle
          title="Current Brick Yard Inventory Status"
          subtitle="Available finished stock by brick size ready for customer orders"
          action={<Button variant="secondary" onClick={() => onTabChange('production')}>Production Report</Button>}
        />
        <div className="stock-health-pill-grid">
          {(data?.stockByProduct || []).map(p => (
            <div className="stock-health-pill" key={p.id || p.name}>
              <span className="stock-pill-size">{p.size_label || p.name}</span>
              <strong className="stock-pill-qty">{Number(p.quantity || 0).toLocaleString()} <small>Bricks</small></strong>
              <Badge tone={Number(p.quantity || 0) <= Number(p.minimum_stock || 500) ? 'amber' : 'green'}>
                {Number(p.quantity || 0) <= Number(p.minimum_stock || 500) ? 'Low Stock' : 'In Stock'}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── 2. DETAILED SALES REPORT TAB ──────────────────────────────────────────────
export function SalesSection({ data, settings }) {
  const [customerSearch, setCustomerSearch] = useState('');
  const s = data?.summary || {};
  const bySize = data?.salesBySize || [];
  const customers = useMemo(() => {
    const list = data?.salesByCustomer || [];
    if (!customerSearch.trim()) return list;
    const q = customerSearch.toLowerCase();
    return list.filter(c => (c.name || '').toLowerCase().includes(q));
  }, [data?.salesByCustomer, customerSearch]);

  const salesRows = data?.salesTransactions || [];

  return (
    <div className="report-tab-content">
      {/* Sales KPI Summary Strip */}
      <div className="kpi-strip">
        <div className="kpi-strip-item">
          <span>Gross Sales:</span>
          <strong>{currency(s.revenue, settings.currency)}</strong>
        </div>
        <div className="kpi-strip-item">
          <span>Bricks Sold:</span>
          <strong>{Number(s.bricks_sold || s.bricksSold || 0).toLocaleString()}</strong>
        </div>
        <div className="kpi-strip-item">
          <span>Money Received:</span>
          <strong className="text-green">{currency(s.collected, settings.currency)}</strong>
        </div>
        <div className="kpi-strip-item">
          <span>Customer Balance Due:</span>
          <strong className="text-amber">{currency(s.customer_due, settings.currency)}</strong>
        </div>
        <div className="kpi-strip-item">
          <span>Discounts Given:</span>
          <strong>{currency(s.discounts || 0, settings.currency)}</strong>
        </div>
        <div className="kpi-strip-item">
          <span>Total Invoices:</span>
          <strong>{Number(s.invoice_count || salesRows.length || 0)} Bills</strong>
        </div>
      </div>

      {/* Sales by Brick Size Table */}
      <Card>
        <SectionTitle
          title="Bricks Sold by Size"
          subtitle="Breakdown of volume, net revenue and average realization per brick size"
        />
        {bySize.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Brick Size</th>
                  <th style={{ textAlign: 'right' }}>Quantity Sold (Bricks)</th>
                  <th style={{ textAlign: 'right' }}>Sales Amount</th>
                  <th style={{ textAlign: 'right' }}>Avg Price / Brick</th>
                  <th style={{ textAlign: 'right' }}>% of Total Volume</th>
                </tr>
              </thead>
              <tbody>
                {bySize.map((row, idx) => (
                  <tr key={row.size || idx}>
                    <td><strong>{row.size}</strong></td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{Number(row.quantity || 0).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#104B35' }}>{currency(row.revenue, settings.currency)}</td>
                    <td style={{ textAlign: 'right' }}>{currency(row.avgPrice || 0, settings.currency)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Badge tone="green">{row.share || '0%'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No sales by brick size in this period" description="Sales recorded in this period will populate this breakdown." />
        )}
      </Card>

      {/* Customer-wise Sales Breakdown Table */}
      <Card>
        <div className="card-header-with-search">
          <SectionTitle
            title="Customer Sales & Balances Report"
            subtitle={`${customers.length} customer accounts recorded in this period`}
          />
          <div className="search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search customers…"
              value={customerSearch}
              onChange={e => setCustomerSearch(e.target.value)}
            />
          </div>
        </div>

        {customers.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer Name</th>
                  <th style={{ textAlign: 'center' }}>Invoices</th>
                  <th style={{ textAlign: 'right' }}>Total Sales</th>
                  <th style={{ textAlign: 'right' }}>Amount Received</th>
                  <th style={{ textAlign: 'right' }}>Remaining Amount</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c, idx) => {
                  const out = Number(c.balance || c.outstanding || 0);
                  const isPaid = out <= 0;
                  return (
                    <tr key={c.id || c.name || idx}>
                      <td><strong>{c.name}</strong></td>
                      <td style={{ textAlign: 'center' }}>{c.invoices || 1}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{currency(c.totalSales || c.total || 0, settings.currency)}</td>
                      <td style={{ textAlign: 'right', color: '#176B48', fontWeight: 600 }}>{currency(c.received || c.paid || 0, settings.currency)}</td>
                      <td style={{ textAlign: 'right', color: out > 0 ? '#b45309' : '#176B48', fontWeight: 700 }}>{currency(out, settings.currency)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <Badge tone={isPaid ? 'green' : 'amber'}>{isPaid ? 'Settled' : 'Pending Due'}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No customer records match search" description="Try clearing your search query." />
        )}
      </Card>

      {/* Recent Sales Transactions in Period */}
      {salesRows.length > 0 && (
        <Card>
          <SectionTitle
            title="Sales Invoice History"
            subtitle={`${salesRows.length} sales invoice transactions in this period`}
          />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Invoice / Receipt #</th>
                  <th>Customer</th>
                  <th>Items & Sizes</th>
                  <th style={{ textAlign: 'right' }}>Total Purchase Amount</th>
                  <th style={{ textAlign: 'right' }}>Received</th>
                  <th style={{ textAlign: 'right' }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {salesRows.map(sRow => (
                  <tr key={sRow.id}>
                    <td>{formatDateDisplay(sRow.date || sRow.sale_date)}</td>
                    <td><strong>S-{sRow.receipt_number || sRow.id?.slice(0, 8)}</strong></td>
                    <td>{sRow.customer_name || sRow.name || 'Customer'}</td>
                    <td>{sRow.items_summary || sRow.product || 'Finished Bricks'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{currency(sRow.total, settings.currency)}</td>
                    <td style={{ textAlign: 'right', color: '#176B48' }}>{currency(sRow.amount_received ?? sRow.paid ?? 0, settings.currency)}</td>
                    <td style={{ textAlign: 'right', color: Number(sRow.outstanding_balance ?? 0) > 0 ? '#b45309' : '' }}>
                      {currency(sRow.outstanding_balance ?? 0, settings.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── 3. DETAILED PRODUCTION REPORT TAB ─────────────────────────────────────────
export function ProductionSection({ data, settings }) {
  const s = data?.summary || {};
  const bySize = data?.productionBySize || [];
  const rawConsumption = data?.rawMaterialConsumption || [];
  const batches = data?.productionRegister || [];

  return (
    <div className="report-tab-content">
      {/* Production KPI Summary Strip */}
      <div className="kpi-strip">
        <div className="kpi-strip-item">
          <span>Total Produced:</span>
          <strong>{Number(s.total_produced || s.produced || 0).toLocaleString()} Bricks</strong>
        </div>
        <div className="kpi-strip-item">
          <span>Good Bricks:</span>
          <strong className="text-green">{Number(s.net_produced || s.net || s.total_produced || 0).toLocaleString()}</strong>
        </div>
        <div className="kpi-strip-item">
          <span>Rejected Bricks:</span>
          <strong className="text-amber">{Number(s.total_rejected || s.rejected || 0).toLocaleString()}</strong>
        </div>
        <div className="kpi-strip-item">
          <span>Cement Consumed:</span>
          <strong>{Number(s.cement_used || 0).toLocaleString()} Bags</strong>
        </div>
        <div className="kpi-strip-item">
          <span>Production Batches:</span>
          <strong>{Number(s.production_batches || batches.length || 0)} Runs</strong>
        </div>
      </div>

      {/* Production by Brick Size Table */}
      <Card>
        <SectionTitle
          title="Bricks Made by Size"
          subtitle="Detailed breakdown of output, rejection counts, sales and remaining available stock"
        />
        {bySize.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Brick Size</th>
                  <th style={{ textAlign: 'right' }}>Total Produced</th>
                  <th style={{ textAlign: 'right' }}>Rejected</th>
                  <th style={{ textAlign: 'right' }}>Net Good Bricks</th>
                  <th style={{ textAlign: 'right' }}>Bricks Sold</th>
                  <th style={{ textAlign: 'right' }}>Available Stock</th>
                </tr>
              </thead>
              <tbody>
                {bySize.map((row, idx) => (
                  <tr key={row.size || idx}>
                    <td><strong>{row.size}</strong></td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{Number(row.produced || 0).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: Number(row.rejected || 0) > 0 ? '#b45309' : '' }}>
                      {Number(row.rejected || 0).toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#176B48' }}>
                      {Number(row.net || 0).toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>{Number(row.sold || 0).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>
                      <Badge tone={Number(row.remainingStock || 0) <= 500 ? 'amber' : 'green'}>
                        {Number(row.remainingStock || 0).toLocaleString()}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No production entries in this period" description="Record production sessions in the Production module to view size statistics." />
        )}
      </Card>

      {/* Raw Material Consumption in Production */}
      <Card>
        <SectionTitle
          title="Raw Material Consumption"
          subtitle="Raw materials utilized in brick manufacturing (Cement, Baby Metal, Dust & Chemical)"
        />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Material Name</th>
                <th>Standard Unit</th>
                <th style={{ textAlign: 'right' }}>Purchased in Period</th>
                <th style={{ textAlign: 'right' }}>Materials Used in Production</th>
                <th style={{ textAlign: 'right' }}>Current Stock Available</th>
              </tr>
            </thead>
            <tbody>
              {rawConsumption.map((rm, idx) => (
                <tr key={rm.name || idx}>
                  <td><strong>{rm.name}</strong></td>
                  <td><span className="unit-badge">{rm.unit || 'Standard'}</span></td>
                  <td style={{ textAlign: 'right' }}>{Number(rm.purchased || 0).toLocaleString()}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#104B35' }}>
                    {Number(rm.consumed || 0).toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    <Badge tone={Number(rm.available || 0) <= 50 ? 'amber' : 'green'}>
                      {Number(rm.available || 0).toLocaleString()} {rm.unit}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Production History Register */}
      {batches.length > 0 && (
        <Card>
          <SectionTitle
            title="Previous Production Records"
            subtitle={`${batches.length} completed production runs in this period`}
          />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Batch / Code</th>
                  <th>Product & Size</th>
                  <th style={{ textAlign: 'right' }}>Produced</th>
                  <th style={{ textAlign: 'right' }}>Rejected</th>
                  <th style={{ textAlign: 'right' }}>Net Good</th>
                  <th style={{ textAlign: 'right' }}>Cement (Bags)</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {batches.map(b => (
                  <tr key={b.id || b.reference_number}>
                    <td>{formatDateDisplay(b.production_date || b.date)}</td>
                    <td><strong>{b.reference_number || b.id?.slice(0, 8)}</strong></td>
                    <td>{b.product_name || b.name || `${b.brick_size}-inch Brick`}</td>
                    <td style={{ textAlign: 'right' }}>{Number(b.actual_quantity || b.produced || 0).toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: Number(b.rejected_quantity || b.rejected || 0) > 0 ? '#b45309' : '' }}>
                      {Number(b.rejected_quantity || b.rejected || 0)}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#176B48' }}>
                      {Number(b.net_quantity || b.net || b.actual_quantity || 0).toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{Number(b.cement_packs_used || b.cement_used || 0)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <Badge tone={b.status === 'reversed' ? 'neutral' : 'green'}>
                        {b.status === 'reversed' ? 'Reversed' : 'Completed'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── 4. DETAILED PURCHASE REPORT TAB ──────────────────────────────────────────
export function PurchaseSection({ data, settings }) {
  const s = data?.summary || {};
  const byMaterial = data?.purchasesByMaterial || [];
  const suppliers = data?.purchasesBySupplier || [];
  const purchaseRows = data?.purchaseTransactions || [];

  return (
    <div className="report-tab-content">
      {/* Purchases KPI Summary Strip */}
      <div className="kpi-strip">
        <div className="kpi-strip-item">
          <span>Total Purchases:</span>
          <strong>{currency(s.purchases, settings.currency)}</strong>
        </div>
        <div className="kpi-strip-item">
          <span>Amount Paid:</span>
          <strong className="text-green">{currency(s.supplier_paid, settings.currency)}</strong>
        </div>
        <div className="kpi-strip-item">
          <span>Supplier Balance Due:</span>
          <strong className="text-amber">{currency(s.supplier_due, settings.currency)}</strong>
        </div>
        <div className="kpi-strip-item">
          <span>Orders Count:</span>
          <strong>{Number(s.purchase_orders || purchaseRows.length || 0)} Invoices</strong>
        </div>
      </div>

      {/* Purchases by Raw Material Table */}
      <Card>
        <SectionTitle
          title="Materials Purchased"
          subtitle="Breakdown of raw materials bought, total amounts paid and supplier outstanding balances"
        />
        {byMaterial.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Raw Material</th>
                  <th style={{ textAlign: 'right' }}>Total Quantity</th>
                  <th style={{ textAlign: 'right' }}>Total Amount</th>
                  <th style={{ textAlign: 'right' }}>Money Paid</th>
                  <th style={{ textAlign: 'right' }}>Outstanding Balance</th>
                </tr>
              </thead>
              <tbody>
                {byMaterial.map((m, idx) => (
                  <tr key={m.name || idx}>
                    <td><strong>{m.name}</strong></td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{Number(m.quantity || 0).toLocaleString()} {m.unit || ''}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#104B35' }}>{currency(m.amount, settings.currency)}</td>
                    <td style={{ textAlign: 'right', color: '#176B48' }}>{currency(m.paid, settings.currency)}</td>
                    <td style={{ textAlign: 'right', color: Number(m.outstanding || 0) > 0 ? '#b45309' : '', fontWeight: 600 }}>
                      {currency(m.outstanding || 0, settings.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No material purchases in this period" description="Raw material purchase entries will populate this table." />
        )}
      </Card>

      {/* Supplier-wise Purchases Table */}
      <Card>
        <SectionTitle
          title="Supplier-wise Purchases & Balances"
          subtitle={`${suppliers.length} active supplier accounts`}
        />
        {suppliers.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Supplier Name</th>
                  <th style={{ textAlign: 'center' }}>Purchases Count</th>
                  <th style={{ textAlign: 'right' }}>Total Amount</th>
                  <th style={{ textAlign: 'right' }}>Amount Paid</th>
                  <th style={{ textAlign: 'right' }}>Outstanding Balance</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((sup, idx) => (
                  <tr key={sup.id || sup.name || idx}>
                    <td><strong>{sup.name}</strong></td>
                    <td style={{ textAlign: 'center' }}>{sup.transactions || 1}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{currency(sup.amount || sup.total || 0, settings.currency)}</td>
                    <td style={{ textAlign: 'right', color: '#176B48' }}>{currency(sup.paid || 0, settings.currency)}</td>
                    <td style={{ textAlign: 'right', color: Number(sup.balance || sup.outstanding || 0) > 0 ? '#b45309' : '', fontWeight: 700 }}>
                      {currency(sup.balance || sup.outstanding || 0, settings.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No supplier entries in this period" description="Transactions recorded in Purchases will be grouped here." />
        )}
      </Card>

      {/* Purchase Transactions Table */}
      {purchaseRows.length > 0 && (
        <Card>
          <SectionTitle
            title="Purchase Orders History"
            subtitle={`${purchaseRows.length} purchase invoices in this period`}
          />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Order Ref #</th>
                  <th>Supplier</th>
                  <th>Raw Material</th>
                  <th style={{ textAlign: 'right' }}>Total Amount</th>
                  <th style={{ textAlign: 'right' }}>Paid</th>
                  <th style={{ textAlign: 'right' }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {purchaseRows.map(pRow => (
                  <tr key={pRow.id}>
                    <td>{formatDateDisplay(pRow.date || pRow.purchase_date)}</td>
                    <td><strong>P-{pRow.reference_number || pRow.id?.slice(0, 8)}</strong></td>
                    <td>{pRow.supplier_name || pRow.name || 'Supplier'}</td>
                    <td>{pRow.material_summary || pRow.product || 'Raw Material'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{currency(pRow.total, settings.currency)}</td>
                    <td style={{ textAlign: 'right', color: '#176B48' }}>{currency(pRow.amount_paid ?? pRow.paid ?? 0, settings.currency)}</td>
                    <td style={{ textAlign: 'right', color: Number(pRow.outstanding_balance ?? 0) > 0 ? '#b45309' : '' }}>
                      {currency(pRow.outstanding_balance ?? 0, settings.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── 5. DETAILED EXPENSE REPORT TAB ───────────────────────────────────────────
export function ExpenseSection({ data, settings }) {
  const s = data?.summary || {};
  const categories = data?.expensesByCategory || [];
  const expenseRows = data?.expenseTransactions || [];

  return (
    <div className="report-tab-content">
      {/* Expenses KPI Summary Strip */}
      <div className="kpi-strip">
        <div className="kpi-strip-item">
          <span>Total Expenses:</span>
          <strong>{currency(s.expenses, settings.currency)}</strong>
        </div>
        <div className="kpi-strip-item">
          <span>Transactions Count:</span>
          <strong>{Number(s.expense_count || expenseRows.length || 0)} Entries</strong>
        </div>
        <div className="kpi-strip-item">
          <span>Top Expense Category:</span>
          <strong className="text-purple">{s.top_expense_category || 'Labour / Operations'}</strong>
        </div>
        <div className="kpi-strip-item">
          <span>Daily Average:</span>
          <strong>{currency(s.daily_avg_expense || 0, settings.currency)}</strong>
        </div>
      </div>

      <div className="report-charts-grid">
        {/* Expense Category Breakdown Table */}
        <Card>
          <SectionTitle
            title="Expenses by Category"
            subtitle="Categorized operating expenses incurred in the selected period"
          />
          {categories.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Expense Category</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th style={{ textAlign: 'right' }}>% of Total</th>
                    <th style={{ textAlign: 'center' }}>Entries</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat, idx) => (
                    <tr key={cat.category || idx}>
                      <td><strong>{cat.category}</strong></td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#104B35' }}>
                        {currency(cat.amount, settings.currency)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Badge tone="neutral">{cat.share || '0%'}</Badge>
                      </td>
                      <td style={{ textAlign: 'center' }}>{cat.count || 1}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No expenses recorded in this period" description="Add expenses in the Expenses module to see categorized totals." />
          )}
        </Card>

        {/* Visual Expense Share Chart */}
        <Card className="chart-card">
          <SectionTitle
            title="Expense Share by Category"
            subtitle="Proportional breakdown of operating expenditure"
          />
          <div className="chart-container" style={{ height: 260 }}>
            {categories.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categories} layout="vertical" margin={{ top: 10, right: 20, left: 20, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke="#EAEFEA" strokeDasharray="3 3" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6B7F74' }} />
                  <YAxis type="category" dataKey="category" width={90} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#172B24', fontWeight: 600 }} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #E5EBE6' }} formatter={v => currency(v, settings.currency)} />
                  <Bar dataKey="amount" fill="#7C3AED" radius={[0, 4, 4, 0]}>
                    {categories.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No expenses to display" description="Charts will generate as operating costs are logged." />
            )}
          </div>
        </Card>
      </div>

      {/* Expense History Table */}
      {expenseRows.length > 0 && (
        <Card>
          <SectionTitle
            title="Expense Transaction Entries"
            subtitle={`${expenseRows.length} expense vouchers in this period`}
          />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th style={{ textAlign: 'center' }}>Payment Method</th>
                </tr>
              </thead>
              <tbody>
                {expenseRows.map(eRow => (
                  <tr key={eRow.id}>
                    <td>{formatDateDisplay(eRow.date || eRow.expense_date)}</td>
                    <td><strong>{eRow.category_name || eRow.category || 'Expense'}</strong></td>
                    <td>{eRow.description || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#D94B4B' }}>{currency(eRow.amount, settings.currency)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <Badge tone="neutral">{eRow.payment_method || 'Cash'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── 6. FINANCIAL SUMMARY & PROFIT ANALYSIS TAB ────────────────────────────────
export function FinancialSection({ data, settings }) {
  const s = data?.summary || {};
  const grossRev = Number(s.revenue || 0);
  const discounts = Number(s.discounts || 0);
  const netRev = Math.max(0, grossRev - discounts);
  const cashIn = Number(s.collected || 0);
  const custDue = Number(s.customer_due || 0);
  const purchasesTotal = Number(s.purchases || 0);
  const supplierPaid = Number(s.supplier_paid || 0);
  const suppDue = Number(s.supplier_due || 0);
  const expensesTotal = Number(s.expenses || 0);

  // Cash flow in this period:
  const cashOut = supplierPaid + expensesTotal;
  const netCashFlow = cashIn - cashOut;

  // Operating Profit estimation
  const knownCogs = Number(s.known_cogs || 0);
  const operatingCosts = expensesTotal;
  const estimatedProfit = s.estimated_profit != null
    ? Number(s.estimated_profit)
    : (knownCogs > 0 ? netRev - knownCogs - operatingCosts : null);

  return (
    <div className="report-tab-content">
      {/* Financial Health Summary Cards */}
      <div className="financial-health-grid">
        <Card className="financial-summary-card">
          <SectionTitle
            title="Executive Income Statement"
            subtitle="Accurate reconciliation of sales, cash collections, purchases and costs"
          />

          <div className="income-statement-rows">
            <div className="income-row header-row">
              <span>Total Sales</span>
              <strong>{currency(grossRev, settings.currency)}</strong>
            </div>

            <div className="income-row discount-row">
              <span>(−) Trade Discounts Given</span>
              <span>−{currency(discounts, settings.currency)}</span>
            </div>

            <div className="income-row net-row">
              <strong>(=) Sales After Discount</strong>
              <strong className="text-green">{currency(netRev, settings.currency)}</strong>
            </div>

            <div className="income-divider" />

            <div className="income-row">
              <span>Actual Money Received from Customers</span>
              <strong className="text-green">{currency(cashIn, settings.currency)}</strong>
            </div>

            <div className="income-row">
              <span>Outstanding Customer Receivables</span>
              <strong className="text-amber">{currency(custDue, settings.currency)}</strong>
            </div>

            <div className="income-divider" />

            <div className="income-row">
              <span>Raw Material Purchases</span>
              <strong>{currency(purchasesTotal, settings.currency)}</strong>
            </div>

            <div className="income-row">
              <span>Cash Paid to Suppliers</span>
              <span>{currency(supplierPaid, settings.currency)}</span>
            </div>

            <div className="income-row">
              <span>Outstanding Supplier Payables</span>
              <strong className="text-amber">{currency(suppDue, settings.currency)}</strong>
            </div>

            <div className="income-divider" />

            <div className="income-row">
              <span>Total Expenses (Labour, Power, Fuel)</span>
              <strong className="text-purple">{currency(expensesTotal, settings.currency)}</strong>
            </div>

            <div className="income-divider" />

            {/* Operating Profit */}
            <div className="income-row profit-box">
              <div>
                <strong>Remaining Profit</strong>
                <small>Calculated from verified production cost of bricks sold + reviewed operating costs</small>
              </div>
              <strong className={estimatedProfit != null && estimatedProfit >= 0 ? 'text-green' : 'text-amber'}>
                {estimatedProfit != null ? currency(estimatedProfit, settings.currency) : 'Pending Costing Review'}
              </strong>
            </div>
          </div>
        </Card>

        {/* Cash Flow Card */}
        <Card className="cash-flow-card">
          <SectionTitle
            title="Operating Cash Flow Summary"
            subtitle="Net physical cash generated vs paid during this period"
          />
          <div className="cash-flow-body">
            <div className="cash-flow-stat in">
              <span className="cf-label">Cash In (Customer Collections)</span>
              <strong className="cf-val text-green">+{currency(cashIn, settings.currency)}</strong>
            </div>

            <div className="cash-flow-stat out">
              <span className="cf-label">Cash Out (Supplier Payments & Expenses)</span>
              <strong className="cf-val text-red">−{currency(cashOut, settings.currency)}</strong>
              <small>Supplier Paid: {currency(supplierPaid, settings.currency)} · Expenses: {currency(expensesTotal, settings.currency)}</small>
            </div>

            <div className={`cash-flow-result ${netCashFlow >= 0 ? 'positive' : 'negative'}`}>
              <div className="cf-res-label">Net Operating Cash Flow</div>
              <div className="cf-res-val">{netCashFlow >= 0 ? '+' : ''}{currency(netCashFlow, settings.currency)}</div>
              <p className="cf-res-note">
                {netCashFlow >= 0
                  ? '✓ Positive cash flow: Cash collections exceeded cash outflows in this period.'
                  : '⚠️ Negative cash flow: Outflows for materials and operations exceeded customer collections.'}
              </p>
            </div>
          </div>

          <div className="profit-guidance-notice">
            <AlertTriangle size={18} />
            <div>
              <strong>Important Note on Profit Calculation</strong>
              <p>
                In manufacturing ERP, profit cannot be simply calculated as <code>Sales − Purchases − Expenses</code>.
                Purchases include raw materials (cement bags, stone aggregate, dust) that remain in yard stock as inventory.
                True profit deducts only the cost of raw materials actually consumed into the bricks sold during the period.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── 7. PERIOD COMPARISON TAB (DAILY, WEEKLY, MONTHLY) ─────────────────────────
export function ComparisonSection({ data, prevData, deltas, periodDates, settings }) {
  const s = data?.summary || {};
  const prevS = prevData?.summary || {};

  const metrics = [
    {
      id: 'revenue',
      title: 'Sales Revenue',
      current: s.revenue,
      previous: prevS.revenue,
      format: v => currency(v, settings.currency),
      delta: deltas.sales,
      isExpense: false,
      description: 'Gross invoiced sales to customers'
    },
    {
      id: 'bricks_sold',
      title: 'Bricks Sold',
      current: s.bricks_sold || s.bricksSold || 0,
      previous: prevS.bricks_sold || prevS.bricksSold || 0,
      format: v => Number(v || 0).toLocaleString() + ' Bricks',
      delta: deltas.bricksSold,
      isExpense: false,
      description: 'Total brick quantity delivered'
    },
    {
      id: 'collected',
      title: 'Money Received',
      current: s.collected,
      previous: prevS.collected,
      format: v => currency(v, settings.currency),
      delta: deltas.collected,
      isExpense: false,
      description: 'Payments received from customers'
    },
    {
      id: 'production',
      title: 'Bricks Produced',
      current: s.total_produced || s.produced || 0,
      previous: prevS.total_produced || prevS.produced || 0,
      format: v => Number(v || 0).toLocaleString() + ' Bricks',
      delta: deltas.production,
      isExpense: false,
      description: 'Total output from production lines'
    },
    {
      id: 'cement',
      title: 'Cement Consumed',
      current: s.cement_used || 0,
      previous: prevS.cement_used || 0,
      format: v => Number(v || 0).toLocaleString() + ' Bags',
      delta: deltas.cement,
      isExpense: true,
      description: 'Cement sacks used in manufacturing'
    },
    {
      id: 'purchases',
      title: 'Material Purchases',
      current: s.purchases,
      previous: prevS.purchases,
      format: v => currency(v, settings.currency),
      delta: deltas.purchases,
      isExpense: true,
      description: 'Raw materials ordered from suppliers'
    },
    {
      id: 'expenses',
      title: 'Total Expenses',
      current: s.expenses,
      previous: prevS.expenses,
      format: v => currency(v, settings.currency),
      delta: deltas.expenses,
      isExpense: true,
      description: 'Operational costs incurred'
    },
    {
      id: 'customer_due',
      title: 'Customer Balance Due',
      current: s.customer_due,
      previous: prevS.customer_due,
      format: v => currency(v, settings.currency),
      delta: deltas.customerDue,
      isExpense: true,
      description: 'Unpaid customer receivables'
    }
  ];

  return (
    <div className="report-tab-content">
      {/* Header comparison badge */}
      <div className="comparison-banner">
        <div>
          <span className="comp-tag">SIDE-BY-SIDE PERIOD AUDIT</span>
          <h3>Comparing {periodDates.label} with {periodDates.prevLabel}</h3>
          <p>
            Current: <strong>{periodDates.dateRangeLabel}</strong> · Previous: <strong>{formatDateDisplay(periodDates.prevFrom)} – {formatDateDisplay(periodDates.prevTo)}</strong>
          </p>
        </div>
      </div>

      {/* Grid of comparison cards */}
      <div className="comparison-cards-grid">
        {metrics.map(m => {
          const d = m.delta || {};
          return (
            <Card className="comparison-metric-card" key={m.id}>
              <div className="comp-card-top">
                <strong>{m.title}</strong>
                <Badge tone={d.isFavorable ? 'green' : 'amber'}>
                  {d.direction === 'up' ? '↑ ' : d.direction === 'down' ? '↓ ' : ''}
                  {d.badgeText || '0%'}
                </Badge>
              </div>

              <div className="comp-values-row">
                <div className="comp-val-col current">
                  <span className="comp-val-label">Current ({periodDates.label})</span>
                  <strong className="comp-val-number">{m.format(m.current)}</strong>
                </div>
                <div className="comp-val-col previous">
                  <span className="comp-val-label">Last Period</span>
                  <strong className="comp-val-number muted">{m.format(m.previous)}</strong>
                </div>
              </div>

              <div className="comp-narrative">
                <p>{d.narrative || `${m.title} tracked for the selected interval.`}</p>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

