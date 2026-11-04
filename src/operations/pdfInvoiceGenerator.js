/**
 * JM HOLLO BRICKS - Native PDF Invoice Generator & WhatsApp Sharing Engine
 * Generates standards-compliant, lightweight, vector A4 PDF invoices
 * without external dependencies, and provides mobile Web Share API & desktop WhatsApp integration.
 */

import { parseDeliveryLocations } from './locationHelpers.js';

export function escapePdf(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/₹/g, 'Rs. ')
    .replace(/[^\x20-\x7E]/g, ' '); // Standard printable ASCII for Helvetica
}

export function hexToRgb(hex) {
  if (!hex) return [0, 0, 0];
  const c = hex.replace('#', '');
  const n = parseInt(c.length === 3 ? c.split('').map(x => x + x).join('') : c, 16);
  return [
    +(((n >> 16) & 255) / 255).toFixed(3),
    +(((n >> 8) & 255) / 255).toFixed(3),
    +((n & 255) / 255).toFixed(3)
  ];
}

export function cleanPhoneNumber(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  return digits;
}

export function numberToWordsINR(amount) {
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

export function formatDateDisplay(dateStr) {
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

function estimateTextWidth(text, size = 10, isBold = false) {
  const s = String(text || '');
  const avg = isBold ? 0.58 : 0.52;
  return s.length * size * avg;
}

// Logo cache for browser environment
let cachedLogoJpeg = null;

export async function getLogoJpegData() {
  if (cachedLogoJpeg) return cachedLogoJpeg;
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = '/jm-bricks-logo.png';
    await new Promise((resolve, reject) => {
      if (img.complete && img.naturalWidth > 0) return resolve();
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Image load failed'));
    });

    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, 160, 160);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    cachedLogoJpeg = { bytes, width: 160, height: 160 };
    return cachedLogoJpeg;
  } catch (err) {
    console.warn('Could not load logo for PDF:', err);
    return null;
  }
}

/**
 * Builds the PDF content and returns binary bytes (Uint8Array)
 */
export function buildInvoicePdfBytes(data, logoData = null) {
  const pageW = 595.28;
  const pageH = 841.89;
  const marginL = 36;
  const marginR = 36;
  const contentW = pageW - marginL - marginR; // 523.28

  let stream = '';

  function setFillColor(hex) {
    const [r, g, b] = hexToRgb(hex);
    stream += `${r} ${g} ${b} rg\n`;
  }

  function setStrokeColor(hex) {
    const [r, g, b] = hexToRgb(hex);
    stream += `${r} ${g} ${b} RG\n`;
  }

  function setLineWidth(w) {
    stream += `${w} w\n`;
  }

  function rect(x, topY, w, h, mode = 'f') {
    const y = pageH - (topY + h);
    stream += `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${mode}\n`;
  }

  function line(x1, topY1, x2, topY2) {
    const y1 = pageH - topY1;
    const y2 = pageH - topY2;
    stream += `${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S\n`;
  }

  function text(str, x, topY, opts = {}) {
    const size = opts.size || 10;
    const font = opts.bold ? '/F2' : '/F1';
    const color = opts.color || '#132e1e';
    setFillColor(color);

    let drawX = x;
    const clean = escapePdf(str);
    if (opts.align === 'right') {
      const w = estimateTextWidth(clean, size, opts.bold);
      drawX = x - w;
    } else if (opts.align === 'center') {
      const w = estimateTextWidth(clean, size, opts.bold);
      drawX = x - w / 2;
    }

    const y = pageH - topY;
    stream += `BT ${font} ${size} Tf ${drawX.toFixed(2)} ${y.toFixed(2)} Td (${clean}) Tj ET\n`;
  }

  // --- 1. HEADER SECTION ---
  let topY = 36;

  // Background accent banner
  setFillColor('#f4f9f5');
  rect(marginL, topY, contentW, 66, 'f');
  setStrokeColor('#d5e5da');
  setLineWidth(1);
  rect(marginL, topY, contentW, 66, 'S');

  // Draw Logo (if available) or stylized Badge
  let brandStartX = marginL + 14;
  if (logoData && logoData.bytes) {
    const logoW = 50;
    const logoH = 50;
    const logoX = marginL + 12;
    const logoY = pageH - (topY + 58);
    // Draw image XObject: q w 0 0 h x y cm /Logo Do Q
    stream += `q ${logoW} 0 0 ${logoH} ${logoX.toFixed(2)} ${logoY.toFixed(2)} cm /Logo Do Q\n`;
    brandStartX = marginL + 70;
  } else {
    // Stylized JM Badge
    setFillColor('#1a6640');
    rect(marginL + 12, topY + 11, 46, 44, 'f');
    text('JM', marginL + 35, topY + 38, { size: 18, bold: true, color: '#ffffff', align: 'center' });
    brandStartX = marginL + 66;
  }

  // Brand Name, Tagline & Contacts
  text('JM BRICKS', brandStartX, topY + 22, { size: 18, bold: true, color: '#1a6640' });
  text('Quality Hollow Bricks & Cement Blocks Manufacturers', brandStartX, topY + 35, { size: 8.5, color: '#446650' });
  text('Mobile: 9747495127 | 9446663786', brandStartX, topY + 47, { size: 8.5, bold: true, color: '#132e1e' });
  if (data.settings?.business_address) {
    text(data.settings.business_address, brandStartX, topY + 58, { size: 7.5, color: '#687e70' });
  }

  // Right-side TAX INVOICE box
  const invBoxW = 125;
  const invBoxX = marginL + contentW - invBoxW - 10;
  const invBoxY = topY + 8;
  setFillColor('#1a6640');
  rect(invBoxX, invBoxY, invBoxW, 18, 'f');
  text('TAX INVOICE', invBoxX + invBoxW / 2, invBoxY + 13, { size: 9, bold: true, color: '#ffffff', align: 'center' });

  setFillColor('#ffffff');
  rect(invBoxX, invBoxY + 18, invBoxW, 32, 'f');
  setStrokeColor('#1a6640');
  setLineWidth(1);
  rect(invBoxX, invBoxY + 18, invBoxW, 32, 'S');

  text('INVOICE NO', invBoxX + invBoxW / 2, invBoxY + 30, { size: 7.5, color: '#687e70', align: 'center' });
  const receiptNum = data.record?.receipt_number || data.record?.id?.slice(0, 8) || '—';
  text(`S-${receiptNum}`, invBoxX + invBoxW / 2, invBoxY + 45, { size: 13, bold: true, color: '#1a6640', align: 'center' });

  topY += 74;

  // Divider line
  setStrokeColor('#1a6640');
  setLineWidth(1.5);
  line(marginL, topY, marginL + contentW, topY);
  topY += 10;

  // --- 2. BILLED TO & INVOICE DETAILS CARDS ---
  const colW = (contentW - 12) / 2;
  const colH = 82;

  // Left card: BILLED TO
  setFillColor('#f9fbf9');
  rect(marginL, topY, colW, colH, 'f');
  setStrokeColor('#e2ebe4');
  setLineWidth(0.8);
  rect(marginL, topY, colW, colH, 'S');

  text('BILLED TO', marginL + 10, topY + 14, { size: 8, bold: true, color: '#1a6640' });
  const custName = data.customerName || data.record?.customer_name || 'Cash Customer';
  text(custName, marginL + 10, topY + 29, { size: 11, bold: true, color: '#132e1e' });

  let custSubY = topY + 42;
  const custLoc = data.primaryLocation || data.customerLocation;
  if (custLoc) {
    text(`Place: ${custLoc}`, marginL + 10, custSubY, { size: 8.5, color: '#354d3e' });
    custSubY += 12;
  }
  const custPhone = data.customerPhone || data.record?.customer_phone;
  if (custPhone) {
    text(`Phone: ${custPhone}`, marginL + 10, custSubY, { size: 8.5, color: '#354d3e' });
    custSubY += 12;
  }
  if (data.extraLocations && data.extraLocations.length > 0) {
    const locNames = [custLoc, ...data.extraLocations.map(l => l.location)].filter(Boolean).join(', ');
    text(`Delivery Sites: ${locNames}`, marginL + 10, custSubY, { size: 7.5, bold: true, color: '#1a6640' });
  }

  // Right card: INVOICE DETAILS
  const rightColX = marginL + colW + 12;
  setFillColor('#f9fbf9');
  rect(rightColX, topY, colW, colH, 'f');
  setStrokeColor('#e2ebe4');
  setLineWidth(0.8);
  rect(rightColX, topY, colW, colH, 'S');

  text('INVOICE DETAILS', rightColX + 10, topY + 14, { size: 8, bold: true, color: '#1a6640' });
  text('Date:', rightColX + 10, topY + 30, { size: 8.5, color: '#687e70' });
  text(formatDateDisplay(data.record?.sale_date) || '—', rightColX + 60, topY + 30, { size: 9, bold: true, color: '#132e1e' });

  text('Status:', rightColX + 10, topY + 46, { size: 8.5, color: '#687e70' });
  const grandTotal = Number(data.grandTotal ?? data.record?.total ?? 0);
  const amountPaid = Number(data.amountPaid ?? data.record?.amount_received ?? 0);
  const outstanding = Number(data.outstanding ?? data.record?.outstanding_balance ?? Math.max(0, grandTotal - amountPaid));
  const isPaid = grandTotal > 0 && outstanding <= 0;
  const isPartial = amountPaid > 0 && outstanding > 0;
  const statusLabel = isPaid ? 'PAID' : isPartial ? 'PARTIALLY PAID' : 'UNPAID';
  const statusColor = isPaid ? '#1a6640' : isPartial ? '#d97706' : '#b91c1c';

  setFillColor(isPaid ? '#eafaf1' : isPartial ? '#fef3c7' : '#fee2e2');
  rect(rightColX + 60, topY + 36, 85, 14, 'f');
  text(statusLabel, rightColX + 102.5, topY + 46.5, { size: 7.5, bold: true, color: statusColor, align: 'center' });

  if (data.record?.payment_method) {
    text('Mode:', rightColX + 10, topY + 63, { size: 8.5, color: '#687e70' });
    text(String(data.record.payment_method).toUpperCase(), rightColX + 60, topY + 63, { size: 8.5, bold: true, color: '#132e1e' });
  }

  topY += colH + 14;

  // --- 3. ITEMS TABLE ---
  const c0 = marginL;                 // # (22)
  const c1 = marginL + 22;            // Date (70)
  const c2 = marginL + 92;            // Description (210)
  const c3 = marginL + 302;           // Quantity (75)
  const c4 = marginL + 377;           // Rate (68)
  const c5 = marginL + 445;           // Amount (78)
  const cRight = marginL + contentW;

  const headerH = 20;
  setFillColor('#1a6640');
  rect(marginL, topY, contentW, headerH, 'f');

  text('#', c0 + 11, topY + 13.5, { size: 8, bold: true, color: '#ffffff', align: 'center' });
  text('Date', c1 + 6, topY + 13.5, { size: 8, bold: true, color: '#ffffff' });
  text('Brick Size / Description', c2 + 6, topY + 13.5, { size: 8, bold: true, color: '#ffffff' });
  text('Quantity', c3 + 70, topY + 13.5, { size: 8, bold: true, color: '#ffffff', align: 'right' });
  text('Rate (Rs)', c4 + 63, topY + 13.5, { size: 8, bold: true, color: '#ffffff', align: 'right' });
  text('Amount (Rs)', c5 + 72, topY + 13.5, { size: 8, bold: true, color: '#ffffff', align: 'right' });

  topY += headerH;

  let rowIdx = 1;

  function renderItemRow(dateStr, desc, qty, rate, amt, isZebra) {
    const rowH = 19;
    if (isZebra) {
      setFillColor('#f9fbf9');
      rect(marginL, topY, contentW, rowH, 'f');
    }
    setStrokeColor('#e6eee8');
    setLineWidth(0.5);
    line(marginL, topY + rowH, cRight, topY + rowH);

    text(String(rowIdx++), c0 + 11, topY + 13, { size: 8, color: '#687e70', align: 'center' });
    text(dateStr, c1 + 6, topY + 13, { size: 7.5, color: '#334433' });
    text(desc, c2 + 6, topY + 13, { size: 8.5, bold: true, color: '#132e1e' });
    text(`${Number(qty).toLocaleString('en-IN')} nos`, c3 + 70, topY + 13, { size: 8.5, bold: true, color: '#132e1e', align: 'right' });
    text(`Rs. ${Number(rate).toFixed(2)}`, c4 + 63, topY + 13, { size: 8, color: '#334433', align: 'right' });
    text(`Rs. ${Number(amt).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, c5 + 72, topY + 13, { size: 8.5, bold: true, color: '#132e1e', align: 'right' });

    topY += rowH;
  }

  function renderLocationBanner(locName, locNum) {
    const banH = 17;
    setFillColor('#eafaf1');
    rect(marginL, topY, contentW, banH, 'f');
    setStrokeColor('#cce8d6');
    setLineWidth(0.8);
    rect(marginL, topY, contentW, banH, 'S');

    text(`* LOCATION ${locNum}: ${(locName || 'Main Delivery Site').toUpperCase()}`, marginL + 10, topY + 11.5, {
      size: 8,
      bold: true,
      color: '#1a6640'
    });
    topY += banH;
  }

  const hasExtra = data.extraLocations && data.extraLocations.length > 0;

  if (hasExtra) {
    renderLocationBanner(data.primaryLocation || data.customerLocation || 'Main Delivery Site', 1);
  }

  const items = data.items || [];
  if (items.length > 0) {
    items.forEach((item, i) => {
      const prod = data.catalog?.products?.find(p => p.id === item.product_id);
      const desc = prod?.size_label || (prod?.brick_size ? `${prod.brick_size} inch Brick` : '') || item.product_name || 'Finished Brick';
      const rate = Number(item.unit_price ?? item.unit_cost ?? 0);
      const qty = Number(item.quantity || 0);
      const amt = item.line_total != null ? Number(item.line_total) : qty * rate;
      renderItemRow(formatDateDisplay(data.record?.sale_date) || '', desc, qty, rate, amt, i % 2 === 1);
    });
  }

  if (hasExtra) {
    data.extraLocations.forEach((loc, lIdx) => {
      renderLocationBanner(loc.location, lIdx + 2);
      const prod = data.catalog?.products?.find(p => p.id === loc.product_id);
      const desc = prod?.size_label || (prod?.brick_size ? `${prod.brick_size} inch Brick` : '') || 'Finished Brick';
      const rate = Number(loc.price || 0);
      const qty = Number(loc.quantity || 0);
      const amt = qty * rate;
      renderItemRow(formatDateDisplay(data.record?.sale_date) || '', desc, qty, rate, amt, false);
    });
  }

  topY += 12;

  // --- 4. SUMMARY & FINANCIAL TOTALS ---
  const leftW = 275;
  const rightW = contentW - leftW - 14; // 234.28
  const sumH = 112;

  // Left side: Amount in words & Notes
  setFillColor('#f9fbf9');
  rect(marginL, topY, leftW, sumH, 'f');
  setStrokeColor('#e2ebe4');
  setLineWidth(0.8);
  rect(marginL, topY, leftW, sumH, 'S');

  text('AMOUNT IN WORDS', marginL + 10, topY + 14, { size: 7.5, bold: true, color: '#687e70' });
  const words = numberToWordsINR(grandTotal);
  text(words.slice(0, 48), marginL + 10, topY + 28, { size: 8, bold: true, color: '#132e1e' });
  if (words.length > 48) {
    text(words.slice(48, 96), marginL + 10, topY + 39, { size: 8, bold: true, color: '#132e1e' });
  }

  const cleanNotes = data.cleanNotes || (data.record?.notes ? parseDeliveryLocations(data.record.notes).userNotes : '');
  if (cleanNotes) {
    text('Delivery / Bill Notes:', marginL + 10, topY + 54, { size: 7.5, bold: true, color: '#687e70' });
    text(cleanNotes.slice(0, 52), marginL + 10, topY + 66, { size: 7.5, color: '#334433' });
    if (cleanNotes.length > 52) {
      text(cleanNotes.slice(52, 104), marginL + 10, topY + 77, { size: 7.5, color: '#334433' });
    }
  }

  if (data.payments && data.payments.length > 0) {
    text('Recorded Payments:', marginL + 10, topY + 88, { size: 7, bold: true, color: '#687e70' });
    data.payments.slice(0, 2).forEach((p, pIdx) => {
      text(`${formatDateDisplay(p.payment_date)} (${p.payment_method}): Rs. ${Number(p.amount).toFixed(2)}`, marginL + 10, topY + 98 + pIdx * 10, { size: 7, color: '#1a6640' });
    });
  }

  // Right side: Financial Totals Box
  const rX = marginL + leftW + 14;
  setFillColor('#f9fbf9');
  rect(rX, topY, rightW, sumH, 'f');
  setStrokeColor('#e2ebe4');
  setLineWidth(0.8);
  rect(rX, topY, rightW, sumH, 'S');

  let rY = topY + 14;
  text('Subtotal:', rX + 12, rY, { size: 8.5, color: '#687e70' });
  text(`Rs. ${Number(data.subtotal || grandTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, rX + rightW - 12, rY, { size: 8.5, bold: true, color: '#132e1e', align: 'right' });

  if (Number(data.discount) > 0) {
    rY += 15;
    text('Discount:', rX + 12, rY, { size: 8.5, color: '#687e70' });
    text(`-Rs. ${Number(data.discount).toFixed(2)}`, rX + rightW - 12, rY, { size: 8.5, bold: true, color: '#b91c1c', align: 'right' });
  }

  // Grand Total Box
  rY += 16;
  setFillColor('#1a6640');
  rect(rX + 8, rY - 10, rightW - 16, 21, 'f');
  text('Grand Total:', rX + 14, rY + 4, { size: 9.5, bold: true, color: '#ffffff' });
  text(`Rs. ${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, rX + rightW - 14, rY + 4, { size: 10, bold: true, color: '#ffffff', align: 'right' });

  rY += 25;
  text('Payments Received:', rX + 12, rY, { size: 8.5, color: '#687e70' });
  text(`Rs. ${amountPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, rX + rightW - 12, rY, { size: 8.5, bold: true, color: '#1a6640', align: 'right' });

  rY += 16;
  text('Outstanding Balance:', rX + 12, rY, { size: 9, bold: true, color: outstanding > 0 ? '#b91c1c' : '#1a6640' });
  text(`Rs. ${outstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, rX + rightW - 12, rY, { size: 9.5, bold: true, color: outstanding > 0 ? '#b91c1c' : '#1a6640', align: 'right' });

  // --- 5. FOOTER & AUTHORIZED SIGNATORY ---
  const footY = pageH - 72;
  setStrokeColor('#d5e5da');
  setLineWidth(1);
  line(marginL, footY, marginL + contentW, footY);

  text('Thank you for your business!', marginL, footY + 16, { size: 9, bold: true, color: '#1a6640' });
  text('JM BRICKS - Quality You Can Trust', marginL, footY + 28, { size: 7.5, color: '#687e70' });
  text('* Goods once sold will not be taken back. Subject to Malappuram jurisdiction.', marginL, footY + 38, { size: 7, color: '#889988' });

  const signX = marginL + contentW - 150;
  line(signX, footY + 28, signX + 140, footY + 28);
  text('Authorized Signatory', signX + 70, footY + 38, { size: 8, bold: true, color: '#132e1e', align: 'center' });
  text('For JM BRICKS', signX + 70, footY + 48, { size: 7, color: '#687e70', align: 'center' });

  // --- PDF ASSEMBLY ---
  const textEncoder = new TextEncoder();
  const streamBytes = textEncoder.encode(stream);
  const streamLen = streamBytes.length;

  const parts = [];
  const offsets = [];
  let totalLength = 0;

  function append(strOrBytes) {
    if (typeof strOrBytes === 'string') {
      const b = textEncoder.encode(strOrBytes);
      parts.push(b);
      totalLength += b.length;
    } else {
      parts.push(strOrBytes);
      totalLength += strOrBytes.length;
    }
  }

  function addObj(header, bodyBytes = null) {
    offsets.push(totalLength);
    const num = offsets.length;
    append(`${num} 0 obj\n${header}\n`);
    if (bodyBytes) {
      append('stream\n');
      append(bodyBytes);
      append('\nendstream\nendobj\n');
    } else {
      append('endobj\n');
    }
    return num;
  }

  append('%PDF-1.4\n%âãÏÓ\n');

  // 1: Catalog
  addObj('<< /Type /Catalog /Pages 2 0 R >>');
  // 2: Pages
  addObj('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');

  // Page resources
  const hasLogo = logoData && logoData.bytes;
  const resourcesDict = hasLogo
    ? '<< /Font << /F1 5 0 R /F2 6 0 R >> /XObject << /Logo 7 0 R >> >>'
    : '<< /Font << /F1 5 0 R /F2 6 0 R >> >>';

  // 3: Page
  addObj(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 4 0 R /Resources ${resourcesDict} >>`);
  // 4: Contents
  addObj(`<< /Length ${streamLen} >>`, streamBytes);
  // 5: Font F1
  addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  // 6: Font F2
  addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  // 7: Logo Image (if available)
  if (hasLogo) {
    addObj(
      `<< /Type /XObject /Subtype /Image /Width ${logoData.width} /Height ${logoData.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoData.bytes.length} >>`,
      logoData.bytes
    );
  }

  const xrefOffset = totalLength;
  append(`xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`);
  for (let i = 0; i < offsets.length; i++) {
    append(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
  }
  append(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  // Concatenate parts into a single Uint8Array
  const finalBytes = new Uint8Array(totalLength);
  let curOffset = 0;
  for (const part of parts) {
    finalBytes.set(part, curOffset);
    curOffset += part.length;
  }
  return finalBytes;
}

/**
 * Generates invoice as Blob
 */
export async function generateInvoicePdfBlob(data) {
  const logoData = await getLogoJpegData();
  const bytes = buildInvoicePdfBytes(data, logoData);
  return new Blob([bytes], { type: 'application/pdf' });
}

/**
 * Direct file download helper
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Downloads invoice PDF directly to client
 */
export async function downloadInvoicePdf(data) {
  const receiptNum = data.record?.receipt_number || data.record?.id?.slice(0, 8) || 'bill';
  const fileName = `Invoice_S-${receiptNum}.pdf`;
  const blob = await generateInvoicePdfBlob(data);
  downloadBlob(blob, fileName);
  return { fileName, blob };
}

/**
 * WhatsApp Sharing handler
 * Mobile: uses Web Share API with actual PDF file attachment
 * Desktop: downloads PDF file, opens WhatsApp Web with customer phone, and invokes onDesktopPrompt
 */
export async function shareInvoiceViaWhatsApp(data, onDesktopPrompt = null) {
  const receiptNum = data.record?.receipt_number || data.record?.id?.slice(0, 8) || 'bill';
  const fileName = `Invoice_S-${receiptNum}.pdf`;
  const custName = data.customerName || data.record?.customer_name || 'Customer';
  const rawPhone = data.customerPhone || data.record?.customer_phone || '';
  const phone = cleanPhoneNumber(rawPhone);

  const grandTotal = Number(data.grandTotal ?? data.record?.total ?? 0);
  const outstanding = Number(data.outstanding ?? data.record?.outstanding_balance ?? 0);

  const caption = `Hello ${custName},\nPlease find attached your invoice S-${receiptNum} from JM BRICKS.\nTotal: Rs. ${grandTotal.toLocaleString('en-IN')}${outstanding > 0 ? `\nBalance Due: Rs. ${outstanding.toLocaleString('en-IN')}` : ''}\nThank you!`;

  // 1. Generate actual PDF blob
  const pdfBlob = await generateInvoicePdfBlob(data);
  const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

  // 2. Check for native Web Share API with file support (Mobile devices)
  const canShareFiles = typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [pdfFile] });

  if (canShareFiles) {
    try {
      await navigator.share({
        files: [pdfFile],
        title: `Invoice S-${receiptNum}`,
        text: caption,
      });
      return { success: true, method: 'web-share' };
    } catch (shareErr) {
      // User cancelled share dialog (AbortError) - return silently
      if (shareErr.name === 'AbortError') {
        return { success: false, aborted: true };
      }
      console.warn('Web Share failed, falling back to download + WhatsApp Web:', shareErr);
    }
  }

  // 3. Desktop / Non-WebShare Fallback:
  // Download the actual PDF file
  downloadBlob(pdfBlob, fileName);

  // Construct WhatsApp Web URL
  const waUrl = phone
    ? `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(caption)}`
    : `https://web.whatsapp.com/send?text=${encodeURIComponent(caption)}`;

  window.open(waUrl, '_blank', 'noopener,noreferrer');

  // If a UI callback is provided, show the desktop guidance prompt
  if (typeof onDesktopPrompt === 'function') {
    onDesktopPrompt({
      fileName,
      customerName: custName,
      customerPhone: rawPhone,
      cleanPhone: phone,
      waUrl,
      pdfBlob
    });
  }

  return { success: true, method: 'desktop-download' };
}
