import type { ReportColumn, ReportResult } from './report-definitions';

const csvCell = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // neutralise spreadsheet formula injection for text cells that start with = + - @
  const safe = /^[=+\-@]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** UTF-8 CSV with BOM so Excel opens it correctly. Raw (unformatted) values. */
export function toCsv(r: ReportResult): string {
  const lines = [r.columns.map((c) => csvCell(c.label)).join(',')];
  for (const row of r.rows) lines.push(r.columns.map((c) => csvCell(row[c.key])).join(','));
  if (r.totals) lines.push(r.columns.map((c) => csvCell(r.totals![c.key])).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function cellHtml(c: ReportColumn, v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  switch (c.type) {
    case 'money':
      return Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : esc(v);
    case 'number':
      return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 6 }) : esc(v);
    case 'percent':
      return Number.isFinite(n) ? `${n.toFixed(2)}%` : esc(v);
    case 'date':
      return esc(String(v).slice(0, 10));
    case 'datetime':
      return esc(String(v).replace('T', ' ').slice(0, 16));
    default:
      return esc(v);
  }
}

/** Self-contained printable HTML (opened in a new tab and printed / saved as PDF by the browser). */
export function toHtml(r: ReportResult): string {
  const right = (c: ReportColumn) => (c.type === 'money' || c.type === 'number' || c.type === 'percent' ? ' class="r"' : '');
  const head = r.columns.map((c) => `<th${right(c)}>${esc(c.label)}</th>`).join('');
  const body = r.rows.map((row) => `<tr>${r.columns.map((c) => `<td${right(c)}>${cellHtml(c, row[c.key])}</td>`).join('')}</tr>`).join('');
  const foot = r.totals ? `<tr class="t">${r.columns.map((c) => `<td${right(c)}>${r.totals![c.key] === undefined ? '' : cellHtml(c, r.totals![c.key])}</td>`).join('')}</tr>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(r.title)}</title>
<style>
body{font-family:Inter,Arial,sans-serif;color:#0f1b2d;margin:32px;font-size:11px}
.brand{font-weight:800;font-size:20px;letter-spacing:-.05em}
.meta{color:#667180;margin:2px 0 18px}
h1{font-size:18px;margin:14px 0 4px;letter-spacing:-.02em}
table{border-collapse:collapse;width:100%}
th{text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#667180;background:#faf9f7;border-bottom:1.5px solid #0f1b2d;padding:7px 8px}
td{padding:7px 8px;border-bottom:1px solid #e3e1db;vertical-align:top}
.r{text-align:right;font-variant-numeric:tabular-nums}
tr.t td{font-weight:700;border-top:1.5px solid #0f1b2d;border-bottom:0}
.foot{margin-top:18px;color:#8b94a1;font-size:9.5px}
@media print{body{margin:14mm}}
</style></head><body>
<div class="brand">matanho</div>
<h1>${esc(r.title)}</h1>
<div class="meta">${esc(r.description)}<br>Generated ${esc(r.generatedAt.replace('T', ' ').slice(0, 16))} UTC · ${r.rows.length} row(s)</div>
<table><thead><tr>${head}</tr></thead><tbody>${body}${foot}</tbody></table>
<div class="foot">Confidential. Synthetic demonstration data. MVP valuation model: market value = quantity × price.</div>
</body></html>`;
}
