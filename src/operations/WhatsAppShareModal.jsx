import React, { useState, useMemo } from 'react';
import { MessageCircle, Download, CheckCircle2, AlertCircle, Phone, FileText, ArrowRight, X } from 'lucide-react';
import { Dialog, Button, Field } from '../components';
import {
  cleanPhoneNumber,
  validatePhoneNumber,
  generateWhatsAppBillMessage,
  shareInvoiceViaWhatsApp,
  downloadInvoicePdf,
  downloadBlob
} from './pdfInvoiceGenerator.js';

export default function WhatsAppShareModal({
  invoiceData,
  onClose,
  onSuccess
}) {
  const registeredPhone = useMemo(() => {
    return invoiceData?.customerPhone || invoiceData?.record?.customer_phone || '';
  }, [invoiceData]);

  const customerName = useMemo(() => {
    return invoiceData?.customerName || invoiceData?.record?.customer_name || 'Customer';
  }, [invoiceData]);

  const receiptNum = useMemo(() => {
    return invoiceData?.record?.receipt_number || invoiceData?.record?.id?.slice(0, 8) || 'bill';
  }, [invoiceData]);

  const grandTotal = Number(invoiceData?.grandTotal ?? invoiceData?.record?.total ?? 0);
  const amountReceived = Number(invoiceData?.amountPaid ?? invoiceData?.record?.amount_received ?? 0);
  const balance = Number(invoiceData?.outstanding ?? invoiceData?.record?.outstanding_balance ?? Math.max(0, grandTotal - amountReceived));

  // Recipient phone state
  const [recipientPhone, setRecipientPhone] = useState(() => registeredPhone);
  const [phoneError, setPhoneError] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [desktopPrompt, setDesktopPrompt] = useState(null);

  // Live validation
  const validation = useMemo(() => {
    if (!recipientPhone.trim()) {
      return { valid: false, message: 'Please enter a 10-digit mobile number' };
    }
    return validatePhoneNumber(recipientPhone);
  }, [recipientPhone]);

  // Prepared message preview
  const messagePreview = useMemo(() => {
    return generateWhatsAppBillMessage({
      customerName,
      receiptNumber: receiptNum,
      total: grandTotal,
      amountReceived,
      balance
    });
  }, [customerName, receiptNum, grandTotal, amountReceived, balance]);

  async function handleShare() {
    setPhoneError('');
    if (!recipientPhone.trim()) {
      setPhoneError('Please enter a recipient mobile number for WhatsApp sharing.');
      return;
    }

    const val = validatePhoneNumber(recipientPhone);
    if (!val.valid) {
      setPhoneError(val.error || 'Please enter a valid 10-digit mobile number.');
      return;
    }

    setIsSharing(true);
    setShareSuccess(false);

    try {
      const result = await shareInvoiceViaWhatsApp(
        invoiceData,
        (promptInfo) => setDesktopPrompt(promptInfo),
        recipientPhone
      );

      if (result?.success) {
        setShareSuccess(true);
        if (onSuccess) onSuccess(result);
      }
    } catch (err) {
      console.error('WhatsApp share error:', err);
      setPhoneError(err.message || 'Unable to share bill on WhatsApp. Please check connection and try again.');
    } finally {
      setIsSharing(false);
    }
  }

  async function handleDownloadOnly() {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      await downloadInvoicePdf(invoiceData);
    } catch (err) {
      console.error('Download error:', err);
      setPhoneError('Unable to download PDF. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <>
      <Dialog title={`Share Bill on WhatsApp — S-${receiptNum}`} onClose={onClose}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Customer & Bill Overview Card */}
          <div
            style={{
              background: '#f4f9f5',
              border: '1.5px solid #cce5d6',
              borderRadius: '12px',
              padding: '14px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px'
            }}
          >
            <div>
              <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#1a6640', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Customer & Bill
              </span>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#132e1e', marginTop: '2px' }}>
                {customerName}
              </div>
              <div style={{ fontSize: '12.5px', color: '#446650', marginTop: '2px' }}>
                Invoice No: <strong>S-{receiptNum}</strong> · Amount: <strong>₹{grandTotal.toLocaleString('en-IN')}</strong>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '11px', color: '#687e70', display: 'block' }}>Payment Status</span>
              <span
                style={{
                  display: 'inline-block',
                  marginTop: '2px',
                  padding: '3px 9px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  background: balance <= 0 && grandTotal > 0 ? '#eafaf1' : amountReceived > 0 ? '#fef3c7' : '#fee2e2',
                  color: balance <= 0 && grandTotal > 0 ? '#1a6640' : amountReceived > 0 ? '#b45309' : '#b91c1c'
                }}
              >
                {balance <= 0 && grandTotal > 0 ? '✓ PAID' : amountReceived > 0 ? '⏳ PARTIALLY PAID' : '⚠️ UNPAID'}
              </span>
            </div>
          </div>

          {/* Recipient Phone Number Input with Validation */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label style={{ fontSize: '13.5px', fontWeight: 700, color: '#132e1e' }}>
                Recipient WhatsApp Number
              </label>
              {registeredPhone && recipientPhone !== registeredPhone && (
                <button
                  type="button"
                  onClick={() => { setRecipientPhone(registeredPhone); setPhoneError(''); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#1a6640',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  Use Registered Number ({registeredPhone})
                </button>
              )}
            </div>

            <div style={{ position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  pointerEvents: 'none',
                  color: '#446650',
                  fontWeight: 600,
                  fontSize: '14px'
                }}
              >
                <Phone size={15} color="#1a6640" />
                <span>+91</span>
              </div>

              <input
                type="tel"
                value={recipientPhone}
                placeholder="Enter 10-digit mobile number (e.g. 9747495127)"
                onChange={e => {
                  setRecipientPhone(e.target.value);
                  setPhoneError('');
                }}
                style={{
                  width: '100%',
                  minHeight: '44px',
                  fontSize: '15px',
                  paddingLeft: '64px',
                  paddingRight: '14px',
                  borderRadius: '10px',
                  border: phoneError ? '1.5px solid #d92d20' : validation.valid ? '1.5px solid #1a6640' : '1.5px solid #c2d4c6',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Validation Feedback */}
            <div style={{ marginTop: '6px', minHeight: '20px' }}>
              {phoneError ? (
                <span style={{ fontSize: '12.5px', color: '#d92d20', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
                  <AlertCircle size={14} /> {phoneError}
                </span>
              ) : validation.valid ? (
                <span style={{ fontSize: '12.5px', color: '#1a6640', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                  <CheckCircle2 size={14} color="#1a6640" /> Ready to send to {validation.formatted}
                </span>
              ) : recipientPhone.trim() ? (
                <span style={{ fontSize: '12px', color: '#b54708', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertCircle size={13} /> {validation.error || 'Enter a valid 10-digit number'}
                </span>
              ) : (
                <span style={{ fontSize: '12px', color: '#687e70' }}>
                  Customer has no registered number. Please enter a 10-digit mobile number.
                </span>
              )}
            </div>
          </div>

          {/* PDF Attachment & Message Preview Box */}
          <div
            style={{
              background: '#f8faf8',
              border: '1.5px solid #dce8de',
              borderRadius: '12px',
              padding: '14px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#104B35', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <MessageCircle size={14} color="#25D366" /> WhatsApp Message & Document Attachment
              </span>
              <span style={{ fontSize: '11.5px', color: '#1a6640', fontWeight: 600, background: '#eafaf1', padding: '2px 8px', borderRadius: '4px' }}>
                📎 PDF Attached
              </span>
            </div>

            {/* Message Chat Bubble */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #d5e6da',
                borderLeft: '4px solid #25D366',
                borderRadius: '8px',
                padding: '12px 14px',
                fontSize: '13px',
                lineHeight: '1.55',
                color: '#132e1e',
                whiteSpace: 'pre-wrap',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}
            >
              {messagePreview}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', fontSize: '12px', color: '#446650' }}>
              <FileText size={14} color="#1a6640" />
              <span>Attachment: <strong>Invoice_S-{receiptNum}.pdf</strong> (Official A4 tax invoice with borderless logo & per-brick delivery locations)</span>
            </div>
          </div>

          {/* Success Banner */}
          {shareSuccess && (
            <div
              style={{
                background: '#eafaf1',
                border: '1px solid #a3cca8',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#1a6640',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <CheckCircle2 size={16} color="#1a6640" />
              <span>Bill sharing initiated successfully!</span>
            </div>
          )}

          {/* Modal Actions */}
          <div className="dialog-actions" style={{ marginTop: '4px' }}>
            <Button variant="secondary" onClick={onClose} disabled={isSharing}>
              Close
            </Button>

            <Button
              variant="secondary"
              type="button"
              disabled={isDownloading || isSharing}
              onClick={handleDownloadOnly}
              title="Download PDF to computer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Download size={15} />
              {isDownloading ? 'Downloading…' : 'Download PDF'}
            </Button>

            <button
              type="button"
              disabled={isSharing || !validation.valid}
              onClick={handleShare}
              style={{
                background: isSharing || !validation.valid ? '#8fd7a7' : '#25D366',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                cursor: isSharing || !validation.valid ? 'not-allowed' : 'pointer',
                boxShadow: isSharing || !validation.valid ? 'none' : '0 2px 6px rgba(37, 211, 102, 0.35)',
                transition: 'background 0.15s ease'
              }}
            >
              <MessageCircle size={17} />
              {isSharing ? 'Generating PDF…' : 'Share on WhatsApp'}
            </button>
          </div>
        </div>
      </Dialog>

      {/* Desktop WhatsApp Web Guidance Modal */}
      {desktopPrompt && (
        <Dialog title="WhatsApp Bill Ready" onClose={() => setDesktopPrompt(null)}>
          <div style={{ padding: '4px 0' }}>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '38px', marginBottom: '8px' }}>📄</div>
              <h3 style={{ margin: '0 0 6px', color: '#132e1e', fontSize: '17px' }}>
                {desktopPrompt.fileName} Downloaded
              </h3>
              <p style={{ margin: 0, color: '#687e70', fontSize: '13px' }}>
                The official sales invoice PDF has been downloaded to your computer.
              </p>
            </div>

            <div style={{ background: '#f4f9f5', border: '1px solid #d5e5da', borderRadius: '8px', padding: '14px', marginBottom: '18px', fontSize: '13px' }}>
              <p style={{ margin: '0 0 6px', fontWeight: 700, color: '#1a6640', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MessageCircle size={16} color="#25D366" /> WhatsApp is opening for:
              </p>
              <p style={{ margin: '0 0 8px', color: '#132e1e' }}>
                <strong>Customer:</strong> {desktopPrompt.customerName} {desktopPrompt.cleanPhone ? `(+${desktopPrompt.cleanPhone})` : ''}
              </p>
              <p style={{ margin: 0, color: '#354d3e', fontSize: '12.5px', lineHeight: 1.5 }}>
                👉 In the opened WhatsApp tab, click the <strong>attach (📎)</strong> icon, choose <strong>Document</strong>, and attach <strong>{desktopPrompt.fileName}</strong> from your Downloads.
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
                <MessageCircle size={15} color="#25D366" /> Open WhatsApp
              </Button>
              <Button type="button" onClick={() => setDesktopPrompt(null)}>
                Done
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
