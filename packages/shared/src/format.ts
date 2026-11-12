/**
 * Display formatters. The API serialises Decimal values as strings; these helpers
 * only convert for DISPLAY. Never do financial arithmetic on the result.
 */

type Numeric = string | number | null | undefined;

function toNumber(v: Numeric): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

const CURRENCY_SYMBOL: Record<string, string> = { USD: 'US$', ZAR: 'R', ZWG: 'ZWG ', GBP: '£', EUR: '€' };

export function currencySymbol(currency = 'USD'): string {
  return CURRENCY_SYMBOL[currency] ?? `${currency} `;
}

/** Full money: "US$ 11,860,000.00" */
export function formatMoney(value: Numeric, currency = 'USD', opts?: { decimals?: number; fxRate?: number }): string {
  const n = toNumber(value);
  if (n === null) return '—';
  const decimals = opts?.decimals ?? 2;
  const v = n * (opts?.fxRate ?? 1);
  const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${v < 0 ? '−' : ''}${currencySymbol(currency)}${currency === 'ZWG' ? '' : ' '}${abs}`.replace('  ', ' ');
}

/** Compact money: "US$ 11.86M", "US$ 250k" */
export function formatCompactMoney(value: Numeric, currency = 'USD', opts?: { fxRate?: number; digits?: number }): string {
  const n = toNumber(value);
  if (n === null) return '—';
  const v = n * (opts?.fxRate ?? 1);
  const sym = currencySymbol(currency);
  const sp = currency === 'ZWG' ? '' : ' ';
  const sign = v < 0 ? '−' : '';
  const abs = Math.abs(v);
  const d = opts?.digits ?? 2;
  if (abs >= 1e9) return `${sign}${sym}${sp}${(abs / 1e9).toFixed(d)}B`;
  if (abs >= 1e6) return `${sign}${sym}${sp}${(abs / 1e6).toFixed(d)}M`;
  if (abs >= 1e3) return `${sign}${sym}${sp}${(abs / 1e3).toFixed(abs >= 1e5 ? 0 : 1)}k`;
  return `${sign}${sym}${sp}${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function formatNumber(value: Numeric, decimals = 0): string {
  const n = toNumber(value);
  if (n === null) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Quantities: up to 6 dp, trims trailing zeros. */
export function formatQuantity(value: Numeric): string {
  const n = toNumber(value);
  if (n === null) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

/** Prices: min 2, max 6 dp. */
export function formatPrice(value: Numeric): string {
  const n = toNumber(value);
  if (n === null) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

export function formatPercent(value: Numeric, decimals = 2, opts?: { signed?: boolean }): string {
  const n = toNumber(value);
  if (n === null) return '—';
  const s = `${Math.abs(n).toFixed(decimals)}%`;
  if (n < 0) return `−${s}`;
  return opts?.signed && n > 0 ? `+${s}` : s;
}

export function formatMultiple(value: Numeric): string {
  const n = toNumber(value);
  return n === null ? '—' : `${n.toFixed(2)}x`;
}

type DateInput = string | Date | null | undefined;

function toDate(d: DateInput): Date | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "31 Aug 2026" (UTC so seeded dates never shift by timezone) */
export function formatDate(d: DateInput): string {
  const date = toDate(d);
  if (!date) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** "31 Aug 2026, 14:05" */
export function formatDateTime(d: DateInput): string {
  const date = toDate(d);
  if (!date) return '—';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
}

/** Whole days from today (UTC) to date; negative if past. */
export function daysUntil(d: DateInput, now: Date = new Date()): number | null {
  const date = toDate(d);
  if (!date) return null;
  const a = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((a - b) / 86400000);
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1]![0] : '')).toUpperCase() || '?';
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
