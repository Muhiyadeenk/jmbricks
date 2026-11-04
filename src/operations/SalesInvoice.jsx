import React, { useMemo, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, Download, MapPin, Phone, Calendar, FileText, CheckCircle2, Clock, AlertCircle, MessageCircle } from 'lucide-react';
import { Button, Dialog } from '../components';
import { currency } from './api';
import { parseDeliveryLocations, formatWhatsAppInvoiceMessage } from './locationHelpers';
import { downloadInvoicePdf, shareInvoiceViaWhatsApp, downloadBlob } from './pdfInvoiceGenerator.js';

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

  const [isSharing, setIsSharing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [desktopPrompt, setDesktopPrompt] = useState(null);

  const { userNotes, primaryLocation, extraLocations } = useMemo(() => {
    return parseDeliveryLocations(record.notes);
  }, [record.notes]);

  const invoiceDataPayload = useMemo(() => ({
    record,
    items,
    payments,
    catalog,
    settings,
    customerName,
    customerPhone,
    customerLocation,
    primaryLocation,
    extraLocations,
    cleanNotes: userNotes,
    subtotal,
    discount,
    grandTotal,
    amountPaid,
    outstanding
  }), [
    record,
    items,
    payments,
    catalog,
    settings,
    customerName,
    customerPhone,
    customerLocation,
    primaryLocation,
    extraLocations,
    userNotes,
    subtotal,
    discount,
    grandTotal,
    amountPaid,
    outstanding
  ]);

  async function handleShareWhatsApp() {
    if (isSharing) return;
    setIsSharing(true);
    try {
      await shareInvoiceViaWhatsApp(invoiceDataPayload, (info) => {
        setDesktopPrompt(info);
      });
    } catch (err) {
      console.error('WhatsApp share error:', err);
      // Fall back to text share if anything fails
      const { shareUrl } = formatWhatsAppInvoiceMessage({
        record,
        items,
        customerName,
        customerPhone,
        subtotal,
        discount,
        grandTotal,
        amountPaid,
        outstanding,
        catalog
      });
      window.open(shareUrl, '_blank', 'noopener,noreferrer');
    } finally {
      setIsSharing(false);
    }
  }

  async function handleDownloadPdfAction() {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      await downloadInvoicePdf(invoiceDataPayload);
    } catch (err) {
      console.error('PDF download error:', err);
      handlePrintAction();
    } finally {
      setIsDownloading(false);
    }
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
    primaryLocation,
    extraLocations,
    cleanNotes: userNotes,
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
            <Button
              variant="secondary"
              disabled={isSharing}
              onClick={handleShareWhatsApp}
              title="Share PDF Invoice on WhatsApp"
              style={{ color: '#128c7e', borderColor: '#25d36650', background: '#eafaf1' }}
            >
              <MessageCircle size={16} color="#25d366" />
              {isSharing ? 'Generating PDF…' : 'WhatsApp Bill'}
            </Button>
            <Button
              variant="secondary"
              disabled={isDownloading}
              onClick={handleDownloadPdfAction}
              title="Download Official PDF Invoice"
            >
              <Download size={16} />
              {isDownloading ? 'Downloading…' : 'Download PDF'}
            </Button>
            <Button onClick={handlePrintAction} title="Print Invoice">
              <Printer size={16} /> Print Invoice
            </Button>
          </div>
        </div>

        {/* ── SCREEN PREVIEW A4 INVOICE SHEET ─────────────────────────────── */}
        <InvoiceSheet {...invoiceSheetProps} />
      </div>

      {/* ── DESKTOP WHATSAPP SHARE GUIDANCE MODAL ───────────────────────── */}
      {desktopPrompt && (
        <Dialog title="Share Invoice on WhatsApp" onClose={() => setDesktopPrompt(null)}>
          <div style={{ padding: '4px 0' }}>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '38px', marginBottom: '8px' }}>📄</div>
              <h3 style={{ margin: '0 0 6px', color: '#132e1e', fontSize: '17px' }}>
                {desktopPrompt.fileName} Downloaded
              </h3>
              <p style={{ margin: 0, color: '#687e70', fontSize: '13px' }}>
                The official PDF invoice has been downloaded to your computer.
              </p>
            </div>

            <div style={{ background: '#f4f9f5', border: '1px solid #d5e5da', borderRadius: '8px', padding: '14px', marginBottom: '18px', fontSize: '13px' }}>
              <p style={{ margin: '0 0 6px', fontWeight: 700, color: '#1a6640', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MessageCircle size={16} color="#25d366" /> WhatsApp Web is opening for:
              </p>
              <p style={{ margin: '0 0 6px', color: '#132e1e' }}>
                <strong>Customer:</strong> {desktopPrompt.customerName} {desktopPrompt.customerPhone ? `(${desktopPrompt.customerPhone})` : ''}
              </p>
              <p style={{ margin: 0, color: '#354d3e', fontSize: '12.5px', lineHeight: 1.5 }}>
                👉 In the opened WhatsApp Web tab, click the <strong>attach (📎)</strong> icon, choose <strong>Document</strong>, and select <strong>{desktopPrompt.fileName}</strong> to send.
              </p>
            </div>

            <div className="dialog-actions">
              <Button
                variant="secondary"
                type="button"
                onClick={() => downloadBlob(desktopPrompt.pdfBlob, desktopPrompt.fileName)}
              >
                <Download size={15} /> Download PDF Again
              </Button>
              <Button
                variant="secondary"
                type="button"
                onClick={() => window.open(desktopPrompt.waUrl, '_blank', 'noopener,noreferrer')}
                style={{ color: '#128c7e', borderColor: '#25d36650', background: '#eafaf1' }}
              >
                <MessageCircle size={15} color="#25d366" /> Open WhatsApp Web
              </Button>
              <Button type="button" onClick={() => setDesktopPrompt(null)}>
                Done
              </Button>
            </div>
          </div>
        </Dialog>
      )}

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
  primaryLocation,
  extraLocations,
  cleanNotes,
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
            <h1 className="company-title">JM BRICKS</h1>
            <p className="company-tagline">Quality Hollow Bricks & Cement Blocks Manufacturers</p>
            <div className="company-contacts">
              <span><strong>Mobile:</strong> 9747495127 | 9446663786</span>
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
          {extraLocations && extraLocations.length > 0 && (
            <div className="info-detail-item" style={{ marginTop: '2px' }}>
              <MapPin size={13} className="info-icon" color="#1a6640" />
              <span><strong>Delivery Sites:</strong> {[primaryLocation || customerLocation, ...extraLocations.map(l => l.location)].filter(Boolean).join(', ')}</span>
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
            {extraLocations && extraLocations.length > 0 ? (
              <>
                {/* Location 1 (Primary) */}
                <tr className="loc-group-header" style={{ background: '#f0f6f2' }}>
                  <td colSpan={6} style={{ fontWeight: 700, color: '#1a6640', fontSize: '12px', padding: '6px 10px', letterSpacing: '0.3px' }}>
                    📍 LOCATION 1: {(primaryLocation || customerLocation || 'Main Delivery Site').toUpperCase()}
                  </td>
                </tr>
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
                ) : null}

                {/* Additional Locations */}
                {extraLocations.map((loc, lIdx) => {
                  const prod = catalog?.products?.find(p => p.id === loc.product_id);
                  const brickSizeLabel = prod?.size_label || (prod?.brick_size ? `${prod.brick_size} inch` : '') || 'Finished Brick';
                  const rate = Number(loc.price || 0);
                  const qty = Number(loc.quantity || 0);
                  const amount = qty * rate;

                  return (
                    <React.Fragment key={loc.id || lIdx}>
                      <tr className="loc-group-header" style={{ background: '#f0f6f2' }}>
                        <td colSpan={6} style={{ fontWeight: 700, color: '#1a6640', fontSize: '12px', padding: '6px 10px', letterSpacing: '0.3px', borderTop: '1.5px solid #d5e5da' }}>
                          📍 LOCATION {lIdx + 2}: {(loc.location || 'Site').toUpperCase()}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ textAlign: 'center', color: '#687e70' }}>{(items?.length || 0) + lIdx + 1}</td>
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
                    </React.Fragment>
                  );
                })}
              </>
            ) : (
              // Baseline single location rendering
              items && items.length > 0 ? (
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
              )
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

          {cleanNotes && (
            <div className="invoice-notes-box">
              <span className="notes-title">Notes / Delivery Details:</span>
              <p className="notes-content">{cleanNotes}</p>
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
          <p className="footer-company">JM BRICKS – Quality You Can Trust</p>
          <p className="footer-terms">
            * Goods once sold will not be taken back. Subject to Malappuram jurisdiction.
          </p>
        </div>

        <div className="invoice-footer-right">
          <div className="signature-box">
            <div className="signature-line" />
            <strong className="sign-title">Authorized Signatory</strong>
            <small className="sign-company">For JM BRICKS</small>
          </div>
        </div>
      </div>
    </div>
  );
}
