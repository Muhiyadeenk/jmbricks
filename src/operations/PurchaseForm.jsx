import React, { useState, useMemo } from 'react';
import { Package, Plus, UserPlus, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { Button, Field, Dialog, Badge } from '../components';
import { today, currency, execute } from './api';

// Convert user-facing unit to PostgreSQL products_unit_check valid unit ('brick','bag','tonne','kg','litre','piece')
export function toDbUnit(u) {
  if (u === 'nos' || u === 'number' || u === 'piece') return 'piece';
  if (u === 'ton' || u === 'tonne' || u === 'load' || u === 'trip' || u === 'cft' || u === 'unit') return 'tonne';
  if (u === 'kg') return 'kg';
  if (u === 'litre') return 'litre';
  if (u === 'bag') return 'bag';
  return 'piece';
}

// Convert PostgreSQL DB unit to human-readable friendly label
export function formatUnit(u) {
  if (u === 'piece') return 'nos';
  if (u === 'tonne') return 'ton';
  return u || '';
}

// Standard raw materials used in JM Hollo Bricks manufacturing (in strict default display order)
export const STANDARD_RAW_MATERIALS = [
  { name: 'Baby Metal', code: 'RM-BABYMETAL', unit: 'tonne' },
  { name: 'Dust', code: 'RM-DUST', unit: 'tonne' },
  { name: 'Cement', code: 'RM-CEMENT', unit: 'bag' },
  { name: 'Chemical', code: 'RM-CHEMICAL', unit: 'litre' },
];

export const RAW_MATERIAL_UNITS = [
  { value: 'tonne', label: 'Ton(s)' },
  { value: 'bag', label: 'Bag(s)' },
  { value: 'piece', label: 'Number(s) (Nos)' },
  { value: 'litre', label: 'Litre(s)' },
  { value: 'kg', label: 'Kilogram(s) (kg)' },
];

const paymentMethods = [
  ['cash', 'Cash'],
  ['bank_transfer', 'Bank transfer'],
  ['upi', 'UPI / GPay / PhonePe'],
  ['card', 'Card'],
  ['other', 'Other']
];

export default function PurchaseForm({ initial = {}, catalog, settings, onSubmit, onClose, busy, error: serverError }) {
  // Only RAW MATERIALS from catalog — strictly NEVER finished bricks
  const existingRawMaterials = useMemo(() => {
    return (catalog.products || []).filter(p => p.is_active && p.kind === 'raw_material');
  }, [catalog.products]);

  // Combined selection list — ALWAYS displays in strict required order:
  // 1. Baby Metal
  // 2. Dust
  // 3. Cement
  // 4. Chemical
  // followed by other active yard materials, then custom
  const materialChoices = useMemo(() => {
    const matchedExistingIds = new Set();

    // 1. First: the 4 mandatory standard raw materials in exact order
    const list = STANDARD_RAW_MATERIALS.map(std => {
      // Find matching product in database catalog (by exact name, code, or common alias)
      const existing = existingRawMaterials.find(p => {
        const pName = (p.name || '').trim().toLowerCase();
        const stdName = std.name.trim().toLowerCase();
        return (
          pName === stdName ||
          p.code === std.code ||
          (stdName === 'dust' && (pName === 'dust' || pName === 'quarry dust')) ||
          (stdName === 'chemical' && (pName === 'chemical' || pName === 'chemical admixture'))
        );
      });

      if (existing) {
        matchedExistingIds.add(existing.id);
        const avail = existing.available_quantity != null ? existing.available_quantity : 0;
        const u = existing.unit || std.unit;
        return {
          type: 'existing',
          id: existing.id,
          name: std.name, // Keep clean standard display name
          code: existing.code || std.code,
          unit: u,
          stock: avail,
          label: `${std.name} (In stock: ${avail} ${formatUnit(u)})`,
        };
      }

      // Not yet created in products table — display actual stock 0
      return {
        type: 'standard',
        id: `std-${std.code}`,
        name: std.name,
        code: std.code,
        unit: std.unit,
        stock: 0,
        label: `${std.name} (In stock: 0 ${formatUnit(std.unit)})`,
      };
    });

    // 2. Other existing raw materials in catalog
    existingRawMaterials.forEach(p => {
      if (!matchedExistingIds.has(p.id)) {
        const avail = p.available_quantity != null ? p.available_quantity : 0;
        const u = p.unit || 'tonne';
        list.push({
          type: 'existing',
          id: p.id,
          name: p.name,
          code: p.code,
          unit: u,
          stock: avail,
          label: `${p.name} (In stock: ${avail} ${formatUnit(u)})`,
        });
      }
    });

    // 3. Option to add any custom raw material
    list.push({
      type: 'custom',
      id: '__custom__',
      name: '',
      code: '',
      unit: 'tonne',
      stock: 0,
      label: '➕ Add other raw material...',
    });

    return list;
  }, [existingRawMaterials]);

  // Form state
  const [date, setDate] = useState(() => initial.date || today(settings.timezone));
  const [supplierId, setSupplierId] = useState(() => initial.contact_id || '');
  const [isNewSupplier, setIsNewSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');

  // Material selection: default to first in list (Baby Metal)
  const [selectedChoiceId, setSelectedChoiceId] = useState(() => {
    if (initial.items?.[0]?.product_id) {
      return initial.items[0].product_id;
    }
    return materialChoices[0]?.id || '';
  });
  const [customMaterialName, setCustomMaterialName] = useState('');
  const [materialUnit, setMaterialUnit] = useState(() => {
    const first = materialChoices[0];
    return first?.unit || 'ton';
  });

  // Quantity and Rate
  const [quantity, setQuantity] = useState(() => initial.items?.[0]?.quantity ? String(initial.items[0].quantity) : '');
  const [rate, setRate] = useState(() => initial.items?.[0]?.price ? String(initial.items[0].price) : '');

  // Payment status: 'paid', 'partial', 'pending'
  const [paymentStatus, setPaymentStatus] = useState('paid');
  const [amountPaid, setAmountPaid] = useState(() => initial.paid ? String(initial.paid) : '');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [notes, setNotes] = useState(() => initial.notes || '');

  const [review, setReview] = useState(null);
  const [localError, setLocalError] = useState('');
  const [savingProduct, setSavingProduct] = useState(false);

  // Derived current material
  const currentChoice = useMemo(() => {
    return materialChoices.find(c => c.id === selectedChoiceId) || materialChoices[0];
  }, [materialChoices, selectedChoiceId]);

  const effectiveMaterialName = currentChoice?.type === 'custom' ? customMaterialName.trim() : (currentChoice?.name || '');
  const isCustomMode = currentChoice?.type === 'custom';

  // Handle choice selection
  function handleMaterialChoiceChange(choiceId) {
    setSelectedChoiceId(choiceId);
    const chosen = materialChoices.find(c => c.id === choiceId);
    if (chosen && chosen.type !== 'custom') {
      setMaterialUnit(chosen.unit);
    }
  }

  // Handle supplier dropdown
  function handleSupplierChange(val) {
    if (val === '__new__') {
      setIsNewSupplier(true);
      setSupplierId('');
    } else {
      setIsNewSupplier(false);
      setSupplierId(val);
    }
  }

  // Automatic calculation: Total Amount = Quantity × Rate per Unit
  const qtyNumber = Number(quantity);
  const rateNumber = Number(rate);
  const totalAmount = (!isNaN(qtyNumber) && !isNaN(rateNumber) && qtyNumber > 0 && rateNumber >= 0)
    ? Math.round(qtyNumber * rateNumber * 100) / 100
    : 0;

  // Handle Payment Status change
  function handleStatusChange(status) {
    setPaymentStatus(status);
    if (status === 'paid') {
      setAmountPaid(totalAmount > 0 ? String(totalAmount) : '');
    } else if (status === 'pending') {
      setAmountPaid('0');
    } else if (status === 'partial') {
      // Keep or let user type partial
      if (Number(amountPaid) >= totalAmount || Number(amountPaid) === 0) {
        setAmountPaid('');
      }
    }
  }

  // Auto-sync amountPaid when Total Amount changes while in 'paid' or 'pending' status
  React.useEffect(() => {
    if (paymentStatus === 'paid') {
      setAmountPaid(totalAmount > 0 ? String(totalAmount) : '');
    } else if (paymentStatus === 'pending') {
      setAmountPaid('0');
    }
  }, [totalAmount, paymentStatus]);

  // When user types Amount Paid manually, auto-adjust status
  function handlePaidChange(val) {
    setAmountPaid(val);
    const num = Number(val);
    if (isNaN(num) || num <= 0) {
      if (val === '0') setPaymentStatus('pending');
    } else if (totalAmount > 0 && num >= totalAmount) {
      setPaymentStatus('paid');
    } else if (totalAmount > 0 && num > 0 && num < totalAmount) {
      setPaymentStatus('partial');
    }
  }

  // Balance Amount = Total Amount - Amount Paid
  const paidNumber = Number(amountPaid) || 0;
  const balanceAmount = Math.max(0, Math.round((totalAmount - paidNumber) * 100) / 100);

  // Validate and prepare review
  function handlePrepare(e) {
    e.preventDefault();
    setLocalError('');

    if (!date) {
      setLocalError('Please choose a purchase date.');
      return;
    }

    if (isNewSupplier) {
      if (!newSupplierName.trim()) {
        setLocalError('Please enter the new supplier name.');
        return;
      }
    } else if (!supplierId) {
      setLocalError('Please select a supplier or click "Add new supplier".');
      return;
    }

    if (isCustomMode && !customMaterialName.trim()) {
      setLocalError('Please enter the raw material name.');
      return;
    }

    if (!effectiveMaterialName) {
      setLocalError('Please select a raw material.');
      return;
    }

    if (!qtyNumber || qtyNumber <= 0) {
      setLocalError('Enter a valid quantity greater than 0.');
      return;
    }

    if (isNaN(rateNumber) || rateNumber < 0) {
      setLocalError('Enter a valid rate per unit.');
      return;
    }

    if (totalAmount <= 0) {
      setLocalError('Total amount must be greater than zero.');
      return;
    }

    if (paidNumber > totalAmount) {
      setLocalError('Amount paid cannot exceed total purchase amount.');
      return;
    }

    if (paymentStatus === 'partial' && (paidNumber <= 0 || paidNumber >= totalAmount)) {
      setLocalError('For partial payment, enter an amount paid between 0 and total amount.');
      return;
    }

    // Set review payload
    setReview({
      date,
      supplierName: isNewSupplier
        ? newSupplierName.trim()
        : (catalog.suppliers?.find(s => s.id === supplierId)?.name || 'Selected supplier'),
      supplierPhone: isNewSupplier ? newSupplierPhone.trim() : '',
      supplierId: isNewSupplier ? '' : supplierId,
      materialName: effectiveMaterialName,
      unit: materialUnit,
      quantity: String(qtyNumber),
      rate: String(rateNumber),
      totalAmount,
      amountPaid: String(paidNumber),
      balanceAmount,
      paymentStatus,
      paymentMethod: paidNumber > 0 ? paymentMethod : 'cash',
      notes: notes.trim(),
      choice: currentChoice,
    });
  }

  // Confirm and submit
  async function handleConfirm() {
    if (busy || savingProduct) return;
    setLocalError('');

    try {
      let resolvedProductId = null;

      // 1. If choice is an existing catalog product, use its ID
      if (review.choice.type === 'existing') {
        resolvedProductId = review.choice.id;
      } else {
        // 2. Need to ensure the raw material product exists in Supabase products table
        // Check if a product with this exact name already exists in catalog
        const existing = (catalog.products || []).find(
          p => p.kind === 'raw_material' && p.name.toLowerCase() === review.materialName.toLowerCase()
        );

        if (existing) {
          resolvedProductId = existing.id;
        } else {
          // Create the raw material product on the fly
          setSavingProduct(true);
          const rawCode = review.choice.code || `RM-${review.materialName.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8)}`;
          let created = null;
          try {
            created = await execute({
              kind: 'product',
              id: crypto.randomUUID(),
              payload: {
                name: review.materialName,
                code: rawCode,
                kind: 'raw_material',
                unit: toDbUnit(review.unit),
                is_stocked: true,
                is_active: true,
                length_mm: null,
                width_mm: null,
                height_mm: null,
                production_cost: null,
                selling_price: '0',
                minimum_stock: '0',
              }
            });
          } catch (createErr) {
            // If PostgreSQL check constraint 'products_unit_check' rejects the unit (e.g. 'piece' or 'nos'),
            // fallback to a universally accepted unit ('tonne' for sand/metal/dust, 'bag' for cement, 'litre' for chemical, or 'piece')
            if (createErr?.message && createErr.message.includes('products_unit_check')) {
              const fallbackUnit = review.materialName.toLowerCase().includes('cement')
                ? 'bag'
                : review.materialName.toLowerCase().includes('chemical')
                ? 'litre'
                : 'tonne';
              created = await execute({
                kind: 'product',
                id: crypto.randomUUID(),
                payload: {
                  name: review.materialName,
                  code: rawCode,
                  kind: 'raw_material',
                  unit: fallbackUnit,
                  is_stocked: true,
                  is_active: true,
                  length_mm: null,
                  width_mm: null,
                  height_mm: null,
                  production_cost: null,
                  selling_price: '0',
                  minimum_stock: '0',
                }
              });
            } else {
              throw createErr;
            }
          } finally {
            setSavingProduct(false);
          }
          resolvedProductId = created?.id;
        }
      }

      if (!resolvedProductId) {
        throw new Error('Unable to resolve raw material product ID.');
      }

      // 3. Submit purchase payload
      const payload = {
        date: review.date,
        contact_id: review.supplierId || '',
        name: isNewSupplier ? review.supplierName : '',
        phone: isNewSupplier ? review.supplierPhone : '',
        items: [
          {
            product_id: resolvedProductId,
            description: review.materialName,
            quantity: review.quantity,
            price: review.rate,
          }
        ],
        paid: review.amountPaid,
        payment_method: Number(review.amountPaid) > 0 ? review.paymentMethod : 'cash',
        notes: review.notes,
      };

      onSubmit('purchase', payload);
    } catch (err) {
      setSavingProduct(false);
      setLocalError(err.message || 'Unable to save raw material purchase.');
    }
  }

  // ── Confirmation / Review Dialog ───────────────────────────────────────────
  if (review) {
    return (
      <Dialog title="Confirm Raw Material Purchase" onClose={busy ? () => {} : () => setReview(null)}>
        <div className="notice" style={{ background: '#eaf4ee', borderColor: '#b8dabf', color: '#164a2c' }}>
          <strong>📦 Raw Material Stock Update</strong>
          <p style={{ margin: '4px 0 0', fontSize: '13px' }}>
            Saving this purchase will automatically add <strong>{review.quantity} {formatUnit(review.unit)}</strong> to your <strong>{review.materialName}</strong> stock and record the supplier transaction.
          </p>
        </div>

        <dl className="review-list">
          <dt>Purchase Date</dt>
          <dd>{review.date}</dd>

          <dt>Supplier</dt>
          <dd>{review.supplierName}{review.supplierPhone ? ` · ${review.supplierPhone}` : ''}</dd>

          <dt>Raw Material</dt>
          <dd style={{ fontWeight: 700, color: '#1a6640' }}>{review.materialName}</dd>

          <dt>Quantity</dt>
          <dd>{review.quantity} {formatUnit(review.unit)}</dd>

          <dt>Rate per {formatUnit(review.unit)}</dt>
          <dd>{currency(review.rate, settings.currency)}</dd>

          <dt>Total Amount</dt>
          <dd style={{ fontSize: '18px', fontWeight: 800, color: '#1a6640' }}>
            {currency(review.totalAmount, settings.currency)}
          </dd>

          <dt>Payment Status</dt>
          <dd>
            <Badge tone={review.paymentStatus === 'paid' ? 'green' : review.paymentStatus === 'partial' ? 'amber' : 'neutral'}>
              {review.paymentStatus === 'paid' ? 'Paid Full' : review.paymentStatus === 'partial' ? 'Partial Payment' : 'Pending / Credit'}
            </Badge>
          </dd>

          <dt>Amount Paid</dt>
          <dd>{currency(review.amountPaid, settings.currency)} {Number(review.amountPaid) > 0 && `(${review.paymentMethod})`}</dd>

          <dt>Balance to Pay</dt>
          <dd style={{ fontWeight: 700, color: review.balanceAmount > 0 ? '#b54708' : '#1a6640' }}>
            {currency(review.balanceAmount, settings.currency)}
          </dd>

          {review.notes && (
            <>
              <dt>Notes</dt>
              <dd style={{ fontStyle: 'italic' }}>{review.notes}</dd>
            </>
          )}
        </dl>

        {(localError || serverError) && (
          <p className="auth-error" role="alert">{localError || serverError}</p>
        )}

        <div className="dialog-actions">
          <Button variant="secondary" disabled={busy || savingProduct} onClick={() => setReview(null)}>
            Back to Edit
          </Button>
          <Button disabled={busy || savingProduct} onClick={handleConfirm}>
            {savingProduct ? 'Setting up material…' : busy ? 'Saving purchase…' : 'Confirm & Save Purchase'}
          </Button>
        </div>
      </Dialog>
    );
  }

  // ── Main Raw Material Purchase Form ────────────────────────────────────────
  return (
    <Dialog title="Purchase Raw Material" onClose={onClose}>
      <form onSubmit={handlePrepare} className="raw-material-purchase-form">
        <p className="help" style={{ marginBottom: '14px', fontSize: '14px', color: '#4a6252' }}>
          Record raw materials received for brick production (Cement, Sand, Quarry Dust, etc.). This automatically updates raw material inventory.
        </p>

        {/* 1. Date & Supplier */}
        <div className="form-grid">
          <Field
            label="Purchase Date"
            type="date"
            max={today(settings.timezone)}
            value={date}
            onChange={e => setDate(e.target.value)}
            required
          />

          <Field label="Supplier Name">
            <select
              value={isNewSupplier ? '__new__' : supplierId}
              onChange={e => handleSupplierChange(e.target.value)}
              required
            >
              <option value="">Choose existing supplier</option>
              {(catalog.suppliers || []).map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.phone ? ` · ${s.phone}` : ''}
                </option>
              ))}
              <option value="__new__">➕ Add new supplier...</option>
            </select>
          </Field>
        </div>

        {/* New supplier fields if selected */}
        {isNewSupplier && (
          <div className="form-grid" style={{ background: '#f5f8f5', padding: '12px 14px', borderRadius: '10px', margin: '-4px 0 14px' }}>
            <Field
              label="New Supplier Name"
              required
              maxLength={160}
              placeholder="e.g. Metro Sand & Gravels"
              value={newSupplierName}
              onChange={e => setNewSupplierName(e.target.value)}
            />
            <Field
              label="Phone Number (optional)"
              type="tel"
              maxLength={40}
              placeholder="e.g. 9876543210"
              value={newSupplierPhone}
              onChange={e => setNewSupplierPhone(e.target.value)}
            />
          </div>
        )}

        {/* 2. Raw Material & Unit */}
        <div className="form-grid">
          <Field label="Raw Material Name">
            <select
              value={selectedChoiceId}
              onChange={e => handleMaterialChoiceChange(e.target.value)}
              required
            >
              <optgroup label="Raw Materials">
                {materialChoices.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </Field>

          <Field label="Unit of Measurement">
            <select
              value={materialUnit}
              onChange={e => setMaterialUnit(e.target.value)}
              required
            >
              {RAW_MATERIAL_UNITS.map(u => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* Custom material name if "+ Add other" selected */}
        {isCustomMode && (
          <div style={{ background: '#f5f8f5', padding: '12px 14px', borderRadius: '10px', margin: '-4px 0 14px' }}>
            <Field
              label="Custom Raw Material Name"
              required
              maxLength={120}
              placeholder="e.g. Red Gravel, White Stone Powder"
              value={customMaterialName}
              onChange={e => setCustomMaterialName(e.target.value)}
            />
          </div>
        )}

        {/* 3. Quantity & Rate per Unit */}
        <div className="form-grid">
          <Field
            label={`Quantity (${formatUnit(materialUnit).toUpperCase()})`}
            type="number"
            min={['bag', 'piece', 'nos', 'number'].includes(materialUnit) ? '1' : '0.001'}
            max="1000000000"
            step={['bag', 'piece', 'nos', 'number'].includes(materialUnit) ? '1' : 'any'}
            placeholder={['bag', 'piece', 'nos', 'number'].includes(materialUnit) ? 'e.g. 50' : 'e.g. 15.5'}
            required
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
          />

          <Field
            label={`Rate per ${formatUnit(materialUnit)} (₹)`}
            type="number"
            min="0"
            max="1000000000"
            step="any"
            placeholder="e.g. 380"
            required
            value={rate}
            onChange={e => setRate(e.target.value)}
          />
        </div>

        {/* 4. Automatic Calculation Box */}
        <div
          className="purchase-total-card"
          style={{
            background: '#edf6ef',
            border: '1.5px solid #b8dabf',
            borderRadius: '12px',
            padding: '16px',
            margin: '14px 0',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#2e4e37', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Total Amount (Qty × Rate)
            </span>
            <strong style={{ fontSize: '26px', fontWeight: 800, color: '#1a6640' }}>
              {currency(totalAmount, settings.currency)}
            </strong>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#526e5a' }}>
            {qtyNumber > 0 && rateNumber >= 0
              ? `${qtyNumber} ${formatUnit(materialUnit)} × ${currency(rateNumber, settings.currency)} = ${currency(totalAmount, settings.currency)}`
              : 'Enter quantity and rate to calculate total'}
          </p>
        </div>

        {/* 5. Payment Status & Amount Paid */}
        <div className="form-grid">
          <Field label="Payment Status">
            <select
              value={paymentStatus}
              onChange={e => handleStatusChange(e.target.value)}
            >
              <option value="paid">Paid (Full payment upfront)</option>
              <option value="partial">Partial (Advance / Partial payment)</option>
              <option value="pending">Pending (Credit / Pay later)</option>
            </select>
          </Field>

          <Field label="Amount Paid (₹)">
            <input
              type="number"
              min="0"
              max="1000000000"
              step="any"
              value={amountPaid}
              disabled={paymentStatus === 'pending'}
              placeholder="0.00"
              onChange={e => handlePaidChange(e.target.value)}
            />
          </Field>
        </div>

        {/* Payment method if paid > 0 */}
        {Number(amountPaid) > 0 && (
          <div className="form-grid" style={{ margin: '-4px 0 14px' }}>
            <Field label="Payment Method">
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
              >
                {paymentMethods.map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </Field>

            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#4a6252', marginBottom: '4px' }}>
                Balance Remaining
              </span>
              <strong style={{ fontSize: '20px', fontWeight: 700, color: balanceAmount > 0 ? '#b54708' : '#1a6640' }}>
                {currency(balanceAmount, settings.currency)}
              </strong>
            </div>
          </div>
        )}

        {/* Balance callout if unpaid/pending */}
        {Number(amountPaid) === 0 && totalAmount > 0 && (
          <div style={{ background: '#fff9eb', border: '1px solid #f9dfa2', borderRadius: '10px', padding: '10px 14px', margin: '0 0 14px', color: '#875100', fontSize: '13px' }}>
            <strong>Full Credit Purchase:</strong> {currency(totalAmount, settings.currency)} will be added to {isNewSupplier ? newSupplierName || 'Supplier' : (catalog.suppliers?.find(s => s.id === supplierId)?.name || 'Supplier')}'s outstanding balance.
          </div>
        )}

        {/* 6. Notes */}
        <Field label="Notes (optional)">
          <textarea
            maxLength={4000}
            rows={2}
            placeholder="e.g. Vehicle KL-55-A-1234, Challan #402, cement grade 53..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </Field>

        {(localError || serverError) && (
          <p className="auth-error" role="alert">{localError || serverError}</p>
        )}

        {/* 7. Action buttons */}
        <div className="dialog-actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || totalAmount <= 0}>
            Review Purchase
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
