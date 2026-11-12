import { formatDate, formatDateTime, formatMoney, formatPercent, formatPrice, formatQuantity, SIMPLIFIED_VALUATION_NOTICE } from '@nexus/shared';

/**
 * Pure HTML renderers for investor-facing documents. They return a COMPLETE, self-contained,
 * printable document (inline CSS only, no scripts, no external assets), in the "paper" style of
 * client-portal.html (Matanho letterhead, hairline tables). Used by the seed and by the reports module:
 * the generated HTML is frozen into DocumentVersion bytes, so it must never depend on live data.
 *
 * Money arguments accept numbers or numeric strings (API Decimals serialise as strings); they are
 * formatted for display only.
 */

type Num = string | number | null | undefined;

export interface StatementInput {
  /** Document reference printed in the letterhead (e.g. STM-BGF-2026-09-30). */
  reference: string;
  title?: string;
  investor: { name: string; ref?: string; registrationNumber?: string; contactName?: string; address?: string };
  /** YYYY-MM-DD */
  reportingDate: string;
  periodStart?: string;
  currency: string;
  generatedAt?: string | Date;
  preparedBy?: string;
  portfolios: Array<{
    ref: string;
    name: string;
    type?: string;
    openingValue?: Num;
    closingValue: Num;
    periodReturnPct?: Num;
    benchmarkReturnPct?: Num;
  }>;
  holdings: Array<{ portfolio: string; ticker: string; name: string; assetClass: string; quantity: Num; price: Num; marketValue: Num; weightPct?: Num }>;
  activity: Array<{ date: string; portfolio: string; description: string; amount?: Num }>;
  privateCapital?: Array<{ fund: string; commitment: Num; called: Num; unfunded: Num; distributed: Num; nav: Num; irr?: Num; tvpi?: Num; dpi?: Num }>;
  totalValue: Num;
  notes?: string[];
}

export interface NoticeInput {
  kind: 'CALL' | 'DISTRIBUTION';
  reference: string;
  investor: { name: string; ref?: string };
  fund: { name: string; ref?: string };
  /** YYYY-MM-DD */
  issueDate: string;
  /** Call: payment due date. Distribution: value date. */
  dueDate?: string | null;
  amount: Num;
  currency: string;
  commitment: Num;
  /** Called capital BEFORE this notice (calls only) */
  calledBefore?: Num;
  distributedToDate?: Num;
  funding?: { beneficiary?: string; bank?: string; accountMasked?: string; reference?: string };
  generatedAt?: string | Date;
  notes?: string[];
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const e = escapeHtml;
const num = (v: Num): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const STYLE = `
*{box-sizing:border-box}
html{background:#f2f3f5}
body{margin:0;padding:28px 12px;font-family:Inter,"Segoe UI",Helvetica,Arial,sans-serif;color:#16191f;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.paper{max-width:780px;margin:0 auto;background:#fff;padding:48px 56px;border:1px solid #e1e4e8}
.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:16px;margin-bottom:26px}
.brand{font-size:26px;font-weight:800;letter-spacing:-.06em;line-height:1}
.brand small{display:block;font-size:9px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#666;margin-top:6px}
.meta{text-align:right;font-size:10px;color:#555;line-height:1.65}
h1{font-size:21px;margin:0 0 6px;letter-spacing:-.02em}
h2{font-size:11px;text-transform:uppercase;letter-spacing:.09em;margin:26px 0 8px;color:#222}
p{font-size:11px;line-height:1.6;margin:0 0 8px}
.party{font-size:11px;line-height:1.7;margin:10px 0 4px}
table{width:100%;border-collapse:collapse;margin:6px 0 18px}
th{text-align:left;background:#f5f6f8;color:#626b77;font-weight:700;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em}
th,td{padding:8px 9px;border-bottom:1px solid #e8eaed;font-size:10.5px;line-height:1.45;vertical-align:top}
td.r,th.r{text-align:right;font-variant-numeric:tabular-nums}
tr.total td{border-top:1.5px solid #16191f;border-bottom:0;font-weight:700}
.sub{display:block;color:#777;font-size:9.5px;margin-top:2px}
.notice{border:1px solid #dfe3e8;background:#fafbfc;padding:12px 14px;margin:16px 0;font-size:10.5px;line-height:1.55}
.notice strong{letter-spacing:.04em}
.kpis{display:flex;border:1px solid #e1e4e8;margin:12px 0 4px}
.kpis div{flex:1;padding:11px 13px;border-right:1px solid #e1e4e8}
.kpis div:last-child{border-right:0}
.kpis span{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#777}
.kpis b{display:block;font-size:15px;margin-top:4px;font-variant-numeric:tabular-nums}
.foot{margin-top:38px;border-top:1px solid #e4e6e9;padding-top:14px;font-size:9px;color:#777;line-height:1.55}
.up{color:#138a68}.down{color:#b84758}
@page{size:A4;margin:14mm}
@media print{html,body{background:#fff}body{padding:0}.paper{border:0;padding:0;max-width:none}h2{break-after:avoid}table{break-inside:auto}tr{break-inside:avoid}}
@media(max-width:640px){.paper{padding:28px 18px}.kpis{flex-direction:column}.kpis div{border-right:0;border-bottom:1px solid #e1e4e8}}
`;

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title><style>${STYLE}</style></head>
<body><article class="paper">${body}</article></body></html>`;
}

function letterhead(reference: string, dateLine: string, generatedAt?: string | Date): string {
  return `<div class="head"><div class="brand">matanho<small>Investor Services</small></div>
<div class="meta">Document ID ${e(reference)}<br>${e(dateLine)}${generatedAt ? `<br>Generated ${e(formatDateTime(typeof generatedAt === 'string' ? generatedAt : generatedAt.toISOString()))} UTC` : ''}<br>Confidential investor record</div></div>`;
}

const pct = (v: Num) => (v === null || v === undefined || v === '' ? '—' : formatPercent(v, 2, { signed: true }));
const signClass = (v: Num) => (num(v) > 0 ? 'up' : num(v) < 0 ? 'down' : '');

/** Quarterly / periodic investor statement (portfolio summary, holdings, activity, private capital). */
export function renderStatementHtml(input: StatementInput): string {
  const cur = input.currency;
  const money = (v: Num, d = 2) => formatMoney(num(v), cur, { decimals: d });
  const period = input.periodStart ? `${formatDate(input.periodStart)} to ${formatDate(input.reportingDate)}` : `As at ${formatDate(input.reportingDate)}`;

  const portfolioRows = input.portfolios
    .map(
      (p) => `<tr><td><strong>${e(p.name)}</strong><span class="sub">${e(p.ref)}${p.type ? ` · ${e(p.type)}` : ''}</span></td>
<td class="r">${p.openingValue === undefined ? '—' : money(p.openingValue, 0)}</td><td class="r">${money(p.closingValue, 0)}</td>
<td class="r ${signClass(p.periodReturnPct)}">${pct(p.periodReturnPct)}</td><td class="r">${pct(p.benchmarkReturnPct)}</td></tr>`,
    )
    .join('');

  const holdingRows = input.holdings
    .map(
      (h) => `<tr><td><strong>${e(h.ticker)}</strong><span class="sub">${e(h.name)} · ${e(h.portfolio)}</span></td><td>${e(h.assetClass)}</td>
<td class="r">${formatQuantity(num(h.quantity))}</td><td class="r">${formatPrice(num(h.price))}</td><td class="r">${money(h.marketValue, 0)}</td>
<td class="r">${h.weightPct === undefined || h.weightPct === null ? '—' : formatPercent(num(h.weightPct), 1)}</td></tr>`,
    )
    .join('');

  const activityRows = input.activity
    .map(
      (a) => `<tr><td>${e(formatDate(a.date))}</td><td>${e(a.portfolio)}</td><td>${e(a.description)}</td><td class="r">${a.amount === undefined || a.amount === null ? '—' : money(a.amount, 0)}</td></tr>`,
    )
    .join('');

  const priv = input.privateCapital ?? [];
  const privateSection = priv.length
    ? `<h2>Private capital account</h2><table><thead><tr><th>Fund</th><th class="r">Commitment</th><th class="r">Called</th><th class="r">Unfunded</th><th class="r">Distributed</th><th class="r">NAV</th><th class="r">IRR</th><th class="r">TVPI / DPI</th></tr></thead><tbody>${priv
        .map(
          (f) => `<tr><td><strong>${e(f.fund)}</strong></td><td class="r">${money(f.commitment, 0)}</td><td class="r">${money(f.called, 0)}</td><td class="r">${money(f.unfunded, 0)}</td><td class="r">${money(f.distributed, 0)}</td><td class="r">${money(f.nav, 0)}</td><td class="r">${f.irr == null ? '—' : formatPercent(num(f.irr), 1)}</td><td class="r">${f.tvpi == null ? '—' : `${num(f.tvpi).toFixed(2)}x`} / ${f.dpi == null ? '—' : `${num(f.dpi).toFixed(2)}x`}</td></tr>`,
        )
        .join('')}</tbody></table><p>IRR, TVPI and DPI are administrator-reported figures as at the capital account date and are not recalculated in this statement.</p>`
    : '';

  const notes = (input.notes ?? []).map((n) => `<p>${e(n)}</p>`).join('');

  const body = `${letterhead(input.reference, period, input.generatedAt)}
<h1>${e(input.title ?? 'Investor Statement')}</h1>
<div class="party">Investor: <strong>${e(input.investor.name)}</strong>${input.investor.ref ? ` (${e(input.investor.ref)})` : ''}<br>
${input.investor.registrationNumber ? `Registration: ${e(input.investor.registrationNumber)}<br>` : ''}${input.investor.address ? `${e(input.investor.address)}<br>` : ''}Reporting date: <strong>${e(formatDate(input.reportingDate))}</strong> · Reporting currency: <strong>${e(cur)}</strong></div>
<div class="kpis"><div><span>Total value</span><b>${money(input.totalValue, 0)}</b></div><div><span>Mandates</span><b>${input.portfolios.length}</b></div><div><span>Private funds</span><b>${priv.length}</b></div></div>
<h2>Portfolio summary</h2>
<table><thead><tr><th>Mandate</th><th class="r">Opening value</th><th class="r">Closing value</th><th class="r">Period return</th><th class="r">Benchmark</th></tr></thead><tbody>${portfolioRows || '<tr><td colspan="5">No active mandates.</td></tr>'}
<tr class="total"><td>Total mandates</td><td class="r"></td><td class="r">${money(input.portfolios.reduce((a, p) => a + num(p.closingValue), 0), 0)}</td><td class="r"></td><td class="r"></td></tr></tbody></table>
<h2>Holdings</h2>
<table><thead><tr><th>Security</th><th>Asset class</th><th class="r">Quantity</th><th class="r">Price</th><th class="r">Market value</th><th class="r">Weight</th></tr></thead><tbody>${holdingRows || '<tr><td colspan="6">No holdings at the reporting date.</td></tr>'}</tbody></table>
<h2>Activity in the period</h2>
<table><thead><tr><th>Date</th><th>Mandate</th><th>Description</th><th class="r">Amount</th></tr></thead><tbody>${activityRows || '<tr><td colspan="4">No activity recorded in the period.</td></tr>'}</tbody></table>
${privateSection}
<table><tbody><tr class="total"><td>Total value of the relationship</td><td class="r">${money(input.totalValue, 2)}</td></tr></tbody></table>
<div class="notice"><strong>VALUATION BASIS.</strong> ${e(SIMPLIFIED_VALUATION_NOTICE)} Figures are an investor copy for information only.</div>
${notes}
<div class="foot">This document is an authenticated investor copy${input.preparedBy ? `, prepared by ${e(input.preparedBy)}` : ''}. Amounts in the reporting currency are shown for convenience; the governing legal record is the signed source document or custodian record. Matanho Asset Management (Private) Limited.</div>`;

  return shell(`${input.title ?? 'Investor Statement'} · ${input.investor.name}`, body);
}

/** Capital-call or distribution notice. */
export function renderNoticeHtml(input: NoticeInput): string {
  const cur = input.currency;
  const money = (v: Num) => formatMoney(num(v), cur, { decimals: 2 });
  const isCall = input.kind === 'CALL';
  const heading = isCall ? 'CAPITAL CALL NOTICE' : 'DISTRIBUTION NOTICE';
  const amount = num(input.amount);
  const called = num(input.calledBefore);
  const commitment = num(input.commitment);

  const summaryRows = isCall
    ? `<tr><td>Total commitment</td><td class="r">${money(commitment)}</td></tr>
<tr><td>Called capital before this notice</td><td class="r">${money(called)}</td></tr>
<tr><td>Current drawdown</td><td class="r">${money(amount)}</td></tr>
<tr class="total"><td>Remaining unfunded commitment after this call</td><td class="r">${money(commitment - called - amount)}</td></tr>`
    : `<tr><td>Total commitment</td><td class="r">${money(commitment)}</td></tr>
<tr><td>Distributions to date (before this notice)</td><td class="r">${money(input.distributedToDate)}</td></tr>
<tr><td>Current distribution</td><td class="r">${money(amount)}</td></tr>
<tr class="total"><td>Distributions to date (after this notice)</td><td class="r">${money(num(input.distributedToDate) + amount)}</td></tr>`;

  const f = input.funding;
  const instructions = f
    ? `<h2>${isCall ? 'Funding instructions' : 'Payment details'}</h2>
<p>${f.beneficiary ? `Beneficiary: ${e(f.beneficiary)}<br>` : ''}${f.bank ? `Bank: ${e(f.bank)}<br>` : ''}${f.accountMasked ? `Account: ${e(f.accountMasked)}<br>` : ''}${f.reference ? `Reference: ${e(f.reference)}` : ''}</p>`
    : '';

  const body = `${letterhead(input.reference, formatDate(input.issueDate), input.generatedAt)}
<h1>${e(isCall ? `Capital Call Notice ${input.reference}` : `Distribution Notice ${input.reference}`)}</h1>
<div class="party">Investor: <strong>${e(input.investor.name)}</strong>${input.investor.ref ? ` (${e(input.investor.ref)})` : ''}<br>Fund: <strong>${e(input.fund.name)}</strong>${input.fund.ref ? ` (${e(input.fund.ref)})` : ''}</div>
<div class="notice"><strong>${heading}</strong><br>${isCall ? 'Amount due' : 'Distribution amount'}: <strong>${money(amount)}</strong> · ${isCall ? 'Due date' : 'Value date'}: <strong>${input.dueDate ? e(formatDate(input.dueDate)) : '—'}</strong> · Issued: ${e(formatDate(input.issueDate))}</div>
<h2>Capital account summary</h2>
<table><thead><tr><th>Item</th><th class="r">Amount</th></tr></thead><tbody>${summaryRows}</tbody></table>
${instructions}
${isCall ? '<p>Acknowledging this notice in the investor portal confirms receipt only. It is not evidence of payment and does not change your called capital, which is updated by the fund administrator when funds are received.</p>' : ''}
${(input.notes ?? []).map((n) => `<p>${e(n)}</p>`).join('')}
<div class="foot">This portal document is an authenticated investor copy. Amounts may be shown in a reporting currency for convenience; the governing legal record is the signed source document in its original currency.</div>`;

  return shell(`${isCall ? 'Capital call' : 'Distribution'} notice ${input.reference}`, body);
}
