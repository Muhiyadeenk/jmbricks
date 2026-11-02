import React, { useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Printer, Download, MapPin, Phone, Calendar, FileText, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { Button } from '../components';
import { currency } from './api';

// Helper to convert Indian Rupees numbers into Words
function numberToWordsINR(amount) {
  const num = Math.round(Number(amount) || 0);
  if (num === 0) return 'Zero Rupees Only';

  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function inWords(n) {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + inWords(n % 100) : '');
    if (n < 100000) return inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + inWords(n % 1000) : '');
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + inWords(n % 100000) : '');
    return inWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + inWords(n % 10000000) : '');
  }

  return inWords(num) + ' Rupees Only';
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '—';
  try {
    const parts = String(dateStr).split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      const d = new Date(year, month - 1, day);
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  } catch (e) {
    // fallback
  }
  return dateStr;
}

export default function SalesInvoice({
  record = {},
  items = [],
  payments = [],
  catalog = {},
  settings = {},
  previousBalance = 0,
  onPrint,
  onDownloadPdf
}) {
  const currencyCode = record.currency || settings.currency || 'INR';

  // Customer details resolution
  const customer = useMemo(() => {
    return catalog?.customers?.find(c => c.id === record.customer_id || c.name === record.customer_name);
  }, [catalog, record]);

  const customerName = record.customer_name || customer?.name || 'Cash Customer';
  const customerPhone = record.customer_phone || customer?.phone || '';
  const customerLocation = record.customer_location || customer?.location || customer?.place || customer?.address || '';

  // Calculate items summary
  const subtotal = record.subtotal != null ? Number(record.subtotal) : items.reduce((sum, it) => {
    const rate = Number(it.unit_price ?? it.unit_cost ?? 0);
    const qty = Number(it.quantity || 0);
    return sum + (it.line_total != null ? Number(it.line_total) : qty * rate);
  }, 0);

  const discount = Number(record.discount || 0);
  const grandTotal = Number(record.total ?? (subtotal - discount));
  const amountPaid = Number(record.amount_received ?? record.amount_paid ?? 0);
  const outstanding = Number(record.outstanding_balance ?? Math.max(0, grandTotal - amountPaid));
  const prevBal = Number(previousBalance || 0);
  const totalDue = prevBal + outstanding;

  // Payment status
  const isPaid = outstanding <= 0 && grandTotal > 0;
  const isPartial = outstanding > 0 && amountPaid > 0;
  const isUnpaid = amountPaid <= 0 && grandTotal > 0;

  // Manage print class for perfect top-aligned A4 output
  useEffect(() => {
    function handleBeforePrint() {
      document.body.classList.add('is-printing-invoice');
    }
    function handleAfterPrint() {
      document.body.classList.remove('is-printing-invoice');
    }
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('is-printing-invoice');
    };
  }, []);

  // Print handlers
  function handlePrintAction() {
    const originalTitle = document.title;
    document.title = '';
    document.body.classList.add('is-printing-invoice');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('is-printing-invoice');
      document.title = originalTitle;
    }, 500);
  }

  const invoiceSheetProps = {
    record,
    items,
    payments,
    catalog,
    settings,
    customerName,
    customerPhone,
    customerLocation,
    currencyCode,
    subtotal,
    discount,
    grandTotal,
    amountPaid,
    outstanding,
    prevBal,
    totalDue,
    isPaid,
    isPartial,
    isUnpaid,
  };

  return (
    <>
      <div className="a4-invoice-wrapper">
        {/* ── TOP ACTION BAR (Hidden during print) ─────────────────────────── */}
        <div className="a4-invoice-actions no-print">
          <div className="a4-invoice-actions-left">
            <span className="invoice-tag">PREVIEW · A4 INVOICE</span>
            <span className="invoice-badge">
              {isPaid ? '✓ PAID' : isPartial ? '⏳ PARTIALLY PAID' : '⚠️ UNPAID'}
            </span>
          </div>
          <div className="a4-invoice-actions-right">
            <Button variant="secondary" onClick={handlePrintAction} title="Download or Save as PDF">
              <Download size={16} /> Download PDF
            </Button>
            <Button onClick={handlePrintAction} title="Print Invoice">
              <Printer size={16} /> Print Invoice
            </Button>
          </div>
        </div>

        {/* ── SCREEN PREVIEW A4 INVOICE SHEET ─────────────────────────────── */}
        <InvoiceSheet {...invoiceSheetProps} />
      </div>

      {/* ── ISOLATED PRINT PORTAL (Attached directly to document.body) ───── */}
      {typeof document !== 'undefined' && createPortal(
        <div id="jm-invoice-print-portal" aria-hidden="true">
          <InvoiceSheet {...invoiceSheetProps} isPrintPortal />
        </div>,
        document.body
      )}
    </>
  );
}

// Reusable Invoice Sheet Component
function InvoiceSheet({
  record,
  items,
  payments,
  catalog,
  settings,
  customerName,
  customerPhone,
  customerLocation,
  currencyCode,
  subtotal,
  discount,
  grandTotal,
  amountPaid,
  outstanding,
  prevBal,
  totalDue,
  isPaid,
  isPartial,
  isUnpaid,
  isPrintPortal = false
}) {
  return (
    <div className={`a4-invoice-container ${isPrintPortal ? 'print-portal-container' : ''}`}>
      {/* COMPANY HEADER */}
      <div className="invoice-header">
        <div className="invoice-brand">
          <img
            src="/jm-bricks-logo.png"
            alt="JM HOLLO BRICKS Logo"
            className="invoice-logo"
          />
          <div className="invoice-brand-text">
            <h1 className="company-title">JM HOLLO BRICKS</h1>
            <p className="company-tagline">Quality Hollow Bricks & Cement Blocks Manufacturers</p>
            <div className="company-contacts">
              <span><strong>Mobile:</strong> 9446663786 | 97407495127 | 1306147395</span>
              {settings.business_address && (
                <span> · {settings.business_address}</span>
              )}
            </div>
          </div>
        </div>
        <div className="invoice-title-block">
          <span className="tax-invoice-label">TAX INVOICE</span>
          <div className="invoice-number-box">
            <span className="inv-label">INVOICE NO</span>
            <strong className="inv-val">S-{record.receipt_number || record.id?.slice(0, 8)}</strong>
          </div>
        </div>
      </div>

      <div className="invoice-divider" />

      {/* INVOICE & CUSTOMER INFO GRID */}
      <div className="invoice-info-grid">
        <div className="invoice-info-col bill-to">
          <span className="info-section-title">BILLED TO</span>
          <div className="info-detail-name">{customerName}</div>
          {customerLocation && (
            <div className="info-detail-item">
              <MapPin size={13} className="info-icon" />
              <span><strong>Place:</strong> {customerLocation}</span>
            </div>
          )}
          {customerPhone && (
            <div className="info-detail-item">
              <Phone size={13} className="info-icon" />
              <span><strong>Phone:</strong> {customerPhone}</span>
            </div>
          )}
        </div>

        <div className="invoice-info-col invoice-meta">
          <span className="info-section-title">INVOICE DETAILS</span>
          <div className="info-meta-row">
            <span className="meta-label">Invoice Date:</span>
            <strong className="meta-val">{formatDateDisplay(record.sale_date)}</strong>
          </div>
          <div className="info-meta-row">
            <span className="meta-label">Payment Status:</span>
            <span className={`status-pill ${isPaid ? 'status-paid' : isPartial ? 'status-partial' : 'status-unpaid'}`}>
              {isPaid ? 'PAID' : isPartial ? 'PARTIALLY PAID' : 'UNPAID'}
            </span>
          </div>
          {record.payment_method && (
            <div className="info-meta-row">
              <span className="meta-label">Payment Mode:</span>
              <span className="meta-val" style={{ textTransform: 'capitalize' }}>
                {record.payment_method.replace('_', ' ')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ITEMS TABLE */}
      <div className="invoice-table-wrap">
        <table className="a4-invoice-table">
          <thead>
            <tr>
              <th style={{ width: '5%', textAlign: 'center' }}>#</th>
              <th style={{ width: '15%' }}>Date</th>
              <th style={{ width: '38%' }}>Brick Size / Description</th>
              <th style={{ width: '14%', textAlign: 'right' }}>Quantity</th>
              <th style={{ width: '13%', textAlign: 'right' }}>Rate (₹)</th>
              <th style={{ width: '15%', textAlign: 'right' }}>Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {items && items.length > 0 ? (
              items.map((item, index) => {
                const prod = catalog?.products?.find(p => p.id === item.product_id);
                const brickSizeLabel = prod?.size_label || (prod?.brick_size ? `${prod.brick_size} inch` : '') || item.product_name || item.description || 'Finished Brick';
                const rate = Number(item.unit_price ?? item.unit_cost ?? 0);
                const qty = Number(item.quantity || 0);
                const amount = item.line_total != null ? Number(item.line_total) : qty * rate;

                return (
                  <tr key={item.id || index}>
                    <td style={{ textAlign: 'center', color: '#687e70' }}>{index + 1}</td>
                    <td>{formatDateDisplay(record.sale_date)}</td>
                    <td>
                      <strong className="item-title">{brickSizeLabel}</strong>
                      {prod?.code && <small className="item-sub"> · Code: {prod.code}</small>}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {qty.toLocaleString('en-IN')} <span style={{ fontSize: '11px', color: '#687e70', fontWeight: 400 }}>nos</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>{currency(rate, currencyCode)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#132e1e' }}>
                      {currency(amount, currencyCode)}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '16px', color: '#687e70' }}>
                  No line items recorded
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* INVOICE SUMMARY SECTION */}
      <div className="invoice-summary-section">
        {/* Left summary notes & amount in words */}
        <div className="invoice-summary-left">
          <div className="amount-in-words-box">
            <span className="amount-words-title">AMOUNT IN WORDS</span>
            <p className="amount-words-text">{numberToWordsINR(grandTotal)}</p>
          </div>

          {record.notes && (
            <div className="invoice-notes-box">
              <span className="notes-title">Notes / Delivery Details:</span>
              <p className="notes-content">{record.notes}</p>
            </div>
          )}

          {payments && payments.length > 0 && (
            <div className="recorded-payments-mini">
              <span className="notes-title">Recorded Payments:</span>
              {payments.map(p => (
                <div key={p.id} className="mini-payment-row">
                  <span>{formatDateDisplay(p.payment_date)} ({p.payment_method})</span>
                  <strong>{currency(p.amount, currencyCode)}</strong>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right financial totals */}
        <div className="invoice-summary-right">
          <div className="summary-row">
            <span className="summary-label">Subtotal:</span>
            <span className="summary-value">{currency(subtotal, currencyCode)}</span>
          </div>

          {discount > 0 && (
            <div className="summary-row discount-row">
              <span className="summary-label">Discount:</span>
              <span className="summary-value">−{currency(discount, currencyCode)}</span>
            </div>
          )}

          {/* GRAND TOTAL BOX */}
          <div className="summary-row grand-total-box">
            <span className="grand-total-label">Grand Total:</span>
            <span className="grand-total-val">{currency(grandTotal, currencyCode)}</span>
          </div>

          <div className="summary-row">
            <span className="summary-label">Payments Received:</span>
            <span className="summary-value text-green">{currency(amountPaid, currencyCode)}</span>
          </div>

          {prevBal > 0 && (
            <div className="summary-row prev-balance-row">
              <span className="summary-label">Previous Balance:</span>
              <span className="summary-value">{currency(prevBal, currencyCode)}</span>
            </div>
          )}

          <div className={`summary-row balance-row ${outstanding > 0 ? 'has-balance' : 'zero-balance'}`}>
            <span className="summary-label">
              {prevBal > 0 ? 'Total Balance Due:' : 'Outstanding Balance:'}
            </span>
            <span className="summary-value">
              {currency(prevBal > 0 ? totalDue : outstanding, currencyCode)}
            </span>
          </div>
        </div>
      </div>

      {/* FOOTER & AUTHORIZED SIGNATORY */}
      <div className="invoice-footer">
        <div className="invoice-footer-left">
          <p className="footer-tagline">Thank you for your business!</p>
          <p className="footer-company">JM HOLLO BRICKS – Quality You Can Trust</p>
          <p className="footer-terms">
            * Goods once sold will not be taken back. Subject to Malappuram jurisdiction.
          </p>
        </div>

        <div className="invoice-footer-right">
          <div className="signature-box">
            <div className="signature-line" />
            <strong className="sign-title">Authorized Signatory</strong>
            <small className="sign-company">For JM HOLLO BRICKS</small>
          </div>
        </div>
      </div>
    </div>
  );
}
