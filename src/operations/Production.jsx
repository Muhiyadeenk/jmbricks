import React, { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Button, Card, Field, Table, Dialog, EmptyState, number, SectionTitle } from '../components';
import { supabase } from '../lib/supabase';
import { allRows, today } from './api';
import { downloadCsv } from './reporting';

// Bricks per line for each brick size (inches)
export const defaults = { 4: 8, 5: 6, 6: 5, 8: 4 };

export const displayDate = v =>
  v ? String(v).slice(0, 10).split('-').reverse().join('/') : '—';

// Default state for a new production row
const newItem = () => ({
  product_id: '',
  size: '',
  default_quantity: '',
  production_lines: '',
  count_1: '0',
  count_2: '0',
  count_3: '0',
  actual_quantity: '',
  rejected_quantity: '0',
  cement_packs_used: '0',
  line_reading: '',
  starting_line_reading: '',
  ending_line_reading: '',
  cumulative_confirmed: false,
});

// Column definitions for history table
const columns = [
  ['reference_number', 'Reference'],
  ['production_date', 'Date'],
  ['brick_size', 'Brick size'],
  ['product_code', 'Product'],
  ['count_1', 'Count 1'],
  ['count_2', 'Count 2'],
  ['count_3', 'Count 3'],
  ['production_lines', 'Lines'],
  ['default_quantity', 'Bricks/line'],
  ['actual_quantity', 'Actual produced'],
  ['rejected_quantity', 'Rejected'],
  ['net_quantity', 'Net production'],
  ['cement_packs_used', 'Cement sacks'],
  ['status', 'Status'],
];

const tableCols = columns.map(([key, label]) => ({
  key,
  label,
  render: r =>
    key === 'production_date' ? displayDate(r[key])
    : key === 'brick_size' ? `${r[key]}-inch`
    : key === 'status' && r[key] === 'reversed' ? 'Deleted / reversed'
    : r[key] ?? (key.startsWith('count_') ? 0 : '—'),
}));

// ─── Main Production Page ────────────────────────────────────────────────────
export default function Production({ catalog, settings, profile, revision, onChanged, openNew, onOpened }) {
  const [rows, setRows]       = useState([]);
  const [legacy, setLegacy]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [message, setMessage] = useState('');
  const [edit, setEdit]       = useState(null);
  const [page, setPage]       = useState(0);
  const [filters, setFilters] = useState({ search: '', from: '', to: '', size: '', status: 'active' });

  const key    = `jm-production-pending-${profile.id}`;
  const lock   = useRef(false);
  const end    = today(settings.timezone);
  const write  = ['owner', 'staff'].includes(profile.role);

  const [pending, setPending] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; }
  });
  const [busy, setBusy] = useState(false);

  // Open new session if triggered from outside
  useEffect(() => {
    if (openNew) {
      setEdit({ id: crypto.randomUUID(), revision: 0, date: end, status: 'draft', notes: '', items: [newItem()] });
      onOpened?.();
    }
  }, [openNew]);

  // Load data
  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([allRows('production_register'), allRows('production_history')])
      .then(([r, l]) => { if (active) { setRows(r); setLegacy(l); setError(''); } })
      .catch(e => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [revision]);

  function filter(k, v) { setFilters(f => ({ ...f, [k]: v })); setPage(0); }

  const matches = rows
    .filter(r =>
      (!filters.search || r.reference_number.toLowerCase().includes(filters.search.toLowerCase())) &&
      (!filters.from   || r.production_date >= filters.from) &&
      (!filters.to     || r.production_date <= filters.to) &&
      (!filters.size   || String(r.brick_size) === filters.size) &&
      (!filters.status || (filters.status === 'active' ? r.status !== 'reversed' : r.status === filters.status))
    )
    .sort((a, b) =>
      b.production_date.localeCompare(a.production_date) ||
      b.reference_number.localeCompare(a.reference_number)
    );

  const todays   = rows.filter(r => r.status === 'completed' && r.production_date === end);
  const oldToday = legacy.filter(r => r.production_date === end);

  const totals = [
    ['Actual produced',     todays.reduce((s, r) => s + Number(r.actual_quantity), 0) + oldToday.reduce((s, r) => s + Number(r.quantity_produced), 0)],
    ['Production entries',  new Set(todays.map(r => r.production_session_id)).size + oldToday.length],
    ['Net production',      [...todays, ...oldToday].reduce((s, r) => s + Number(r.net_quantity), 0)],
    ['Cement sacks',        todays.reduce((s, r) => s + Number(r.cement_packs_used), 0)],
  ];

  async function send(request) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const { error } = await supabase.rpc('save_production', {
        p_request_id: request.id,
        p_payload:    request.payload,
      });
      if (error) {
        if (error.code && /^(22|23|42|P0)/.test(error.code)) {
          sessionStorage.removeItem(key);
          setPending(null);
          setEdit({ ...request.payload, status: request.originalStatus || 'draft' });
        }
        throw error;
      }
      sessionStorage.removeItem(key);
      setPending(null);
      setEdit(null);
      setMessage(
        request.payload.status === 'completed' ? 'Production completed successfully. Stock has been updated.' :
        request.payload.status === 'reversed'  ? 'Production deleted. Stock and audit history updated.' :
        'Production saved. Stock is unchanged.'
      );
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function submit(payload) {
    if (lock.current || pending) return;
    const request = { id: crypto.randomUUID(), payload, originalStatus: edit?.status || 'draft' };
    try { sessionStorage.setItem(key, JSON.stringify(request)); }
    catch { setError('Enable session storage to retry safely. Nothing was sent.'); return; }
    setPending(request);
    send(request);
  }

  function open(r, deleteRequested = false) {
    setError('');
    setEdit({
      deleteRequested,
      id:               r.production_session_id,
      revision:         r.revision,
      date:             r.production_date,
      status:           r.status,
      notes:            r.notes || '',
      reference_number: r.reference_number,
      items: rows
        .filter(i => i.production_session_id === r.production_session_id)
        .map(i => ({ ...i, size: String(i.brick_size) })),
    });
  }

  return (
    <>
      {message && <div className="notice" role="status">{message}</div>}
      {error   && <p className="auth-error" role="alert">{error}</p>}

      {/* Today's summary */}
      <SectionTitle title="Today's production" subtitle={`${displayDate(end)} · completed entries only`} />
      <div className="report-total-grid">
        {totals.map(([label, value]) => (
          <Card key={label} className="report-total">
            <span>{label}</span>
            <strong>{number(value)}</strong>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <div className="toolbar no-print">
        <Field label="Reference search" value={filters.search} onChange={e => filter('search', e.target.value)} />
        <Field label="From" type="date" value={filters.from} onChange={e => filter('from', e.target.value)} />
        <Field label="To"   type="date" min={filters.from} value={filters.to} onChange={e => filter('to', e.target.value)} />
        <select aria-label="Brick size filter" value={filters.size} onChange={e => filter('size', e.target.value)}>
          <option value="">All sizes</option>
          {[4, 5, 6, 8].map(s => <option key={s}>{s}</option>)}
        </select>
        <select aria-label="Status filter" value={filters.status} onChange={e => filter('status', e.target.value)}>
          <option value="active">Active entries</option>
          <option value="">All statuses</option>
          {['draft', 'in_progress', 'completed', 'reversed'].map(s => (
            <option key={s} value={s}>{s === 'reversed' ? 'Deleted / reversed' : s}</option>
          ))}
        </select>
        {write && (
          <Button onClick={() => setEdit({ id: crypto.randomUUID(), revision: 0, date: end, status: 'draft', notes: '', items: [newItem()] })}>
            Add Production
          </Button>
        )}
        <Button variant="secondary" onClick={() => downloadCsv('JM-Production.csv', columns.map(([key, label]) => ({ key, label })), matches.map(r => ({ ...r, production_date: displayDate(r.production_date) })))}>
          Export CSV
        </Button>
        <Button variant="secondary" onClick={() => window.print()}>Print</Button>
      </div>

      {/* Register table */}
      <Card>
        <SectionTitle title="Production register" subtitle="Rows with the same reference belong to one session." />
        {loading ? <p role="status">Loading production…</p> : (
          <>
            <div className="no-print">
              <Table
                rows={matches.slice(page * 25, page * 25 + 25)}
                columns={[
                  ...tableCols,
                  ...(profile.role === 'owner' ? [{
                    key: 'delete', label: 'Action',
                    render: r => r.status !== 'reversed' && (
                      <Button variant="secondary" className="delete-action" onClick={() => open(r, true)}>
                        <Trash2 size={14} /> Delete
                      </Button>
                    ),
                  }] : []),
                ]}
                onRow={r => open(r)}
              />
            </div>
            <div className="production-print-only">
              <Table rows={matches} columns={tableCols} />
            </div>
          </>
        )}
        <div className="pagination no-print">
          <Button variant="secondary" disabled={!page} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span>Page {page + 1} of {Math.max(1, Math.ceil(matches.length / 25))}</span>
          <Button variant="secondary" disabled={(page + 1) * 25 >= matches.length} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      </Card>

      {/* Legacy records */}
      {legacy.length > 0 && (
        <details>
          <summary>Earlier production records ({legacy.length})</summary>
          <p>These completed records retain their original stock postings. Cement and readings were not recorded.</p>
          <Table
            rows={legacy}
            columns={[
              { key: 'production_date', label: 'Date',     render: r => displayDate(r.production_date) },
              { key: 'product_name',    label: 'Product' },
              { key: 'quantity_produced', label: 'Produced' },
              { key: 'rejected_quantity', label: 'Rejected' },
              { key: 'net_quantity',    label: 'Net' },
            ]}
          />
        </details>
      )}

      {/* Edit / New form */}
      {edit && !pending && (
        <ProductionForm
          initial={edit}
          catalog={catalog}
          settings={settings}
          owner={profile.role === 'owner'}
          canWrite={write}
          error={error}
          onClose={() => setEdit(null)}
          onSubmit={submit}
        />
      )}

      {/* Retry dialog */}
      {pending && (
        <Dialog title="Confirm saved status" onClose={() => {}}>
          <p>{busy ? 'Saving production…' : 'The connection may have been interrupted. Retry this exact request safely; it cannot post stock twice.'}</p>
          {error && <p role="alert">{error}</p>}
          <Button disabled={busy} onClick={() => send(pending)}>
            {busy ? 'Please wait…' : 'Retry original submission'}
          </Button>
        </Dialog>
      )}
    </>
  );
}

// ─── Production Form (New / Edit) ────────────────────────────────────────────
export function ProductionForm({ initial, catalog, settings, owner, canWrite, error, onClose, onSubmit }) {
  const [data, setData]             = useState(initial);
  const [review, setReview]         = useState(initial.deleteRequested ? { ...initial, status: 'reversed' } : null);
  const [localError, setLocalError] = useState('');
  const [audit, setAudit]           = useState([]);

  const readonly = !canWrite || initial.status === 'reversed' || (initial.status === 'completed' && !owner);

  const set = (k, v) => setData(d => ({ ...d, [k]: v }));

  // Update a field on a specific row item; auto-recalculate total bricks when lines change
  const row = (i, k, v) =>
    setData(d => ({
      ...d,
      items: d.items.map((r, n) =>
        n !== i ? r : {
          ...r,
          [k]: v,
          // Auto-calculate total bricks = lines × bricks-per-line
          ...(k === 'production_lines' ? { actual_quantity: Number(v) * Number(r.default_quantity) } : {}),
        }
      ),
    }));

  useEffect(() => {
    if (initial.revision) {
      allRows('production_audit', q => q.eq('session_id', initial.id))
        .then(setAudit)
        .catch(() => setLocalError('Could not load audit history.'));
    }
  }, [initial.id]);

  function prepare(e) {
    e.preventDefault();
    setLocalError('');
    const status = e.nativeEvent.submitter?.value || data.status;

    for (const r of data.items) {
      // Validate Count 1, 2, 3
      for (const k of ['count_1', 'count_2', 'count_3']) {
        const v = Number(r[k] ?? 0);
        if (!Number.isSafeInteger(v) || v < 0 || v > 1_000_000_000) {
          setLocalError('Counts must be whole numbers between 0 and 1,000,000,000.');
          return;
        }
      }
      if (!Number.isSafeInteger(Number(r.production_lines)) || Number(r.production_lines) <= 0) {
        setLocalError('Enter a positive whole number of production lines.');
        return;
      }
      if (Number(r.rejected_quantity) > Number(r.actual_quantity)) {
        setLocalError('Rejected bricks cannot exceed actual production.');
        return;
      }
      if (status === 'completed' && Number(r.actual_quantity) <= 0) {
        setLocalError('Enter actual production for every row.');
        return;
      }
      if (
        r.cumulative_confirmed &&
        (!(r.starting_line_reading !== '' && r.ending_line_reading !== '') ||
          Number(r.ending_line_reading) < Number(r.starting_line_reading))
      ) {
        setLocalError('Confirmed cumulative readings require an ending reading at least equal to the starting reading.');
        return;
      }
    }

    if (new Set(data.items.map(i => i.product_id)).size !== data.items.length) {
      setLocalError('Use one row per product.');
      return;
    }
    setReview({ ...data, status });
  }

  const net = data.items.reduce((s, r) => s + Number(r.actual_quantity || 0) - Number(r.rejected_quantity || 0), 0);

  // ── Confirmation / review screen ─────────────────────────────────────────
  if (review) {
    return (
      <Dialog
        title={
          review.status === 'completed' ? 'Complete Production' :
          review.status === 'reversed'  ? 'Delete Production'  : 'Save production'
        }
        onClose={() => setReview(null)}
      >
        <div className="notice">
          {review.status === 'completed'
            ? 'Are you sure you want to complete this production record? Completing production will update available stock.'
            : review.status === 'reversed'
            ? 'Delete this entire production session, including all its brick sizes? Completed production will be removed from stock. Drafts do not affect stock. The original record and reason will remain in audit history. Deletion is blocked if stock is insufficient.'
            : 'This saves the register without increasing stock.'}
        </div>
        <p>{displayDate(data.date)} · {data.items.length} product rows · {number(net)} net bricks</p>
        <p>Stock is posted on completion day. The register retains the actual production date.</p>
        {(initial.status === 'completed' || review.status === 'reversed') && (
          <Field
            label={review.status === 'reversed' ? 'Deletion reason' : 'Correction reason'}
            required
            minLength={5}
            value={review.reason || ''}
            onChange={e => setReview({ ...review, reason: e.target.value })}
          />
        )}
        <p className="auth-error" role="alert">{error}</p>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => setReview(null)}>Back</Button>
          <Button
            disabled={(initial.status === 'completed' || review.status === 'reversed') && (review.reason || '').trim().length < 5}
            className={review.status === 'reversed' ? 'delete-action' : ''}
            onClick={() => onSubmit(review)}
          >
            {review.status === 'reversed' ? 'Confirm delete' : 'Confirm'}
          </Button>
        </div>
      </Dialog>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <Dialog title={initial.reference_number || 'New production session'} onClose={onClose}>
      <form onSubmit={prepare}>
        <fieldset disabled={readonly}>

          {/* Date + Reference */}
          <div className="form-grid">
            <Field
              label="Production date"
              type="date"
              required
              max={today(settings.timezone)}
              disabled={initial.status === 'completed'}
              value={data.date}
              onChange={e => set('date', e.target.value)}
            />
            <Field label="Production reference" readOnly value={initial.reference_number || 'Generated when saved'} />
          </div>
          <p className="help">
            Date: {displayDate(data.date)} · Total bricks = production lines × bricks per line.
          </p>

          {/* Production rows (one per brick size) */}
          {data.items.map((r, i) => {
            const choices = catalog.products.filter(
              p => p.is_active && p.kind === 'finished_brick' && Number(p.brick_size) === Number(r.size)
            );
            const p = catalog.products.find(p => p.id === r.product_id);

            return (
              <div className="production-row" key={i}>

                {/* Brick size + Product */}
                <div className="form-grid">
                  <Field label="Brick size">
                    <select
                      required
                      value={r.size}
                      onChange={e => {
                        const size    = e.target.value;
                        const product = catalog.products.find(
                          p => p.is_active && p.kind === 'finished_brick' && Number(p.brick_size) === Number(size)
                        );
                        // Auto-set bricks per line and recalculate total
                        const factor = defaults[size] || '';
                        setData(d => ({
                          ...d,
                          items: d.items.map((r, n) =>
                            n !== i ? r : {
                              ...r,
                              size,
                              product_id:       product?.id || '',
                              default_quantity: factor,
                              actual_quantity:  Number(r.production_lines || 0) * Number(factor),
                            }
                          ),
                        }));
                      }}
                    >
                      <option value="">Select size</option>
                      {[4, 5, 6, 8].map(s => <option key={s} value={s}>{s}-inch</option>)}
                    </select>
                  </Field>
                  <Field
                    label="Product"
                    readOnly
                    value={p?.name || (r.size ? `${r.size}-inch Brick` : 'Select brick size')}
                  />
                </div>

                {r.size && !choices.length && (
                  <p className="notice">
                    Configure a {r.size}-inch product using Product configuration below.
                    Existing products are not automatically merged or renamed.
                  </p>
                )}
                <p className="help">Available stock: {p ? number(p.available_quantity) : '—'} bricks</p>

                {/* Core production fields */}
                <div className="form-grid">
                  {[
                    ['production_lines', 'Number of Production Lines', 1],
                    ['default_quantity', 'Bricks Per Line (auto)',      1],
                    ['actual_quantity',  'Total Bricks Produced (auto)', 0],
                    ['rejected_quantity','Damaged / Rejected Bricks',   0],
                    ['cement_packs_used','Cement Sacks Used',           0],
                  ].map(([k, l, min]) => (
                    <Field
                      key={k}
                      label={l}
                      type="number"
                      min={min}
                      max="1000000000"
                      step="1"
                      readOnly={k === 'default_quantity' || k === 'actual_quantity'}
                      required
                      value={r[k] ?? ''}
                      onChange={e => row(i, k, e.target.value)}
                    />
                  ))}
                </div>

                {/* Count 1 / Count 2 / Count 3 */}
                <div className="production-counts">
                  <h3>Production Register Counts</h3>
                  <p className="help">
                    Enter the three count values from the physical production register.
                    These are stored separately and do not affect total bricks or stock.
                  </p>
                  <div className="production-count-grid">
                    {[1, 2, 3].map(n => (
                      <Field
                        key={n}
                        label={`Count ${n}`}
                        type="number"
                        min="0"
                        max="1000000000"
                        step="1"
                        value={r[`count_${n}`] ?? 0}
                        onChange={e => row(i, `count_${n}`, e.target.value)}
                      />
                    ))}
                  </div>
                </div>

                {/* Row summary */}
                <p className="help">
                  {r.size}-inch · {number(r.production_lines || 0)} lines × {number(r.default_quantity || 0)} = {number(r.actual_quantity || 0)} bricks · {number(r.cement_packs_used || 0)} cement sacks
                </p>
                <div className="line-footer">
                  <strong>Net production: {number(Number(r.actual_quantity || 0) - Number(r.rejected_quantity || 0))}</strong>
                  {data.items.length > 1 && (
                    <Button type="button" variant="secondary" onClick={() => set('items', data.items.filter((_, n) => n !== i))}>
                      Remove row
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          <Button type="button" variant="secondary" onClick={() => set('items', [...data.items, newItem()])}>
            Add Another Brick Size
          </Button>

          <Field label="Notes">
            <textarea maxLength={4000} value={data.notes} onChange={e => set('notes', e.target.value)} />
          </Field>

        </fieldset>

        <div className="notice">
          Net production: {number(net)} bricks. Cement sacks are recorded as whole packs and never added to brick stock.
        </div>

        {(localError || error) && <p className="auth-error" role="alert">{localError || error}</p>}

        {!readonly && (
          <div className="dialog-actions">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            {initial.status !== 'completed' && (
              <>
                <Button variant="secondary" value="draft"       type="submit">Save Draft</Button>
                <Button variant="secondary" value="in_progress" type="submit">Save In Progress</Button>
              </>
            )}
            <Button value="completed" type="submit">
              {initial.status === 'completed' ? 'Review correction' : 'Save Production'}
            </Button>
            {owner && initial.revision > 0 && (
              <Button variant="secondary" className="delete-action" type="button" onClick={() => setReview({ ...initial, status: 'reversed' })}>
                <Trash2 size={16} /> Delete production
              </Button>
            )}
          </div>
        )}
      </form>

      {audit.length > 0 && (
        <details>
          <summary>Audit history</summary>
          <Table
            rows={audit.sort((a, b) => a.created_at.localeCompare(b.created_at))}
            columns={[
              { key: 'created_at', label: 'Time'   },
              { key: 'action',     label: 'Action' },
              { key: 'reason',     label: 'Reason' },
            ]}
          />
        </details>
      )}
    </Dialog>
  );
}

// ─── Production Overview (Dashboard widget) ───────────────────────────────────
export function ProductionOverview({ settings, revision }) {
  const [rows, setRows]     = useState([]);
  const [recent, setRecent] = useState([]);
  const [error, setError]   = useState('');
  const [period, setPeriod] = useState('daily');
  const end = today(settings.timezone);

  useEffect(() => {
    let active = true;
    Promise.all([allRows('production_totals_source'), allRows('production_register')])
      .then(([r, s]) => {
        if (active) {
          setRows(r);
          setRecent(
            s.filter(i => i.status === 'completed')
             .sort((a, b) => b.production_date.localeCompare(a.production_date))
             .slice(0, 6)
          );
          setError('');
        }
      })
      .catch(e => active && setError(e.message));
    return () => { active = false; };
  }, [revision]);

  const day = rows.filter(r => r.production_date === end);
  const sum = k => day.reduce((s, r) => s + Number(r[k] || 0), 0);

  const grouped = {};
  for (const r of rows) {
    let date = r.production_date;
    if (period === 'monthly') {
      date = date.slice(0, 7);
    } else if (period === 'weekly') {
      const d = new Date(date + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
      date = d.toISOString().slice(0, 10);
    }
    grouped[date] = (grouped[date] || 0) + Number(r.net_quantity);
  }
  const chart = Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([date, net]) => ({ date, net }));

  return (
    <>
      <SectionTitle title="Production today" subtitle={displayDate(end)} />
      {error ? <p className="auth-error">{error}</p> : (
        <>
          <div className="report-total-grid">
            {[
              ['Actual produced',  'quantity_produced'],
              ['Net production',   'net_quantity'],
              ['Rejected bricks',  'rejected_quantity'],
              ['Cement sacks',     'cement_packs_used'],
            ].map(([l, k]) => (
              <Card className="report-total" key={k}>
                <span>{l}</span>
                <strong>{number(sum(k))}</strong>
              </Card>
            ))}
          </div>

          <Card>
            <SectionTitle
              title="Net production"
              action={
                <select aria-label="Production chart period" value={period} onChange={e => setPeriod(e.target.value)}>
                  {['daily', 'weekly', 'monthly'].map(s => <option key={s}>{s}</option>)}
                </select>
              }
            />
            {chart.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chart}>
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="net" name="Net bricks" fill="#23754d" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No completed production" description="Complete a production session to see your chart." />
            )}
          </Card>

          <Card>
            <SectionTitle
              title="Recent completed production"
              action={<Link to="/production">View register</Link>}
            />
            <Table
              rows={recent}
              columns={tableCols.filter(c => ['reference_number', 'production_date', 'brick_size', 'net_quantity'].includes(c.key))}
            />
          </Card>
        </>
      )}
    </>
  );
}
