import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, UserPlus, Edit3, MapPin, Phone, User, Plus, Trash2, CheckCircle2, AlertCircle, X, ChevronDown } from 'lucide-react';
import { Button, Field, Dialog, Badge } from '../components';
import { today, currency } from './api';
import { totals } from './calculations';
import { supabase } from '../lib/supabase';
import { formatSaleNotesWithLocations, parseDeliveryLocations } from './locationHelpers';

const paymentMethods = [
  ['cash', 'Cash'],
  ['bank_transfer', 'Bank transfer'],
  ['upi', 'UPI / GPay / PhonePe'],
  ['card', 'Card'],
  ['other', 'Other']
];

function sortCustomersLatestFirst(list) {
  return [...list].sort((a, b) => {
    // 1. Newly created in current session always at the very top
    if (a._isNewlyCreated && !b._isNewlyCreated) return -1;
    if (!a._isNewlyCreated && b._isNewlyCreated) return 1;

    // 2. Sort by created_at DESC (latest first)
    if (a.created_at && b.created_at) {
      const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (!isNaN(diff) && diff !== 0) return diff;
    }
    if (a.created_at && !b.created_at) return -1;
    if (!a.created_at && b.created_at) return 1;

    // 3. Fallback: alphabetical by name
    return (a.name || '').localeCompare(b.name || '');
  });
}

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

  // Live customers list state — initialized from catalog and sorted latest created first
  const [customerList, setCustomerList] = useState(() => {
    return sortCustomersLatestFirst(catalog.customers || []);
  });

  // Toggle for showing inactive customers
  const [showInactive, setShowInactive] = useState(false);

  // Inactive count
  const inactiveCount = useMemo(() => {
    return customerList.filter(c => c.is_active === false).length;
  }, [customerList]);

  // Re-sync if catalog updates in background without discarding session-created customers
  useEffect(() => {
    if (catalog.customers && catalog.customers.length > 0) {
      setCustomerList(prev => {
        const newlyCreated = prev.filter(c => c._isNewlyCreated);
        const serverIds = new Set((catalog.customers || []).map(c => c.id));
        const retained = newlyCreated.filter(n => !serverIds.has(n.id));
        return sortCustomersLatestFirst([...retained, ...(catalog.customers || [])]);
      });
    }
  }, [catalog.customers]);

  // Also query directly on open to make sure any recently added customers are immediately present
  useEffect(() => {
    let alive = true;
    async function loadCustomers() {
      try {
        let { data, error } = await supabase
          .from('customers')
          .select('*')
          .order('created_at', { ascending: false });

        if (error && error.message && error.message.includes('created_at')) {
          const res = await supabase
            .from('customers')
            .select('*');
          data = res.data;
          error = res.error;
        }

        if (alive && data && !error) {
          setCustomerList(prev => {
            const newlyCreated = prev.filter(c => c._isNewlyCreated);
            const serverIds = new Set(data.map(c => c.id));
            const retained = newlyCreated.filter(n => !serverIds.has(n.id));
            return sortCustomersLatestFirst([...retained, ...data]);
          });
          if (catalog) {
            catalog.customers = data;
          }
        }
      } catch (err) {
        // Silently preserve existing list
      }
    }
    loadCustomers();
    return () => { alive = false; };
  }, []);

  // Form State
  const isEditMode = Boolean(initial?.isEditMode);
  const [date, setDate] = useState(() => initial.date || today(settings.timezone));
  const [selectedCustomerId, setSelectedCustomerId] = useState(() => {
    if (initial.contact_id) return initial.contact_id;
    if (initial.customer_id) return initial.customer_id;
    if (initial.customer_name || initial.customerName) {
      const match = (catalog.customers || []).find(
        c => (c.name || '').toLowerCase() === (initial.customer_name || initial.customerName).toLowerCase()
      );
      if (match) return match.id;
    }
    return '';
  });
  
  // Customer Search & Picker state
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowCustomerDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  // Delete / Deactivate Customer State
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteChecking, setDeleteChecking] = useState(false);
  const [deleteSalesCount, setDeleteSalesCount] = useState(0);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

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

  // Currently selected customer object
  const selectedCustomer = useMemo(() => {
    return customerList.find(c => c.id === selectedCustomerId) || null;
  }, [customerList, selectedCustomerId]);

  // Filtered customers for search (always latest created first; hide inactive unless toggled)
  const filteredCustomers = useMemo(() => {
    const listToFilter = showInactive ? customerList : customerList.filter(c => c.is_active !== false);
    const sorted = sortCustomersLatestFirst(listToFilter);
    const q = customerSearch.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(c => {
      const name = (c.name || '').toLowerCase();
      const phone = (c.phone || '').toLowerCase();
      const loc = (c.location || c.place || c.address || '').toLowerCase();
      return name.includes(q) || phone.includes(q) || loc.includes(q);
    });
  }, [customerList, customerSearch, showInactive]);

  // Check for duplicate phone when creating new customer
  const duplicatePhoneCustomer = useMemo(() => {
    const p = newCustomerPhone.trim();
    if (!p || p.length < 5) return null;
    return customerList.find(c => c.phone && c.phone.trim() === p);
  }, [customerList, newCustomerPhone]);

  // Review & errors
  const [review, setReview] = useState(null);
  const [localError, setLocalError] = useState('');

  // Delivery Locations (Optional for baseline sale; multiple locations expandable in edit/multi-site)
  const [deliveryLocation, setDeliveryLocation] = useState(() => initial.deliveryLocation || initial.customerLocation || '');
  const [extraLocations, setExtraLocations] = useState(() => {
    if (initial.extraLocations && Array.isArray(initial.extraLocations)) {
      return initial.extraLocations.map(loc => ({
        id: loc.id || crypto.randomUUID(),
        location: loc.location || '',
        product_id: loc.product_id || '',
        quantity: loc.quantity != null ? String(loc.quantity) : '',
        price: loc.price != null ? String(loc.price) : ''
      }));
    }
    return [];
  });

  // When customer changes, if no custom delivery location entered yet, default to customer's place
  useEffect(() => {
    if (selectedCustomer && !deliveryLocation) {
      const loc = selectedCustomer.location || selectedCustomer.place || selectedCustomer.address || '';
      if (loc) setDeliveryLocation(loc);
    }
  }, [selectedCustomer]);

  function handleAddLocation() {
    const firstBrick = availableBricks[0];
    setExtraLocations(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        location: '',
        product_id: firstBrick?.id || '',
        quantity: '',
        price: firstBrick ? String(firstBrick.selling_price || '0') : ''
      }
    ]);
  }

  function handleRemoveLocation(index) {
    setExtraLocations(prev => prev.filter((_, i) => i !== index));
  }

  function updateExtraLocation(index, key, val) {
    setExtraLocations(prev => prev.map((loc, i) => {
      if (i !== index) return loc;
      const updated = { ...loc, [key]: val };
      if (key === 'product_id') {
        const prod = availableBricks.find(p => p.id === val);
        if (prod && !loc.price) {
          updated.price = String(prod.selling_price || '0');
        }
      }
      return updated;
    }));
  }

  // Combined items for calculation and total verification
  const allFormItems = useMemo(() => {
    const list = [...items];
    extraLocations.forEach(loc => {
      if (loc.product_id && (Number(loc.quantity) > 0 || loc.quantity === '')) {
        list.push({
          product_id: loc.product_id,
          quantity: loc.quantity,
          price: loc.price,
          _location: loc.location
        });
      }
    });
    return list;
  }, [items, extraLocations]);

  // Calculations
  const summary = useMemo(() => {
    return totals(allFormItems, discount || '0', amountPaid || '0');
  }, [allFormItems, discount, amountPaid]);

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
    const trimmedName = newCustomerName.trim();
    const trimmedPhone = newCustomerPhone.trim();
    const trimmedLocation = newCustomerLocation.trim();

    if (!trimmedName) {
      setCustomerError('Customer name is required.');
      return;
    }
    setCustomerSaving(true);
    setCustomerError('');

    const newId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const insertPayload = {
      id: newId,
      name: trimmedName,
      phone: trimmedPhone,
      location: trimmedLocation,
      is_active: true
    };

    try {
      let savedRecord = null;

      // 1. Insert into Supabase customers table and fetch the database row
      const { data, error } = await supabase
        .from('customers')
        .insert(insertPayload)
        .select()
        .single();

      if (!error && data) {
        savedRecord = {
          ...data,
          location: data.location || trimmedLocation,
          created_at: data.created_at || nowIso,
          _isNewlyCreated: true
        };
      } else {
        // If error indicates location column issue in PostgreSQL
        if (error?.message && error.message.includes('location')) {
          const fallbackPayload = {
            id: newId,
            name: trimmedName,
            phone: trimmedPhone,
            is_active: true
          };
          const { data: fbData, error: fbErr } = await supabase
            .from('customers')
            .insert(fallbackPayload)
            .select()
            .single();

          if (!fbErr && fbData) {
            savedRecord = {
              ...fbData,
              location: trimmedLocation,
              created_at: fbData.created_at || nowIso,
              _isNewlyCreated: true
            };
          } else {
            // Try insert without .select()
            const { error: fbErr2 } = await supabase.from('customers').insert(fallbackPayload);
            if (fbErr2) throw fbErr2;
            savedRecord = {
              ...fallbackPayload,
              location: trimmedLocation,
              created_at: nowIso,
              _isNewlyCreated: true
            };
          }
        } else {
          // If .select() failed (e.g. RETURNING policy restricted), insert without .select()
          const { error: plainErr } = await supabase.from('customers').insert(insertPayload);
          if (plainErr) throw plainErr;
          savedRecord = {
            ...insertPayload,
            created_at: nowIso,
            _isNewlyCreated: true
          };
        }
      }

      if (!savedRecord || !savedRecord.id) {
        throw new Error('Customer could not be created in database.');
      }

      // Automatically update state, select new customer, and close modal
      completeCustomerSave(savedRecord);
    } catch (err) {
      console.error('Customer save error:', err);
      setCustomerError(err.message || 'Unable to save customer to database.');
    } finally {
      setCustomerSaving(false);
    }
  }

  function completeCustomerSave(customerObj) {
    // 1. Immediately prepend customer to customerList state at the TOP of the list
    setCustomerList(prev => {
      const filtered = prev.filter(c => c.id !== customerObj.id);
      return [{ ...customerObj, _isNewlyCreated: true }, ...filtered];
    });

    // 2. Add to catalog.customers reference at the top
    if (catalog?.customers) {
      catalog.customers = [customerObj, ...catalog.customers.filter(c => c.id !== customerObj.id)];
    }

    // 3. AUTOMATICALLY SELECT THE NEW CUSTOMER BY DATABASE ID!
    setSelectedCustomerId(customerObj.id);

    // 4. Reset search query and close dropdown
    setCustomerSearch('');
    setShowCustomerDropdown(false);

    // 5. AUTOMATICALLY CLOSE the Add New Customer modal!
    setShowNewCustomerModal(false);

    // 6. Notify parent component to update its customer list
    if (onCustomerUpdate) {
      onCustomerUpdate(customerObj);
    }
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

      if (!error && data) {
        completeCustomerEdit({ ...selectedCustomer, ...data });
      } else {
        if (error?.message && error.message.includes('location')) {
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

          if (!fbErr && fbData) {
            completeCustomerEdit({ ...selectedCustomer, ...fbData, location: editCustomerLocation.trim() });
            return;
          }
        }

        // Try update without .select()
        const { error: plainErr } = await supabase
          .from('customers')
          .update(updatePayload)
          .eq('id', selectedCustomer.id);

        if (plainErr) throw plainErr;
        completeCustomerEdit({ ...selectedCustomer, ...updatePayload });
      }
    } catch (err) {
      console.error('Customer update error:', err);
      setCustomerError(err.message || 'Unable to update customer.');
    } finally {
      setCustomerSaving(false);
    }
  }

  function completeCustomerEdit(updatedObj) {
    setCustomerList(prev => prev.map(c => c.id === updatedObj.id ? { ...c, ...updatedObj } : c));
    if (catalog?.customers) {
      catalog.customers = catalog.customers.map(c => c.id === updatedObj.id ? { ...c, ...updatedObj } : c);
    }
    setShowEditCustomerModal(false);
    if (onCustomerUpdate) {
      onCustomerUpdate(updatedObj);
    }
  }

  // ── DELETE & DEACTIVATE CUSTOMER HANDLERS ─────────────────────────────────
  async function handlePromptDelete(customer) {
    if (!customer) return;
    setDeleteTarget(customer);
    setDeleteChecking(true);
    setDeleteSalesCount(0);
    setDeleteError('');
    setDeleteBusy(false);

    try {
      let salesCount = 0;
      // 1. Check sales_history
      const { count: hCount, error: hErr } = await supabase
        .from('sales_history')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', customer.id);

      if (!hErr && typeof hCount === 'number') {
        salesCount = hCount;
      }

      // 2. Also check sales table directly if sales_history returned 0 or errored
      if (salesCount === 0) {
        const { count: sCount, error: sErr } = await supabase
          .from('sales')
          .select('id', { count: 'exact', head: true })
          .eq('customer_id', customer.id);
        if (!sErr && typeof sCount === 'number') {
          salesCount = sCount;
        }
      }

      setDeleteSalesCount(salesCount);
    } catch (e) {
      console.error('Error checking sales count:', e);
    } finally {
      setDeleteChecking(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError('');

    try {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', deleteTarget.id);

      if (error) {
        if (error.code === '23503' || (error.message && error.message.includes('foreign key'))) {
          setDeleteSalesCount(1);
          setDeleteError('This customer has existing transactions or receipts and cannot be deleted. Deactivate them instead.');
          return;
        }
        throw error;
      }

      // Permanent delete succeeded
      const targetId = deleteTarget.id;
      setCustomerList(prev => prev.filter(c => c.id !== targetId));
      if (catalog?.customers) {
        catalog.customers = catalog.customers.filter(c => c.id !== targetId);
      }
      if (selectedCustomerId === targetId) {
        setSelectedCustomerId('');
      }
      if (onCustomerUpdate) {
        onCustomerUpdate({ id: targetId, _deleted: true });
      }
      setDeleteTarget(null);
    } catch (err) {
      console.error('Customer delete error:', err);
      setDeleteError(err.message || 'Unable to delete customer. If foreign key constraint blocks deletion, you can deactivate them.');
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleConfirmDeactivate() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError('');

    try {
      const { error } = await supabase
        .from('customers')
        .update({ is_active: false })
        .eq('id', deleteTarget.id);

      if (error) throw error;

      // Deactivation succeeded
      const targetId = deleteTarget.id;
      setCustomerList(prev => prev.map(c => c.id === targetId ? { ...c, is_active: false } : c));
      if (catalog?.customers) {
        catalog.customers = catalog.customers.map(c => c.id === targetId ? { ...c, is_active: false } : c);
      }
      if (selectedCustomerId === targetId) {
        setSelectedCustomerId('');
      }
      if (onCustomerUpdate) {
        onCustomerUpdate({ ...deleteTarget, is_active: false });
      }
      setDeleteTarget(null);
    } catch (err) {
      console.error('Customer deactivate error:', err);
      setDeleteError(err.message || 'Unable to deactivate customer.');
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleReactivateCustomer(customer) {
    try {
      const { error } = await supabase
        .from('customers')
        .update({ is_active: true })
        .eq('id', customer.id);

      if (error) throw error;

      // Reactivation succeeded
      setCustomerList(prev => prev.map(c => c.id === customer.id ? { ...c, is_active: true } : c));
      if (catalog?.customers) {
        catalog.customers = catalog.customers.map(c => c.id === customer.id ? { ...c, is_active: true } : c);
      }
      if (onCustomerUpdate) {
        onCustomerUpdate({ ...customer, is_active: true });
      }
      setSelectedCustomerId(customer.id);
      setShowCustomerDropdown(false);
    } catch (err) {
      console.error('Customer reactivate error:', err);
      alert('Unable to reactivate customer: ' + (err.message || 'Error'));
    }
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

    // Validate extra delivery locations
    for (let i = 0; i < extraLocations.length; i++) {
      const loc = extraLocations[i];
      if (!loc.location || !loc.location.trim()) {
        setLocalError(`Please enter a delivery location name for Location #${i + 2}.`);
        return;
      }
      if (!loc.product_id) {
        setLocalError(`Please choose a brick size for Location #${i + 2} (${loc.location}).`);
        return;
      }
      if (!loc.quantity || Number(loc.quantity) <= 0) {
        setLocalError(`Please enter a valid brick quantity for Location #${i + 2} (${loc.location}).`);
        return;
      }
      if (loc.price === '' || Number(loc.price) < 0) {
        setLocalError(`Please enter a valid rate for Location #${i + 2} (${loc.location}).`);
        return;
      }
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
      deliveryLocation: deliveryLocation.trim() || selectedCustomer?.location || selectedCustomer?.place || selectedCustomer?.address || '',
      items,
      extraLocations,
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
    const combinedNotes = formatSaleNotesWithLocations(
      review.notes,
      review.deliveryLocation || review.customerLocation,
      review.extraLocations,
      availableBricks
    );

    // Merge line items by product_id for database storage & stock movements
    const aggregatedMap = {};
    [...review.items, ...(review.extraLocations || [])].forEach(it => {
      if (!it.product_id || Number(it.quantity) <= 0) return;
      if (!aggregatedMap[it.product_id]) {
        aggregatedMap[it.product_id] = {
          product_id: it.product_id,
          quantity: 0,
          price: it.price
        };
      }
      aggregatedMap[it.product_id].quantity += Number(it.quantity);
    });

    const dbItems = Object.values(aggregatedMap).map(it => ({
      product_id: it.product_id,
      quantity: String(it.quantity),
      price: String(it.price)
    }));

    const payload = {
      date: review.date,
      contact_id: isNew ? '' : review.contact_id,
      name: isNew ? review.customerName : (selectedCustomer?.name || review.customerName),
      phone: isNew ? review.customerPhone : (selectedCustomer?.phone || review.customerPhone || ''),
      items: dbItems.length > 0 ? dbItems : review.items,
      discount: review.discount,
      paid: review.paid,
      payment_method: review.payment_method,
      notes: combinedNotes,
      ...(isEditMode ? { saleId: initial.saleId, originalSale: initial.originalSale } : {})
    };
    onSubmit(isEditMode ? 'edit_sale' : 'sale', payload);
  }

  // ── Confirmation Dialog ───────────────────────────────────────────────────
  if (review) {
    return (
      <Dialog title={isEditMode ? `Confirm Update to Bill #${initial.receiptNumber}` : 'Confirm Sale Receipt'} onClose={busy ? () => {} : () => setReview(null)}>
        <div className="notice" style={{ background: isEditMode ? '#fef7ed' : '#eaf4ee', borderColor: isEditMode ? '#fed7aa' : '#b8dabf', color: isEditMode ? '#9a3412' : '#164a2c' }}>
          <strong>{isEditMode ? `✏️ Update Sales Bill #${initial.receiptNumber}` : '📋 Customer Order Confirmation'}</strong>
          <p style={{ margin: '4px 0 0', fontSize: '13px' }}>
            {isEditMode
              ? 'Saving will update this bill in the database, adjust customer balances, and safely update inventory stock movements.'
              : 'Saving this sale will deduct bricks from stock, create a receipt, and update customer balance records.'}
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

          <dt>Delivery & Items</dt>
          <dd>
            {review.deliveryLocation && (
              <div style={{ fontWeight: 700, color: '#1a6640', marginBottom: '4px' }}>
                📍 Location 1: {review.deliveryLocation}
              </div>
            )}
            {review.items.map((it, idx) => {
              const p = availableBricks.find(b => b.id === it.product_id);
              return (
                <div key={idx} style={{ fontSize: '14px', marginBottom: '4px', paddingLeft: review.deliveryLocation ? '10px' : '0' }}>
                  <strong>{it.quantity} bricks</strong> of {p?.name || 'Brick'} @ {currency(it.price, settings.currency)}
                </div>
              );
            })}

            {review.extraLocations && review.extraLocations.length > 0 && review.extraLocations.map((loc, idx) => {
              const p = availableBricks.find(b => b.id === loc.product_id);
              const locTotal = (Number(loc.quantity) || 0) * (Number(loc.price) || 0);
              return (
                <div key={loc.id || idx} style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #d5e6d9' }}>
                  <div style={{ fontWeight: 700, color: '#1a6640', marginBottom: '2px' }}>
                    📍 Location #{idx + 2}: {loc.location}
                  </div>
                  <div style={{ fontSize: '14px', paddingLeft: '10px' }}>
                    <strong>{loc.quantity} bricks</strong> of {p?.name || 'Brick'} @ {currency(loc.price, settings.currency)} = <strong>{currency(locTotal, settings.currency)}</strong>
                  </div>
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
            {busy ? (isEditMode ? 'Updating bill…' : 'Saving sale…') : (isEditMode ? 'Update Bill' : 'Confirm & Save Sale')}
          </Button>
        </div>
      </Dialog>
    );
  }

  // ── Main New Sale Form ────────────────────────────────────────────────────
  return (
    <>
      <Dialog title={isEditMode ? `Edit Sales Bill #${initial.receiptNumber}` : 'New Sale'} onClose={onClose}>
        <form onSubmit={handleReview}>
          <div className="sale-top-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', background: isEditMode ? '#fef9f0' : '#f5f9f6', padding: '10px 14px', borderRadius: '10px', border: isEditMode ? '1.5px solid #ebd5b3' : '1.5px solid #dce8de' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: isEditMode ? '#b54708' : '#1a6640', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {isEditMode ? `✏️ EDIT SALES BILL #${initial.receiptNumber}` : '📄 SALES INVOICE ENTRY'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#4a6252' }}>Sale Date:</span>
              <input
                type="date"
                max={today(settings.timezone)}
                value={date}
                onChange={e => setDate(e.target.value)}
                required
                style={{ padding: '6px 10px', fontSize: '13.5px', minHeight: '36px', width: 'auto', borderRadius: '8px', border: '1.5px solid #c2d4c6' }}
              />
            </div>
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

                <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
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
                    onClick={() => handlePromptDelete(selectedCustomer)}
                    style={{
                      background: '#fff0f0',
                      border: '1px solid #ffd4d4',
                      color: '#c92a2a',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '13px',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      cursor: 'pointer'
                    }}
                    title="Delete customer"
                  >
                    <Trash2 size={14} /> Delete Customer
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSelectedCustomerId(''); setCustomerSearch(''); setShowCustomerDropdown(true); }}
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
              <div ref={dropdownRef} style={{ position: 'relative' }}>
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
                    <div style={{ padding: '8px 12px', borderBottom: '1px solid #edf2ee', background: '#f8faf8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#5a7263' }}>
                          {filteredCustomers.length} customer(s) found
                        </span>
                        {inactiveCount > 0 && (
                          <button
                            type="button"
                            onClick={() => setShowInactive(v => !v)}
                            style={{
                              background: showInactive ? '#edf5ef' : '#f0f3f1',
                              border: '1px solid',
                              borderColor: showInactive ? '#a3cca8' : '#d5ddd7',
                              borderRadius: '6px',
                              padding: '2px 8px',
                              fontSize: '11px',
                              fontWeight: 600,
                              color: showInactive ? '#1a6640' : '#576f5f',
                              cursor: 'pointer'
                            }}
                          >
                            {showInactive ? 'Hide Inactive' : `Show Inactive (${inactiveCount})`}
                          </button>
                        )}
                      </div>
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
                        const isInactive = c.is_active === false;
                        return (
                          <div
                            key={c.id}
                            onClick={() => {
                              if (isInactive) return;
                              setSelectedCustomerId(c.id);
                              setShowCustomerDropdown(false);
                            }}
                            style={{
                              padding: '12px 14px',
                              borderBottom: '1px solid #f0f4f1',
                              cursor: isInactive ? 'default' : 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              background: isInactive ? '#fbfbfb' : '#ffffff',
                              transition: 'background 0.15s'
                            }}
                            onMouseEnter={e => { if (!isInactive) e.currentTarget.style.background = '#f2f8f4'; }}
                            onMouseLeave={e => { if (!isInactive) e.currentTarget.style.background = isInactive ? '#fbfbfb' : '#ffffff'; }}
                          >
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <strong style={{ fontSize: '15px', color: isInactive ? '#738679' : '#132e1e' }}>{c.name}</strong>
                                {isInactive && (
                                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#875100', background: '#fff9eb', border: '1px solid #f9dfa2', padding: '1px 6px', borderRadius: '4px' }}>
                                    Inactive
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', gap: '10px', marginTop: '2px', fontSize: '13px', color: isInactive ? '#8c9c91' : '#567160' }}>
                                {c.phone && <span>📞 {c.phone}</span>}
                                {loc && <span style={{ color: isInactive ? '#668070' : '#1a6640', fontWeight: 600 }}>📍 {loc}</span>}
                              </div>
                            </div>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {isInactive ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleReactivateCustomer(c);
                                  }}
                                  style={{
                                    background: '#eaf4ee',
                                    border: '1px solid #b8dabf',
                                    color: '#1a6640',
                                    borderRadius: '6px',
                                    padding: '4px 10px',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                  }}
                                  title="Reactivate this customer"
                                >
                                  Reactivate
                                </button>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePromptDelete(c);
                                    }}
                                    style={{
                                      background: 'none',
                                      border: 'none',
                                      color: '#93a699',
                                      cursor: 'pointer',
                                      padding: '6px',
                                      borderRadius: '6px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      transition: 'all 0.15s'
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.color = '#c92a2a'; e.currentTarget.style.background = '#ffebeb'; }}
                                    onMouseLeave={e => { e.currentTarget.style.color = '#93a699'; e.currentTarget.style.background = 'none'; }}
                                    title={`Delete ${c.name}`}
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                  <span style={{ fontSize: '13px', color: '#1a6640', fontWeight: 600 }}>Select →</span>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── OPTIONAL DELIVERY LOCATION ────────────────────────────────────── */}
          <div style={{ margin: '14px 0 16px' }}>
            <Field label="Delivery Location (Optional)">
              <input
                type="text"
                placeholder={selectedCustomer?.location ? `Defaults to: ${selectedCustomer.location}` : "e.g. Site 1, Kunnumpuram (defaults to customer place)"}
                value={deliveryLocation}
                onChange={e => setDeliveryLocation(e.target.value)}
                style={{ minHeight: '40px', fontSize: '14px' }}
              />
            </Field>
          </div>

          {/* ── FINISHED BRICKS SELECTION ─────────────────────────────────────── */}
          <div style={{ margin: '18px 0 10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#132e1e', margin: 0 }}>
                Brick Items & Quantities
              </h3>
              <span style={{ fontSize: '12px', color: '#567160', fontWeight: 600 }}>
                {items.length} line(s) added
              </span>
            </div>

            <div className="entry-items" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {items.map((item, idx) => {
                const prod = availableBricks.find(b => b.id === item.product_id);
                const lineTotal = (Number(item.quantity) || 0) * (Number(item.price) || 0);
                return (
                  <div className="entry-item" key={idx} style={{ padding: '14px', borderRadius: '12px', border: '1.5px solid #dce8de', background: '#fafdfa' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#254430' }}>
                        Item #{idx + 1}
                      </span>
                      {items.length > 1 && (
                        <button
                          type="button"
                          className="icon-button"
                          aria-label="Remove item"
                          onClick={() => removeItem(idx)}
                          style={{ color: '#b42318', padding: '4px', background: '#fff0ed', borderRadius: '6px', border: '1px solid #ffd4cc' }}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>

                    <Field label="Brick Size">
                      <select
                        value={item.product_id}
                        required
                        onChange={e => updateItem(idx, 'product_id', e.target.value)}
                        style={{ minHeight: '40px', fontSize: '14px' }}
                      >
                        <option value="">Choose brick size</option>
                        {availableBricks.map(b => (
                          <option key={b.id} value={b.id}>
                            {b.name} · {b.code} (In stock: {b.available_quantity || 0})
                          </option>
                        ))}
                      </select>
                    </Field>

                    <div className="form-grid" style={{ marginTop: '10px', gap: '12px' }}>
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

                    <div className="line-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', borderTop: '1px dashed #e2ede4', paddingTop: '8px' }}>
                      <small style={{ color: '#4a6252', fontSize: '12.5px' }}>
                        {prod ? `Yard stock: ${prod.available_quantity || 0} bricks` : 'Select a brick size'}
                      </small>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#1a6640' }}>
                        Line total: {currency(lineTotal, settings.currency)}
                      </div>
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
              style={{ minHeight: '40px', width: '100%', justifyContent: 'center', marginTop: '8px', fontSize: '13.5px' }}
            >
              <Plus size={15} /> Add Another Brick Size
            </Button>
          </div>

          {/* ── MULTIPLE DELIVERY LOCATIONS (Available in Edit Bill) ──────────── */}
          {isEditMode && (
            <div style={{ margin: '22px 0 16px', borderTop: '2px dashed #b8dabf', paddingTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#132e1e', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={16} color="#1a6640" /> Multiple Delivery Locations
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: '#567160' }}>
                    Deliver to separate locations under this bill.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleAddLocation}
                  style={{ fontSize: '13px', padding: '6px 14px', minHeight: '34px', borderColor: '#1a6640', color: '#1a6640', background: '#edf5ef' }}
                >
                  <Plus size={15} /> + Add Another Location
                </Button>
              </div>

              {extraLocations.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '14px' }}>
                  {extraLocations.map((loc, idx) => {
                    const locAmount = (Number(loc.quantity) || 0) * (Number(loc.price) || 0);
                    return (
                      <div
                        key={loc.id || idx}
                        style={{
                          background: '#f4f9f5',
                          border: '1.5px solid #cce2d2',
                          borderRadius: '12px',
                          padding: '14px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: '#1a6640', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <MapPin size={14} /> Location #{idx + 2} {loc.location ? `· ${loc.location}` : ''}
                          </span>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label="Remove Location"
                            onClick={() => handleRemoveLocation(idx)}
                            style={{ color: '#b42318', padding: '4px 8px', background: '#fff0ed', borderRadius: '6px', border: '1px solid #ffd4cc', cursor: 'pointer', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            title="Remove this location"
                          >
                            <Trash2 size={13} /> Remove
                          </button>
                        </div>

                        <div className="form-grid" style={{ gap: '10px', marginBottom: '10px' }}>
                          <Field label="Delivery Location">
                            <input
                              type="text"
                              required
                              placeholder="e.g. Vengara, Tirur..."
                              value={loc.location}
                              onChange={e => updateExtraLocation(idx, 'location', e.target.value)}
                              style={{ minHeight: '38px', fontSize: '13.5px' }}
                            />
                          </Field>

                          <Field label="Brick Size">
                            <select
                              value={loc.product_id}
                              required
                              onChange={e => updateExtraLocation(idx, 'product_id', e.target.value)}
                              style={{ minHeight: '38px', fontSize: '13.5px' }}
                            >
                              <option value="">Choose brick size</option>
                              {availableBricks.map(b => (
                                <option key={b.id} value={b.id}>
                                  {b.name} · {b.code} (In stock: {b.available_quantity || 0})
                                </option>
                              ))}
                            </select>
                          </Field>
                        </div>

                        <div className="form-grid" style={{ gap: '10px' }}>
                          <Field label="Quantity (Bricks)">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              placeholder="e.g. 500"
                              required
                              value={loc.quantity}
                              onChange={e => updateExtraLocation(idx, 'quantity', e.target.value)}
                              style={{ minHeight: '38px', fontSize: '13.5px' }}
                            />
                          </Field>

                          <Field label="Rate (₹)">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="e.g. 35"
                              required
                              value={loc.price}
                              onChange={e => updateExtraLocation(idx, 'price', e.target.value)}
                              style={{ minHeight: '38px', fontSize: '13.5px' }}
                            />
                          </Field>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px', borderTop: '1px dashed #d5e6d9', paddingTop: '8px' }}>
                          <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#1a6640' }}>
                            Amount: {currency(locAmount, settings.currency)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── PAYMENT & TOTALS ────────────────────────────────────────────── */}
          <div style={{ margin: '18px 0 10px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#132e1e', marginBottom: '10px' }}>
              Payment Details
            </h3>

            <div className="form-grid" style={{ gap: '12px', margin: '0 0 12px' }}>
              <Field
                label="Discount (₹)"
                type="number"
                min="0"
                step="0.01"
                value={discount}
                placeholder="0.00"
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

            <Field label="Payment Method">
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={{ minHeight: '40px' }}>
                {paymentMethods.map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </Field>

            {/* Premium Billing Summary Box */}
            <div
              className="sale-billing-summary"
              style={{
                marginTop: '14px',
                background: 'linear-gradient(135deg, #f4f9f5 0%, #edf6ef 100%)',
                borderRadius: '12px',
                border: '1.5px solid #b8dabf',
                padding: '16px 18px',
                boxShadow: '0 2px 8px rgba(26,102,64,0.06)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #d5e6d8', paddingBottom: '8px', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#254430', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  Billing Breakdown
                </span>
                <span style={{ fontSize: '12px', color: '#4a6955', fontWeight: 600 }}>
                  {items.reduce((s, i) => s + (Number(i.quantity) || 0), 0).toLocaleString()} bricks total
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '11.5px', color: '#526e5a', fontWeight: 600, display: 'block' }}>Subtotal</span>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: '#132e1e' }}>
                    {currency(summary?.subtotal || 0, settings.currency)}
                  </span>
                </div>

                {Number(discount) > 0 && (
                  <div>
                    <span style={{ fontSize: '11.5px', color: '#b54708', fontWeight: 600, display: 'block' }}>Discount</span>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: '#b54708' }}>
                      −{currency(discount, settings.currency)}
                    </span>
                  </div>
                )}

                <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #a3cca8' }}>
                  <span style={{ fontSize: '11.5px', color: '#1a6640', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block' }}>
                    Grand Total
                  </span>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: '#1a6640' }}>
                    {currency(summary?.total || 0, settings.currency)}
                  </span>
                </div>

                <div>
                  <span style={{ fontSize: '11.5px', color: '#526e5a', fontWeight: 600, display: 'block' }}>Paid Amount</span>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: '#132e1e' }}>
                    {currency(amountPaid || 0, settings.currency)}
                  </span>
                </div>

                <div>
                  <span style={{ fontSize: '11.5px', color: '#526e5a', fontWeight: 600, display: 'block' }}>Balance Due</span>
                  <span style={{ fontSize: '16px', fontWeight: 700, color: (summary?.balance || 0) > 0 ? '#b54708' : '#1a6640' }}>
                    {currency(summary?.balance || 0, settings.currency)}
                  </span>
                </div>
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
              {isEditMode ? 'Update Bill' : 'Review Sale'}
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

      {/* ── DELETE / DEACTIVATE CUSTOMER CONFIRMATION MODAL ────────────────── */}
      {deleteTarget && (
        <Dialog title="Delete Customer" onClose={deleteBusy ? () => {} : () => setDeleteTarget(null)}>
          {deleteChecking ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: '#526e5a' }}>
              <p style={{ margin: 0, fontSize: '15px' }}>Checking sales history for this customer…</p>
            </div>
          ) : deleteSalesCount > 0 ? (
            <div>
              <div className="notice" style={{ background: '#fff9eb', borderColor: '#f9dfa2', color: '#875100' }}>
                <strong>⚠️ Existing Sales Found ({deleteSalesCount} sale{deleteSalesCount > 1 ? 's' : ''})</strong>
                <p style={{ margin: '4px 0 0', fontSize: '13px' }}>
                  This customer has existing sales records and cannot be deleted. Deactivating this customer will preserve all previous sales records while hiding them from future sale searches.
                </p>
              </div>

              <div style={{ background: '#f8faf8', border: '1px solid #dce8de', borderRadius: '10px', padding: '14px', margin: '14px 0' }}>
                <strong style={{ fontSize: '16px', color: '#132e1e' }}>{deleteTarget.name}</strong>
                <div style={{ fontSize: '13px', color: '#556e5d', marginTop: '4px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {deleteTarget.phone && <span>📞 {deleteTarget.phone}</span>}
                  {(deleteTarget.location || deleteTarget.place || deleteTarget.address) && (
                    <span style={{ color: '#1a6640', fontWeight: 600 }}>📍 {deleteTarget.location || deleteTarget.place || deleteTarget.address}</span>
                  )}
                </div>
              </div>

              {deleteError && <p className="auth-error" role="alert">{deleteError}</p>}

              <div className="dialog-actions">
                <Button type="button" variant="secondary" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}>
                  Cancel
                </Button>
                <Button type="button" disabled={deleteBusy} onClick={handleConfirmDeactivate}>
                  {deleteBusy ? 'Deactivating…' : 'Deactivate Customer'}
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <div className="notice" style={{ background: '#fff0f0', borderColor: '#ffd4d4', color: '#c92a2a' }}>
                <strong>🗑️ Confirm Customer Deletion</strong>
                <p style={{ margin: '4px 0 0', fontSize: '13px' }}>
                  Are you sure you want to delete this customer? This action cannot be undone.
                </p>
              </div>

              <div style={{ background: '#f8faf8', border: '1px solid #dce8de', borderRadius: '10px', padding: '14px', margin: '14px 0' }}>
                <strong style={{ fontSize: '16px', color: '#132e1e' }}>{deleteTarget.name}</strong>
                <div style={{ fontSize: '13px', color: '#556e5d', marginTop: '4px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {deleteTarget.phone && <span>📞 {deleteTarget.phone}</span>}
                  {(deleteTarget.location || deleteTarget.place || deleteTarget.address) && (
                    <span style={{ color: '#1a6640', fontWeight: 600 }}>📍 {deleteTarget.location || deleteTarget.place || deleteTarget.address}</span>
                  )}
                </div>
                <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#2e6945', fontWeight: 600 }}>
                  ✓ Verified: This customer has no sales history and can be permanently deleted.
                </p>
              </div>

              {deleteError && <p className="auth-error" role="alert">{deleteError}</p>}

              <div className="dialog-actions">
                <Button type="button" variant="secondary" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}>
                  Cancel
                </Button>
                <Button type="button" className="delete-action" disabled={deleteBusy} onClick={handleConfirmDelete}>
                  {deleteBusy ? 'Deleting…' : 'Delete Customer'}
                </Button>
              </div>
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}
