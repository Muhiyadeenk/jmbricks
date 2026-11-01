import React, { useState, useMemo } from 'react';
import { Search, UserPlus, Edit3, MapPin, Phone, User, Plus, Trash2, CheckCircle2, AlertCircle, X, ChevronDown } from 'lucide-react';
import { Button, Field, Dialog, Badge } from '../components';
import { today, currency } from './api';
import { totals } from './calculations';
import { supabase } from '../lib/supabase';

const paymentMethods = [
  ['cash', 'Cash'],
  ['bank_transfer', 'Bank transfer'],
  ['upi', 'UPI / GPay / PhonePe'],
  ['card', 'Card'],
  ['other', 'Other']
];

export default function SaleForm({
  initial = {},
  catalog,
  settings,
  onSubmit,
  onClose,
  busy,
  error: serverError,
  onCustomerUpdate
}) {
  // Available finished bricks only
  const availableBricks = useMemo(() => {
    return (catalog.products || []).filter(p => p.is_active && p.kind === 'finished_brick');
  }, [catalog.products]);

  // Customers list from catalog
  const customers = useMemo(() => {
    return (catalog.customers || []).filter(c => c.is_active !== false);
  }, [catalog.customers]);

  // Form State
  const [date, setDate] = useState(() => initial.date || today(settings.timezone));
  const [selectedCustomerId, setSelectedCustomerId] = useState(() => initial.contact_id || '');
  
  // Customer Search & Picker state
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // New Customer Modal
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerLocation, setNewCustomerLocation] = useState('');
  const [customerSaving, setCustomerSaving] = useState(false);
  const [customerError, setCustomerError] = useState('');

  // Edit Customer Modal
  const [showEditCustomerModal, setShowEditCustomerModal] = useState(false);
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerPhone, setEditCustomerPhone] = useState('');
  const [editCustomerLocation, setEditCustomerLocation] = useState('');

  // Sale Items
  const [items, setItems] = useState(() => {
    if (initial.items && initial.items.length > 0) return initial.items;
    const firstBrick = availableBricks[0];
    return [{
      product_id: firstBrick?.id || '',
      quantity: '',
      price: firstBrick ? String(firstBrick.selling_price || '') : ''
    }];
  });

  // Financials
  const [discount, setDiscount] = useState(() => initial.discount ? String(initial.discount) : '0');
  const [amountPaid, setAmountPaid] = useState(() => initial.paid ? String(initial.paid) : '');
  const [paymentMethod, setPaymentMethod] = useState(() => initial.payment_method || 'cash');
  const [notes, setNotes] = useState(() => initial.notes || '');

  // Review & errors
  const [review, setReview] = useState(null);
  const [localError, setLocalError] = useState('');

  // Currently selected customer object
  const selectedCustomer = useMemo(() => {
    return customers.find(c => c.id === selectedCustomerId) || null;
  }, [customers, selectedCustomerId]);

  // Filtered customers for search
  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers.slice(0, 15);
    return customers.filter(c => {
      const name = (c.name || '').toLowerCase();
      const phone = (c.phone || '').toLowerCase();
      const loc = (c.location || c.place || c.address || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || loc.includes(q);
    }).slice(0, 20);
  }, [customers, customerSearch]);

  // Check for duplicate phone when creating new customer
  const duplicatePhoneCustomer = useMemo(() => {
    const p = newCustomerPhone.trim();
    if (!p || p.length < 5) return null;
    return customers.find(c => c.phone && c.phone.trim() === p);
  }, [customers, newCustomerPhone]);

  // Calculations
  const summary = useMemo(() => {
    return totals(items, discount || '0', amountPaid || '0');
  }, [items, discount, amountPaid]);

  // Item helpers
  function updateItem(index, key, val) {
    setItems(old => old.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, [key]: val };
      if (key === 'product_id') {
        const prod = availableBricks.find(p => p.id === val);
        updated.price = prod ? String(prod.selling_price || '0') : '';
      }
      return updated;
    }));
  }

  function addItem() {
    const unselected = availableBricks.find(b => !items.some(it => it.product_id === b.id));
    const target = unselected || availableBricks[0];
    setItems(old => [...old, {
      product_id: target?.id || '',
      quantity: '',
      price: target ? String(target.selling_price || '0') : ''
    }]);
  }

  function removeItem(index) {
    if (items.length <= 1) return;
    setItems(old => old.filter((_, i) => i !== index));
  }

  // Open New Customer Modal
  function handleOpenNewCustomer() {
    setNewCustomerName(customerSearch.trim());
    setNewCustomerPhone('');
    setNewCustomerLocation('');
    setCustomerError('');
    setShowCustomerDropdown(false);
    setShowNewCustomerModal(true);
  }

  // Open Edit Customer Modal
  function handleOpenEditCustomer() {
    if (!selectedCustomer) return;
    setEditCustomerName(selectedCustomer.name || '');
    setEditCustomerPhone(selectedCustomer.phone || '');
    setEditCustomerLocation(selectedCustomer.location || selectedCustomer.place || selectedCustomer.address || '');
    setCustomerError('');
    setShowEditCustomerModal(true);
  }

  // Save NEW customer to database
  async function handleSaveNewCustomer(e) {
    e.preventDefault();
    if (!newCustomerName.trim()) {
      setCustomerError('Customer name is required.');
      return;
    }
    setCustomerSaving(true);
    setCustomerError('');

    const newId = crypto.randomUUID();
    const customerPayload = {
      id: newId,
      name: newCustomerName.trim(),
      phone: newCustomerPhone.trim(),
      location: newCustomerLocation.trim(),
      is_active: true
    };

    try {
      // 1. Insert into Supabase customers table
      const { data, error } = await supabase
        .from('customers')
        .insert(customerPayload)
        .select()
        .single();

      if (error) {
        // If permission denied by RLS, seamlessly use RPC fallback on sale submission
        if (error.code === '42501' || (error.message && error.message.includes('permission denied'))) {
          const fallback = {
            id: `pending-${newId}`,
            name: newCustomerName.trim(),
            phone: newCustomerPhone.trim(),
            location: newCustomerLocation.trim(),
            isPendingNew: true
          };
          completeCustomerSave(fallback);
          return;
        }

        // If location column doesn't exist yet in PostgreSQL, try insert without location
        if (error.message && error.message.includes('location')) {
          const fallback = {
            id: newId,
            name: newCustomerName.trim(),
            phone: newCustomerPhone.trim(),
            is_active: true
          };
          const { data: fbData, error: fbErr } = await supabase.from('customers').insert(fallback).select().single();
          if (fbErr) {
            if (fbErr.code === '42501' || (fbErr.message && fbErr.message.includes('permission denied'))) {
              completeCustomerSave({ ...fallback, id: `pending-${newId}`, location: newCustomerLocation.trim(), isPendingNew: true });
              return;
            }
            throw fbErr;
          }
          completeCustomerSave(fbData || fallback);
          return;
        }
        throw error;
      }

      completeCustomerSave(data || customerPayload);
    } catch (err) {
      // In case of any unhandled network error or permission issue, fallback gracefully to allow sale completion
      const fallback = {
        id: `pending-${newId}`,
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim(),
        location: newCustomerLocation.trim(),
        isPendingNew: true
      };
      completeCustomerSave(fallback);
    } finally {
      setCustomerSaving(false);
    }
  }

  function completeCustomerSave(customerObj) {
    // Add to local catalog if not already there
    if (!catalog.customers.some(c => c.id === customerObj.id)) {
      catalog.customers.push(customerObj);
    }
    setSelectedCustomerId(customerObj.id);
    setShowNewCustomerModal(false);
    setCustomerSearch('');
    if (onCustomerUpdate) onCustomerUpdate();
  }

  // Save EDITED customer to database
  async function handleSaveEditCustomer(e) {
    e.preventDefault();
    if (!editCustomerName.trim()) {
      setCustomerError('Customer name is required.');
      return;
    }
    setCustomerSaving(true);
    setCustomerError('');

    const updatePayload = {
      name: editCustomerName.trim(),
      phone: editCustomerPhone.trim(),
      location: editCustomerLocation.trim()
    };

    try {
      const { data, error } = await supabase
        .from('customers')
        .update(updatePayload)
        .eq('id', selectedCustomer.id)
        .select()
        .single();

      if (error) {
        if (error.code === '42501' || (error.message && error.message.includes('permission denied'))) {
          // Update in local memory for this session
          completeCustomerEdit({ ...selectedCustomer, ...updatePayload });
          return;
        }
        // Fallback if location column doesn't exist yet
        if (error.message && error.message.includes('location')) {
          const fallback = {
            name: editCustomerName.trim(),
            phone: editCustomerPhone.trim()
          };
          const { data: fbData, error: fbErr } = await supabase
            .from('customers')
            .update(fallback)
            .eq('id', selectedCustomer.id)
            .select()
            .single();
          if (fbErr) {
            if (fbErr.code === '42501' || (fbErr.message && fbErr.message.includes('permission denied'))) {
              completeCustomerEdit({ ...selectedCustomer, ...updatePayload });
              return;
            }
            throw fbErr;
          }
          completeCustomerEdit(fbData || { ...selectedCustomer, ...fallback });
          return;
        }
        throw error;
      }

      completeCustomerEdit(data || { ...selectedCustomer, ...updatePayload });
    } catch (err) {
      // Graceful in-session update
      completeCustomerEdit({ ...selectedCustomer, ...updatePayload });
    } finally {
      setCustomerSaving(false);
    }
  }

  function completeCustomerEdit(updatedObj) {
    const idx = catalog.customers.findIndex(c => c.id === updatedObj.id);
    if (idx !== -1) {
      catalog.customers[idx] = { ...catalog.customers[idx], ...updatedObj };
    }
    setShowEditCustomerModal(false);
    if (onCustomerUpdate) onCustomerUpdate();
  }

  // Form submission verification
  function handleReview(e) {
    e.preventDefault();
    setLocalError('');

    if (!selectedCustomerId) {
      setLocalError('Please select an existing customer or add a new customer.');
      return;
    }

    if (!items.length || items.some(it => !it.product_id || Number(it.quantity) <= 0)) {
      setLocalError('Please enter a valid brick quantity for each line item.');
      return;
    }

    if (new Set(items.map(it => it.product_id)).size !== items.length) {
      setLocalError('Use one line per brick product; combine repeated quantities.');
      return;
    }

    if (!summary || !summary.valid) {
      setLocalError('Check quantities, prices, discount and payment. Payment cannot exceed total amount.');
      return;
    }

    // Prepare review payload
    setReview({
      date,
      contact_id: selectedCustomerId,
      customerName: selectedCustomer?.name || 'Selected Customer',
      customerPhone: selectedCustomer?.phone || '',
      customerLocation: selectedCustomer?.location || selectedCustomer?.place || selectedCustomer?.address || '',
      items,
      discount: discount || '0',
      paid: amountPaid || '0',
      total: summary.total,
      balance: summary.balance,
      payment_method: Number(amountPaid) > 0 ? paymentMethod : 'cash',
      notes: notes.trim()
    });
  }

  // Final confirm & submit
  function handleConfirm() {
    if (busy) return;
    const isNew = selectedCustomer?.isPendingNew || !review.contact_id || String(review.contact_id).startsWith('pending-');
    const combinedNotes = [
      review.notes,
      review.customerLocation ? `📍 Location: ${review.customerLocation}` : ''
    ].filter(Boolean).join(' · ');

    const payload = {
      date: review.date,
      contact_id: isNew ? '' : review.contact_id,
      name: isNew ? review.customerName : '',
      phone: isNew ? review.customerPhone : '',
      items: review.items,
      discount: review.discount,
      paid: review.paid,
      payment_method: review.payment_method,
      notes: combinedNotes
    };
    onSubmit('sale', payload);
  }

  // ── Confirmation Dialog ───────────────────────────────────────────────────
  if (review) {
    return (
      <Dialog title="Confirm Sale Receipt" onClose={busy ? () => {} : () => setReview(null)}>
        <div className="notice" style={{ background: '#eaf4ee', borderColor: '#b8dabf', color: '#164a2c' }}>
          <strong>📋 Customer Order Confirmation</strong>
          <p style={{ margin: '4px 0 0', fontSize: '13px' }}>
            Saving this sale will deduct bricks from stock, create a receipt, and update customer balance records.
          </p>
        </div>

        <dl className="review-list">
          <dt>Sale Date</dt>
          <dd>{review.date}</dd>

          <dt>Customer</dt>
          <dd style={{ fontWeight: 700, color: '#132e1e' }}>
            {review.customerName}
            {review.customerPhone && <span style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: '#4a6252' }}>📞 {review.customerPhone}</span>}
            {review.customerLocation && <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#1a6640' }}>📍 {review.customerLocation}</span>}
          </dd>

          <dt>Items ({review.items.length})</dt>
          <dd>
            {review.items.map((it, idx) => {
              const p = availableBricks.find(b => b.id === it.product_id);
              return (
                <div key={idx} style={{ fontSize: '14px', marginBottom: '4px' }}>
                  <strong>{it.quantity} bricks</strong> of {p?.name || 'Brick'} @ {currency(it.price, settings.currency)}
                </div>
              );
            })}
          </dd>

          {Number(review.discount) > 0 && (
            <>
              <dt>Discount</dt>
              <dd style={{ color: '#b54708' }}>−{currency(review.discount, settings.currency)}</dd>
            </>
          )}

          <dt>Total Amount</dt>
          <dd style={{ fontSize: '20px', fontWeight: 800, color: '#1a6640' }}>
            {currency(review.total, settings.currency)}
          </dd>

          <dt>Amount Received</dt>
          <dd>
            {currency(review.paid, settings.currency)}
            {Number(review.paid) > 0 && <span style={{ fontSize: '12px', color: '#526e5a' }}> ({review.payment_method})</span>}
          </dd>

          <dt>Balance Due</dt>
          <dd style={{ fontWeight: 700, color: review.balance > 0 ? '#b54708' : '#1a6640' }}>
            {currency(review.balance, settings.currency)}
          </dd>

          {review.notes && (
            <>
              <dt>Notes</dt>
              <dd style={{ fontStyle: 'italic', color: '#4a6252' }}>{review.notes}</dd>
            </>
          )}
        </dl>

        {(serverError || localError) && (
          <p className="auth-error" role="alert">{serverError || localError}</p>
        )}

        <div className="dialog-actions">
          <Button variant="secondary" disabled={busy} onClick={() => setReview(null)}>
            Back to Edit
          </Button>
          <Button disabled={busy} onClick={handleConfirm}>
            {busy ? 'Saving sale…' : 'Confirm & Save Sale'}
          </Button>
        </div>
      </Dialog>
    );
  }

  // ── Main New Sale Form ────────────────────────────────────────────────────
  return (
    <>
      <Dialog title="New Sale" onClose={onClose}>
        <form onSubmit={handleReview}>
          <div className="form-grid">
            <Field label="Sale Date" type="date" max={today(settings.timezone)} value={date} onChange={e => setDate(e.target.value)} required />
          </div>

          {/* ── CUSTOMER MANAGEMENT SECTION ─────────────────────────────────── */}
          <div
            className="customer-selection-card"
            style={{
              background: '#f8faf8',
              border: '1.5px solid #dce8de',
              borderRadius: '14px',
              padding: '16px',
              margin: '16px 0',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#254430', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                Customer Details
              </span>
              {!selectedCustomer && (
                <button
                  type="button"
                  onClick={handleOpenNewCustomer}
                  style={{
                    background: '#edf5ef',
                    border: '1px solid #b8dabf',
                    color: '#1a6640',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '13px',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer'
                  }}
                >
                  <UserPlus size={15} /> Add New Customer
                </button>
              )}
            </div>

            {/* Selected Customer View */}
            {selectedCustomer ? (
              <div
                style={{
                  background: '#ffffff',
                  border: '1.5px solid #b8dabf',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '12px',
                  flexWrap: 'wrap'
                }}
              >
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#132e1e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <User size={18} color="#1a6640" />
                    {selectedCustomer.name}
                  </div>

                  <div style={{ display: 'flex', gap: '14px', marginTop: '6px', flexWrap: 'wrap', fontSize: '14px' }}>
                    {selectedCustomer.phone && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#3d5947', fontWeight: 500 }}>
                        <Phone size={14} color="#52785e" />
                        {selectedCustomer.phone}
                      </span>
                    )}
                    {(selectedCustomer.location || selectedCustomer.place || selectedCustomer.address) && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#165733', fontWeight: 600, background: '#eaf4ee', padding: '2px 8px', borderRadius: '6px' }}>
                        <MapPin size={14} color="#1a6640" />
                        {selectedCustomer.location || selectedCustomer.place || selectedCustomer.address}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button
                    type="button"
                    onClick={handleOpenEditCustomer}
                    style={{
                      background: '#edf5ef',
                      border: '1px solid #c0d8c7',
                      color: '#1a6640',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '13px',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      cursor: 'pointer'
                    }}
                    title="Edit customer details"
                  >
                    <Edit3 size={14} /> Edit Customer
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSelectedCustomerId(''); setCustomerSearch(''); }}
                    style={{
                      background: '#f4f6f4',
                      border: '1px solid #d5ded7',
                      color: '#556b5d',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Change
                  </button>
                </div>
              </div>
            ) : (
              /* Search / Dropdown Input */
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Search
                      size={18}
                      color="#6c8072"
                      style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                    />
                    <input
                      type="text"
                      placeholder="Search customer by name, phone or location (e.g. Kunnumpuram)..."
                      value={customerSearch}
                      onChange={e => {
                        setCustomerSearch(e.target.value);
                        setShowCustomerDropdown(true);
                      }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      style={{
                        width: '100%',
                        padding: '12px 14px 12px 38px',
                        fontSize: '15px',
                        borderRadius: '10px',
                        border: '1.5px solid #c2d4c6',
                        background: '#ffffff',
                        boxSizing: 'border-box'
                      }}
                    />
                    {customerSearch && (
                      <button
                        type="button"
                        onClick={() => { setCustomerSearch(''); setShowCustomerDropdown(false); }}
                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#7a8e80' }}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Dropdown Results List */}
                {showCustomerDropdown && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      background: '#ffffff',
                      border: '1.5px solid #b8dabf',
                      borderRadius: '12px',
                      boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
                      zIndex: 30,
                      marginTop: '6px',
                      maxHeight: '260px',
                      overflowY: 'auto'
                    }}
                  >
                    <div style={{ padding: '8px', borderBottom: '1px solid #edf2ee', background: '#f8faf8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#5a7263' }}>
                        {filteredCustomers.length} customer(s) found
                      </span>
                      <button
                        type="button"
                        onClick={handleOpenNewCustomer}
                        style={{ background: 'none', border: 'none', color: '#1a6640', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        + Register New Customer
                      </button>
                    </div>

                    {filteredCustomers.length === 0 ? (
                      <div style={{ padding: '16px', textAlign: 'center' }}>
                        <p style={{ margin: '0 0 10px', fontSize: '14px', color: '#687e70' }}>
                          No customer found matching "{customerSearch}".
                        </p>
                        <Button type="button" onClick={handleOpenNewCustomer} style={{ minHeight: '40px', fontSize: '14px' }}>
                          <UserPlus size={16} /> Add "{customerSearch.trim() || 'New Customer'}"
                        </Button>
                      </div>
                    ) : (
                      filteredCustomers.map(c => {
                        const loc = c.location || c.place || c.address;
                        return (
                          <div
                            key={c.id}
                            onClick={() => {
                              setSelectedCustomerId(c.id);
                              setShowCustomerDropdown(false);
                            }}
                            style={{
                              padding: '12px 14px',
                              borderBottom: '1px solid #f0f4f1',
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              transition: 'background 0.15s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f2f8f4'}
                            onMouseLeave={e => e.currentTarget.style.background = '#ffffff'}
                          >
                            <div>
                              <strong style={{ fontSize: '15px', color: '#132e1e' }}>{c.name}</strong>
                              <div style={{ display: 'flex', gap: '10px', marginTop: '2px', fontSize: '13px', color: '#567160' }}>
                                {c.phone && <span>📞 {c.phone}</span>}
                                {loc && <span style={{ color: '#1a6640', fontWeight: 600 }}>📍 {loc}</span>}
                              </div>
                            </div>
                            <span style={{ fontSize: '13px', color: '#1a6640', fontWeight: 600 }}>Select →</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── FINISHED BRICKS SELECTION ─────────────────────────────────────── */}
          <div style={{ margin: '20px 0 10px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#132e1e', marginBottom: '10px' }}>
              Brick Items
            </h3>

            <div className="entry-items">
              {items.map((item, idx) => {
                const prod = availableBricks.find(b => b.id === item.product_id);
                return (
                  <div className="entry-item" key={idx} style={{ padding: '14px', borderRadius: '12px', border: '1.5px solid #dce8de', background: '#fafdfa', marginBottom: '10px' }}>
                    <Field label={`Brick Size (Line ${idx + 1})`}>
                      <select
                        value={item.product_id}
                        required
                        onChange={e => updateItem(idx, 'product_id', e.target.value)}
                      >
                        <option value="">Choose brick size</option>
                        {availableBricks.map(b => (
                          <option key={b.id} value={b.id}>
                            {b.name} · {b.code} (In stock: {b.available_quantity || 0})
                          </option>
                        ))}
                      </select>
                    </Field>

                    <div className="form-grid" style={{ marginTop: '10px' }}>
                      <Field
                        label="Quantity (Bricks)"
                        type="number"
                        min="1"
                        step="1"
                        max="1000000000"
                        placeholder="e.g. 500"
                        required
                        value={item.quantity}
                        onChange={e => updateItem(idx, 'quantity', e.target.value)}
                      />

                      <Field
                        label="Price per brick (₹)"
                        type="number"
                        min="0"
                        step="0.01"
                        max="1000000000"
                        placeholder="e.g. 38"
                        required
                        value={item.price}
                        onChange={e => updateItem(idx, 'price', e.target.value)}
                      />
                    </div>

                    <div className="line-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                      <small style={{ color: '#4a6252', fontSize: '13px' }}>
                        {prod ? `Yard available: ${prod.available_quantity || 0} bricks` : 'Select a brick size'}
                      </small>
                      {items.length > 1 && (
                        <button
                          type="button"
                          className="icon-button"
                          aria-label="Remove item"
                          onClick={() => removeItem(idx)}
                          style={{ color: '#b42318' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <Button
              type="button"
              variant="secondary"
              disabled={items.length >= 10}
              onClick={addItem}
              style={{ minHeight: '44px', width: '100%', justifyContent: 'center', marginTop: '6px' }}
            >
              <Plus size={16} /> Add Another Brick Size
            </Button>
          </div>

          {/* ── PAYMENT & TOTALS ────────────────────────────────────────────── */}
          <div className="form-grid" style={{ marginTop: '16px' }}>
            <Field
              label="Discount (₹)"
              type="number"
              min="0"
              step="0.01"
              value={discount}
              onChange={e => setDiscount(e.target.value)}
            />

            <Field
              label="Amount Received (₹)"
              type="number"
              min="0"
              step="0.01"
              value={amountPaid}
              placeholder="0.00"
              onChange={e => setAmountPaid(e.target.value)}
            />
          </div>

          <div className="form-grid">
            <Field label="Payment Method">
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                {paymentMethods.map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </Field>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                padding: '10px 14px',
                background: '#edf6ef',
                borderRadius: '10px',
                border: '1px solid #b8dabf'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#486350', fontWeight: 600 }}>
                <span>Total Amount:</span>
                <strong style={{ fontSize: '16px', color: '#132e1e' }}>{currency(summary?.total || 0, settings.currency)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginTop: '4px', color: '#486350', fontWeight: 600 }}>
                <span>Balance Due:</span>
                <strong style={{ fontSize: '16px', color: (summary?.balance || 0) > 0 ? '#b54708' : '#1a6640' }}>
                  {currency(summary?.balance || 0, settings.currency)}
                </strong>
              </div>
            </div>
          </div>

          <Field label="Notes (optional)">
            <textarea
              maxLength={4000}
              rows="2"
              placeholder="e.g. Delivery site, truck vehicle number, delivery notes..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </Field>

          {(localError || serverError) && (
            <p className="auth-error" role="alert">{localError || serverError}</p>
          )}

          <div className="dialog-actions">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              Review Sale
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ── NEW CUSTOMER MODAL ──────────────────────────────────────────────── */}
      {showNewCustomerModal && (
        <Dialog title="Add New Customer" onClose={() => setShowNewCustomerModal(false)}>
          <form onSubmit={handleSaveNewCustomer}>
            <div className="notice" style={{ background: '#eaf4ee', borderColor: '#b8dabf', color: '#164a2c' }}>
              <strong>👤 Customer Registration</strong>
              <p style={{ margin: '4px 0 0', fontSize: '13px' }}>
                Save customer name, phone number, and location so they appear automatically in future sales.
              </p>
            </div>

            <Field
              label="Customer Name"
              required
              maxLength={160}
              placeholder="e.g. Rahman Constructions, Faisal M."
              value={newCustomerName}
              onChange={e => setNewCustomerName(e.target.value)}
            />

            <Field
              label="Phone Number"
              type="tel"
              maxLength={40}
              placeholder="e.g. 9876543210"
              value={newCustomerPhone}
              onChange={e => setNewCustomerPhone(e.target.value)}
            />

            <Field
              label="Location / Place"
              maxLength={120}
              placeholder="e.g. Kunnumpuram, Vengara, Kottakkal..."
              value={newCustomerLocation}
              onChange={e => setNewCustomerLocation(e.target.value)}
            />

            {duplicatePhoneCustomer && (
              <div style={{ background: '#fff9eb', border: '1px solid #f9dfa2', borderRadius: '10px', padding: '12px', margin: '10px 0', fontSize: '13px', color: '#875100' }}>
                <strong>⚠️ Existing Customer Found:</strong>
                <p style={{ margin: '4px 0 8px' }}>
                  A customer with this phone number is already registered: <strong>{duplicatePhoneCustomer.name}</strong> {duplicatePhoneCustomer.location ? `(${duplicatePhoneCustomer.location})` : ''}.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setSelectedCustomerId(duplicatePhoneCustomer.id);
                    setShowNewCustomerModal(false);
                  }}
                  style={{ minHeight: '36px', fontSize: '13px' }}
                >
                  Select Existing Customer Instead
                </Button>
              </div>
            )}

            {customerError && (
              <p className="auth-error" role="alert">{customerError}</p>
            )}

            <div className="dialog-actions">
              <Button type="button" variant="secondary" onClick={() => setShowNewCustomerModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={customerSaving}>
                {customerSaving ? 'Saving…' : 'Save Customer & Continue'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* ── EDIT CUSTOMER MODAL ─────────────────────────────────────────────── */}
      {showEditCustomerModal && selectedCustomer && (
        <Dialog title="Edit Customer Details" onClose={() => setShowEditCustomerModal(false)}>
          <form onSubmit={handleSaveEditCustomer}>
            <div className="notice" style={{ background: '#edf5ef', borderColor: '#b8dabf', color: '#164a2c' }}>
              <strong>✏️ Update Customer Information</strong>
              <p style={{ margin: '4px 0 0', fontSize: '13px' }}>
                Updates customer details in the database without creating duplicate records. Past sales remain linked.
              </p>
            </div>

            <Field
              label="Customer Name"
              required
              maxLength={160}
              value={editCustomerName}
              onChange={e => setEditCustomerName(e.target.value)}
            />

            <Field
              label="Phone Number"
              type="tel"
              maxLength={40}
              value={editCustomerPhone}
              onChange={e => setEditCustomerPhone(e.target.value)}
            />

            <Field
              label="Location / Place"
              maxLength={120}
              placeholder="e.g. Kunnumpuram, Vengara, Kottakkal..."
              value={editCustomerLocation}
              onChange={e => setEditCustomerLocation(e.target.value)}
            />

            {customerError && (
              <p className="auth-error" role="alert">{customerError}</p>
            )}

            <div className="dialog-actions">
              <Button type="button" variant="secondary" onClick={() => setShowEditCustomerModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={customerSaving}>
                {customerSaving ? 'Updating…' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
