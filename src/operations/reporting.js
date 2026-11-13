// Calendar dates are business-local dates, never parsed in the browser's timezone.
export function shiftDate(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDateDisplay(dateStr) {
  if (!dateStr) return '—';
  try {
    const parts = String(dateStr).slice(0, 10).split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      const d = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
    }
  } catch (e) {
    // fallback
  }
  return dateStr;
}

export function getPeriodDates(period, todayStr, customDraft = {}) {
  const today = todayStr || new Date().toISOString().slice(0, 10);
  const todayD = new Date(`${today}T00:00:00Z`);
  const dayOfWeek = (todayD.getUTCDay() + 6) % 7; // 0 = Mon, 6 = Sun

  if (period === 'today') {
    return {
      period: 'today',
      from: today,
      to: today,
      prevFrom: shiftDate(today, -1),
      prevTo: shiftDate(today, -1),
      label: 'Today',
      prevLabel: 'Yesterday',
      dateRangeLabel: formatDateDisplay(today)
    };
  }

  if (period === 'yesterday') {
    const yest = shiftDate(today, -1);
    const dayBefore = shiftDate(today, -2);
    return {
      period: 'yesterday',
      from: yest,
      to: yest,
      prevFrom: dayBefore,
      prevTo: dayBefore,
      label: 'Yesterday',
      prevLabel: 'Day Before Yesterday',
      dateRangeLabel: formatDateDisplay(yest)
    };
  }

  if (period === 'week' || period === 'this_week') {
    const monday = shiftDate(today, -dayOfWeek);
    const daysSoFar = dayOfWeek + 1; // 1 to 7
    const prevMonday = shiftDate(monday, -7);
    const prevEnd = shiftDate(prevMonday, daysSoFar - 1);
    return {
      period: 'this_week',
      from: monday,
      to: today,
      prevFrom: prevMonday,
      prevTo: prevEnd,
      label: 'This Week',
      prevLabel: 'Last Week (Equivalent Days)',
      dateRangeLabel: `${formatDateDisplay(monday)} – ${formatDateDisplay(today)}`
    };
  }

  if (period === 'last_week') {
    const thisMonday = shiftDate(today, -dayOfWeek);
    const lastMonday = shiftDate(thisMonday, -7);
    const lastSunday = shiftDate(thisMonday, -1);
    const prevLastMonday = shiftDate(lastMonday, -7);
    const prevLastSunday = shiftDate(lastMonday, -1);
    return {
      period: 'last_week',
      from: lastMonday,
      to: lastSunday,
      prevFrom: prevLastMonday,
      prevTo: prevLastSunday,
      label: 'Last Week',
      prevLabel: 'Week Before Last',
      dateRangeLabel: `${formatDateDisplay(lastMonday)} – ${formatDateDisplay(lastSunday)}`
    };
  }

  if (period === 'month' || period === 'this_month') {
    const monthStart = today.slice(0, 7) + '-01';
    const curDay = Number(today.slice(8, 10)); // e.g. 13
    
    // Previous month equivalent:
    const curYear = Number(today.slice(0, 4));
    const curMonth = Number(today.slice(5, 7)); // 1-12
    const prevYear = curMonth === 1 ? curYear - 1 : curYear;
    const prevMonthNum = curMonth === 1 ? 12 : curMonth - 1;
    const prevMonthStr = `${prevYear}-${String(prevMonthNum).padStart(2, '0')}`;
    const prevMonthStart = `${prevMonthStr}-01`;
    // Days in previous month
    const daysInPrevMonth = new Date(Date.UTC(curYear, curMonth - 1, 0)).getUTCDate();
    const prevEndDay = Math.min(curDay, daysInPrevMonth);
    const prevMonthEnd = `${prevMonthStr}-${String(prevEndDay).padStart(2, '0')}`;

    return {
      period: 'this_month',
      from: monthStart,
      to: today,
      prevFrom: prevMonthStart,
      prevTo: prevMonthEnd,
      label: 'This Month',
      prevLabel: 'Last Month (Equivalent Days)',
      dateRangeLabel: `${formatDateDisplay(monthStart)} – ${formatDateDisplay(today)}`
    };
  }

  if (period === 'last_month') {
    const curYear = Number(today.slice(0, 4));
    const curMonth = Number(today.slice(5, 7));
    const lastMonthYear = curMonth === 1 ? curYear - 1 : curYear;
    const lastMonthNum = curMonth === 1 ? 12 : curMonth - 1;
    const lastMonthStr = `${lastMonthYear}-${String(lastMonthNum).padStart(2, '0')}`;
    const lastMonthStart = `${lastMonthStr}-01`;
    const daysInLastMonth = new Date(Date.UTC(lastMonthYear, lastMonthNum, 0)).getUTCDate();
    const lastMonthEnd = `${lastMonthStr}-${String(daysInLastMonth).padStart(2, '0')}`;

    // Two months ago
    const priorYear = lastMonthNum === 1 ? lastMonthYear - 1 : lastMonthYear;
    const priorMonthNum = lastMonthNum === 1 ? 12 : lastMonthNum - 1;
    const priorMonthStr = `${priorYear}-${String(priorMonthNum).padStart(2, '0')}`;
    const priorMonthStart = `${priorMonthStr}-01`;
    const daysInPriorMonth = new Date(Date.UTC(priorYear, priorMonthNum, 0)).getUTCDate();
    const priorMonthEnd = `${priorMonthStr}-${String(daysInPriorMonth).padStart(2, '0')}`;

    return {
      period: 'last_month',
      from: lastMonthStart,
      to: lastMonthEnd,
      prevFrom: priorMonthStart,
      prevTo: priorMonthEnd,
      label: 'Last Month',
      prevLabel: 'Prior Month',
      dateRangeLabel: `${formatDateDisplay(lastMonthStart)} – ${formatDateDisplay(lastMonthEnd)}`
    };
  }

  // Custom
  const from = customDraft.from || today;
  const to = customDraft.to || today;
  const fromMs = new Date(`${from}T00:00:00Z`).getTime();
  const toMs = new Date(`${to}T00:00:00Z`).getTime();
  const daysDiff = Math.max(1, Math.round((toMs - fromMs) / 86400000) + 1);
  const prevTo = shiftDate(from, -1);
  const prevFrom = shiftDate(prevTo, -(daysDiff - 1));

  return {
    period: 'custom',
    from,
    to,
    prevFrom,
    prevTo,
    label: 'Custom Range',
    prevLabel: 'Previous Equivalent Period',
    dateRangeLabel: `${formatDateDisplay(from)} – ${formatDateDisplay(to)}`
  };
}

export function calculateDelta(current, previous, isExpenseOrLiability = false, metricName = '') {
  const c = Math.round(Number(current || 0) * 100) / 100;
  const p = Math.round(Number(previous || 0) * 100) / 100;
  const diff = Math.round((c - p) * 100) / 100;

  let percent = 0;
  if (p === 0) {
    percent = c === 0 ? 0 : 100;
  } else {
    percent = Math.round((Math.abs(diff) / Math.abs(p)) * 1000) / 10;
  }

  const direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  // For revenue, sales, production, collected: up is favorable
  // For expenses, outstanding debt, rejected bricks: down is favorable
  const isFavorable = isExpenseOrLiability ? diff <= 0 : diff >= 0;

  let narrative = '';
  const cleanLabel = (metricName || 'performance').toLowerCase();
  if (direction === 'flat') {
    narrative = `Your ${cleanLabel} remained steady compared with the previous period.`;
  } else if (direction === 'up') {
    narrative = `Your ${cleanLabel} was ${percent}% higher than last period (increased by ${percent}%)${isExpenseOrLiability ? ' (unfavourable)' : ''}.`;
  } else {
    narrative = `Your ${cleanLabel} was ${percent}% lower than last period (decreased by ${percent}%)${isExpenseOrLiability ? ' (favourable)' : ''}.`;
  }

  return {
    current: c,
    previous: p,
    diff,
    percent,
    direction,
    isFavorable,
    narrative,
    badgeText: direction === 'flat' ? '0%' : `${diff > 0 ? '+' : '-'}${percent}%`
  };
}

export function groupSales(rows, interval = 'daily') {
  const groups = new Map();
  for (const row of rows) {
    let key = row.date;
    if (interval === 'monthly') key = key.slice(0, 7);
    if (interval === 'weekly') {
      const day = new Date(`${key}T00:00:00Z`).getUTCDay();
      key = shiftDate(key, -((day + 6) % 7));
    }
    const value = groups.get(key) || { date: key, revenue: 0, collected: 0 };
    // SQL supplies decimal totals; accumulate cents to avoid visible floating-point drift.
    value.revenue += Math.round(Number(row.revenue) * 100);
    value.collected += Math.round(Number(row.collected) * 100);
    groups.set(key, value);
  }
  return [...groups.values()].map(r => ({ ...r, revenue: r.revenue / 100, collected: r.collected / 100 }));
}

export function csvText(columns, rows) {
  const escape = value => {
    let s = value == null ? 'Unknown' : String(value);
    if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  return '\ufeff' + [columns.map(c => escape(c.label)).join(','), ...rows.map(r => columns.map(c => escape(r[c.key])).join(','))].join('\r\n');
}

export function downloadCsv(name, columns, rows) {
  const url = URL.createObjectURL(new Blob([csvText(columns, rows)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
