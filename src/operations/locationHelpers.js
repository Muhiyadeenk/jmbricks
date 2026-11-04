// Helper functions for multi-location delivery management, notes serialization, and WhatsApp sharing

export function parseDeliveryLocations(notes) {
  if (!notes || typeof notes !== 'string') {
    return { userNotes: '', primaryLocation: '', extraLocations: [] };
  }

  let userNotes = notes;
  let primaryLocation = '';
  let extraLocations = [];

  // 1. Try parsing embedded structured JSON comment
  const jsonMatch = notes.match(/<!--LOCATIONS_DATA:(.*?)-->/s);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed)) {
        if (parsed.length > 0) {
          primaryLocation = parsed[0]?.location || '';
          extraLocations = parsed.slice(1);
        }
      } else if (parsed && typeof parsed === 'object') {
        primaryLocation = parsed.primaryLocation || '';
        extraLocations = parsed.extraLocations || [];
      }
      userNotes = userNotes.replace(jsonMatch[0], '').trim();
    } catch (e) {
      // Ignore JSON parse failure and fallback to text parsing
    }
  }

  // 2. Clean up human-readable location lines from editable user notes
  if (userNotes.includes('📍 Delivery Locations:')) {
    const parts = userNotes.split('📍 Delivery Locations:');
    userNotes = parts[0]?.trim() || '';
  } else if (userNotes.includes('📍 Location:')) {
    const parts = userNotes.split('📍 Location:');
    if (!primaryLocation) {
      primaryLocation = parts[1]?.trim() || '';
    }
    userNotes = parts[0]?.replace(/·\s*$/, '').trim() || '';
  }

  return { userNotes, primaryLocation, extraLocations };
}

export function formatSaleNotesWithLocations(userNotes, primaryLocation, extraLocations, availableBricks = []) {
  const cleanUserNotes = (userNotes || '').trim();
  const validExtra = (extraLocations || []).filter(
    loc => (loc.location && loc.location.trim()) || loc.product_id || Number(loc.quantity) > 0
  );

  // If no additional locations, maintain existing simple format
  if (validExtra.length === 0) {
    if (primaryLocation && primaryLocation.trim()) {
      return [cleanUserNotes, `📍 Location: ${primaryLocation.trim()}`].filter(Boolean).join(' · ');
    }
    return cleanUserNotes;
  }

  // Multiple locations: create clear human-readable section + structured payload
  const readableLines = ['📍 Delivery Locations:'];
  if (primaryLocation && primaryLocation.trim()) {
    readableLines.push(`• Location 1 (${primaryLocation.trim()})`);
  }

  validExtra.forEach((loc, idx) => {
    const p = availableBricks.find(b => b.id === loc.product_id);
    const pName = p?.size_label || (p?.brick_size ? `${p.brick_size} inch` : '') || p?.name || 'Finished Brick';
    const locNum = primaryLocation ? idx + 2 : idx + 1;
    const qty = Number(loc.quantity || 0).toLocaleString('en-IN');
    const rate = Number(loc.price || 0);
    const amt = (Number(loc.quantity || 0) * rate).toLocaleString('en-IN');
    readableLines.push(`• Location ${locNum} (${loc.location || 'Site'}): ${pName} – ${qty} bricks @ ₹${rate} = ₹${amt}`);
  });

  const jsonPayload = JSON.stringify({
    primaryLocation: (primaryLocation || '').trim(),
    extraLocations: validExtra.map(loc => ({
      id: loc.id || crypto.randomUUID(),
      location: (loc.location || '').trim(),
      product_id: loc.product_id || '',
      quantity: String(loc.quantity || '0'),
      price: String(loc.price || '0'),
      amount: (Number(loc.quantity) || 0) * (Number(loc.price) || 0)
    }))
  });

  const parts = [
    cleanUserNotes,
    readableLines.join('\n'),
    `<!--LOCATIONS_DATA:${jsonPayload}-->`
  ].filter(Boolean);

  return parts.join('\n\n');
}

export function formatWhatsAppInvoiceMessage({
  record = {},
  items = [],
  customerName = '',
  customerPhone = '',
  subtotal = 0,
  discount = 0,
  grandTotal = 0,
  amountPaid = 0,
  outstanding = 0,
  catalog = {}
}) {
  const { primaryLocation, extraLocations } = parseDeliveryLocations(record.notes);
  const invNumber = record.receipt_number ? `S-${record.receipt_number}` : (record.id ? `S-${record.id.slice(0, 8)}` : 'Sale');
  const invDate = record.sale_date || '';

  const lines = [
    `*JM BRICKS*`,
    `Quality Hollow Bricks & Cement Blocks`,
    `----------------------------------------`,
    `*Tax Invoice:* ${invNumber}`,
    `*Date:* ${invDate}`,
    `*Customer:* ${customerName || 'Customer'}`,
  ];

  if (customerPhone) {
    lines.push(`*Phone:* ${customerPhone}`);
  }

  // Delivery Locations & Items Breakdown
  if (extraLocations && extraLocations.length > 0) {
    lines.push(`----------------------------------------`);
    lines.push(`📍 *DELIVERY LOCATIONS & ORDERS:*`);
    
    // Location 1 (Primary)
    if (primaryLocation) {
      lines.push(`*Location 1: ${primaryLocation}*`);
      (items || []).forEach(it => {
        const p = catalog?.products?.find(prod => prod.id === it.product_id);
        const name = p?.size_label || (p?.brick_size ? `${p.brick_size} Inch` : '') || it.product_name || 'Bricks';
        const qty = Number(it.quantity || 0).toLocaleString('en-IN');
        const rate = Number(it.unit_price ?? it.price ?? 0);
        const amt = (Number(it.quantity || 0) * rate).toLocaleString('en-IN');
        lines.push(`  • ${name}: ${qty} bricks @ ₹${rate} = ₹${amt}`);
      });
    }

    // Additional Locations
    extraLocations.forEach((loc, i) => {
      const p = catalog?.products?.find(prod => prod.id === loc.product_id);
      const name = p?.size_label || (p?.brick_size ? `${p.brick_size} Inch` : '') || 'Bricks';
      const qty = Number(loc.quantity || 0).toLocaleString('en-IN');
      const rate = Number(loc.price || 0);
      const amt = (Number(loc.quantity || 0) * rate).toLocaleString('en-IN');
      lines.push(`*Location ${i + 2}: ${loc.location || 'Site'}*`);
      lines.push(`  • ${name}: ${qty} bricks @ ₹${rate} = ₹${amt}`);
    });
  } else {
    // Single Location
    if (primaryLocation) {
      lines.push(`*Delivery Place:* ${primaryLocation}`);
    }
    lines.push(`----------------------------------------`);
    lines.push(`*ITEMS ORDERED:*`);
    (items || []).forEach(it => {
      const p = catalog?.products?.find(prod => prod.id === it.product_id);
      const name = p?.size_label || (p?.brick_size ? `${p.brick_size} Inch` : '') || it.product_name || 'Bricks';
      const qty = Number(it.quantity || 0).toLocaleString('en-IN');
      const rate = Number(it.unit_price ?? it.price ?? 0);
      const amt = (Number(it.quantity || 0) * rate).toLocaleString('en-IN');
      lines.push(`• ${name}: ${qty} bricks @ ₹${rate} = ₹${amt}`);
    });
  }

  lines.push(`----------------------------------------`);
  lines.push(`*Subtotal:* ₹${Number(subtotal).toLocaleString('en-IN')}`);
  if (Number(discount) > 0) {
    lines.push(`*Discount:* -₹${Number(discount).toLocaleString('en-IN')}`);
  }
  lines.push(`*Grand Total:* ₹${Number(grandTotal).toLocaleString('en-IN')}`);
  lines.push(`*Amount Paid:* ₹${Number(amountPaid).toLocaleString('en-IN')}`);
  lines.push(`*Balance Due:* ₹${Number(outstanding).toLocaleString('en-IN')}`);
  lines.push(`----------------------------------------`);
  lines.push(`_Thank you for your business!_`);
  lines.push(`*JM BRICKS* · Ph: 9747495127 | 9446663786`);

  const text = lines.join('\n');
  const cleanPhone = (customerPhone || '').replace(/\D/g, '');
  const phoneParam = cleanPhone.length >= 10 ? (cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone) : '';

  const shareUrl = phoneParam
    ? `https://wa.me/${phoneParam}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;

  return { text, shareUrl };
}
