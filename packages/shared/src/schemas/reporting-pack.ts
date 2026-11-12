import { z } from 'zod';
import type { DocumentCategory, RequirementCategory } from '../enums';

/* ──────────────────────────────────────────────────────────────────────────
 * Portfolio-company monthly reporting pack (see company-portal.html).
 * One config drives: the company form, completion %, the server-side submit gate
 * (CMP-003) and the internal review screen. Nothing else hard-codes field names.
 * ────────────────────────────────────────────────────────────────────────── */

export type PackFieldType = 'money' | 'number' | 'percent' | 'text' | 'textarea' | 'date';

export interface PackField {
  key: string;
  label: string;
  type: PackFieldType;
  required: boolean;
  group?: string;
  help?: string;
}

export interface PackColumn {
  key: string;
  label: string;
  type: 'text' | 'money' | 'number' | 'date' | 'select';
  options?: string[];
  required?: boolean;
}

export interface PackRepeater {
  key: string;
  label: string;
  help?: string;
  columns: PackColumn[];
  minRows: number;
}

export interface PackFile {
  key: string;
  label: string;
  help?: string;
  required: boolean;
  category: DocumentCategory;
}

export interface PackSection {
  key: string;
  category: RequirementCategory;
  title: string;
  description: string;
  fields: PackField[];
  repeaters: PackRepeater[];
  files: PackFile[];
}

export const CERTIFICATE_TYPES = ['Tax clearance', 'Insurance', 'Operating licence', 'Regulatory licence', 'Other'] as const;

export const REPORTING_PACK: PackSection[] = [
  {
    key: 'management_accounts',
    category: 'MANAGEMENT_ACCOUNTS',
    title: 'Management accounts',
    description: 'Income statement, balance sheet and cashflow statement',
    fields: [
      { key: 'is_revenue', label: 'Revenue', type: 'money', required: true, group: 'Income statement' },
      { key: 'is_cost_of_sales', label: 'Cost of sales', type: 'money', required: true, group: 'Income statement' },
      { key: 'is_operating_expenses', label: 'Operating expenses', type: 'money', required: true, group: 'Income statement' },
      { key: 'is_net_income', label: 'Net income', type: 'money', required: true, group: 'Income statement' },
      { key: 'bs_total_assets', label: 'Total assets', type: 'money', required: true, group: 'Balance sheet' },
      { key: 'bs_total_liabilities', label: 'Total liabilities', type: 'money', required: true, group: 'Balance sheet' },
      { key: 'bs_total_equity', label: 'Total equity', type: 'money', required: true, group: 'Balance sheet' },
      { key: 'bs_cash', label: 'Cash and equivalents', type: 'money', required: true, group: 'Balance sheet' },
      { key: 'cf_operating', label: 'Operating cashflow', type: 'money', required: true, group: 'Cashflow statement' },
      { key: 'cf_investing', label: 'Investing cashflow', type: 'money', required: true, group: 'Cashflow statement' },
      { key: 'cf_financing', label: 'Financing cashflow', type: 'money', required: true, group: 'Cashflow statement' },
      { key: 'cf_closing_cash', label: 'Closing cash', type: 'money', required: true, group: 'Cashflow statement' },
    ],
    repeaters: [],
    files: [
      { key: 'management_accounts_file', label: 'Management accounts (signed pack)', help: 'PDF or Excel of the approved management accounts', required: true, category: 'MANAGEMENT_ACCOUNTS' },
    ],
  },
  {
    key: 'operating_kpis',
    category: 'OPERATING_KPIS',
    title: 'Operating KPIs',
    description: 'Revenue, active customers, churn and transaction volume',
    fields: [
      { key: 'kpi_revenue', label: 'Revenue', type: 'money', required: true, help: 'Revenue recognised in the period' },
      { key: 'kpi_active_customers', label: 'Active customers', type: 'number', required: true },
      { key: 'kpi_churn_pct', label: 'Customer churn', type: 'percent', required: true, help: 'Monthly churn as a percentage' },
      { key: 'kpi_transaction_volume', label: 'Transaction volume', type: 'money', required: true, help: 'Value processed in the period' },
      { key: 'kpi_commentary', label: 'KPI commentary', type: 'textarea', required: false },
    ],
    repeaters: [],
    files: [],
  },
  {
    key: 'debt_cash',
    category: 'DEBT_CASH',
    title: 'Debt & cash',
    description: 'Bank balances, facilities and maturity schedule',
    fields: [],
    repeaters: [
      {
        key: 'bank_balances',
        label: 'Bank balances',
        minRows: 1,
        columns: [
          { key: 'bank', label: 'Bank', type: 'text', required: true },
          { key: 'currency', label: 'Currency', type: 'select', options: ['USD', 'ZWG', 'ZAR', 'EUR', 'GBP'], required: true },
          { key: 'balance', label: 'Balance', type: 'money', required: true },
        ],
      },
      {
        key: 'facilities',
        label: 'Facilities',
        minRows: 0,
        columns: [
          { key: 'lender', label: 'Lender', type: 'text', required: true },
          { key: 'facility_type', label: 'Facility', type: 'text', required: true },
          { key: 'limit', label: 'Limit', type: 'money', required: true },
          { key: 'drawn', label: 'Drawn', type: 'money', required: true },
          { key: 'maturity_date', label: 'Maturity', type: 'date', required: true },
        ],
      },
      {
        key: 'maturity_schedule',
        label: 'Maturity schedule',
        minRows: 0,
        columns: [
          { key: 'due_date', label: 'Due date', type: 'date', required: true },
          { key: 'amount', label: 'Amount', type: 'money', required: true },
          { key: 'description', label: 'Description', type: 'text', required: false },
        ],
      },
    ],
    files: [{ key: 'bank_statements', label: 'Bank statements (optional)', required: false, category: 'REPORTING_SUPPORT' }],
  },
  {
    key: 'board_pack',
    category: 'BOARD_PACK',
    title: 'Board pack',
    description: 'Latest approved board report and supporting files',
    fields: [{ key: 'board_commentary', label: 'Board commentary', type: 'textarea', required: false }],
    repeaters: [],
    files: [
      { key: 'board_report', label: 'Board report', help: 'Latest approved board materials', required: true, category: 'BOARD_PACK' },
      { key: 'board_support', label: 'Supporting files (optional)', required: false, category: 'BOARD_PACK' },
    ],
  },
  {
    key: 'compliance',
    category: 'COMPLIANCE',
    title: 'Compliance',
    description: 'Compliance certificates, expiring documents and supporting evidence',
    fields: [],
    repeaters: [
      {
        key: 'certificates',
        label: 'Compliance certificates',
        help: 'Tax clearance, insurance and key licences. Expiry within 60 days is flagged.',
        minRows: 1,
        columns: [
          { key: 'certificate_type', label: 'Certificate', type: 'select', options: [...CERTIFICATE_TYPES], required: true },
          { key: 'reference', label: 'Reference', type: 'text', required: true },
          { key: 'expiry_date', label: 'Expiry date', type: 'date', required: true },
        ],
      },
    ],
    files: [{ key: 'compliance_evidence', label: 'Compliance evidence', help: 'Certificates and supporting evidence', required: true, category: 'COMPLIANCE_EVIDENCE' }],
  },
];

export const PACK_FILE_KEYS = REPORTING_PACK.flatMap((s) => s.files.map((f) => f.key));

// ── values & completion ─────────────────────────────────────────────────────
export type PackValues = Record<string, unknown>;

function isFilled(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return Number.isFinite(v);
  return true;
}

function rowIsComplete(row: Record<string, unknown>, cols: PackColumn[]): boolean {
  return cols.filter((c) => c.required).every((c) => isFilled(row?.[c.key]));
}

export interface SectionCompletion {
  key: string;
  title: string;
  category: RequirementCategory;
  total: number;
  done: number;
  complete: boolean;
  missing: string[];
}
export interface PackCompletion {
  percent: number; // 0–100
  total: number;
  done: number;
  complete: boolean;
  sections: SectionCompletion[];
  outstanding: string[];
}

/**
 * Completion is computed from the ACTUAL required records, never from a stored flag:
 * required scalar fields, required repeater rows, required file slots.
 * @param fileKeys keys of file slots that have at least one uploaded document
 */
export function computePackCompletion(values: PackValues, fileKeys: readonly string[]): PackCompletion {
  const sections: SectionCompletion[] = REPORTING_PACK.map((s) => {
    let total = 0;
    let done = 0;
    const missing: string[] = [];

    for (const f of s.fields.filter((x) => x.required)) {
      total++;
      if (isFilled(values[f.key])) done++;
      else missing.push(f.label);
    }
    for (const r of s.repeaters.filter((x) => x.minRows > 0)) {
      total++;
      const rows = Array.isArray(values[r.key]) ? (values[r.key] as Record<string, unknown>[]) : [];
      const ok = rows.filter((row) => rowIsComplete(row, r.columns)).length >= r.minRows;
      if (ok) done++;
      else missing.push(r.label);
    }
    for (const f of s.files.filter((x) => x.required)) {
      total++;
      if (fileKeys.includes(f.key)) done++;
      else missing.push(f.label);
    }
    return { key: s.key, title: s.title, category: s.category, total, done, complete: total > 0 && done === total, missing };
  });

  const total = sections.reduce((a, s) => a + s.total, 0);
  const done = sections.reduce((a, s) => a + s.done, 0);
  return {
    percent: total ? Math.round((done / total) * 100) : 0,
    total,
    done,
    complete: total > 0 && done === total,
    sections,
    outstanding: sections.flatMap((s) => s.missing.map((m) => `${s.title}: ${m}`)),
  };
}

/** Light validation for saving drafts: type-checks whatever is supplied, rejects unknown keys. */
export function validatePackValues(values: PackValues): Record<string, string> {
  const errors: Record<string, string> = {};
  const fields = new Map(REPORTING_PACK.flatMap((s) => s.fields).map((f) => [f.key, f]));
  const repeaters = new Map(REPORTING_PACK.flatMap((s) => s.repeaters).map((r) => [r.key, r]));

  for (const [key, v] of Object.entries(values)) {
    const f = fields.get(key);
    const r = repeaters.get(key);
    if (f) {
      if (v === null || v === undefined || v === '') continue;
      if (['money', 'number', 'percent'].includes(f.type) && (typeof v !== 'number' || !Number.isFinite(v))) errors[key] = `${f.label} must be a number`;
      if (f.type === 'percent' && typeof v === 'number' && (v < 0 || v > 100)) errors[key] = `${f.label} must be between 0 and 100`;
      if (['text', 'textarea', 'date'].includes(f.type) && typeof v !== 'string') errors[key] = `${f.label} must be text`;
    } else if (r) {
      if (!Array.isArray(v)) errors[key] = `${r.label} must be a list`;
    } else {
      errors[key] = `Unknown field "${key}"`;
    }
  }
  return errors;
}

export const savePackValuesSchema = z.object({
  values: z.record(z.string(), z.unknown()),
});

export interface CertificateStatus {
  total: number;
  current: number;
  expiring: number; // within 60 days
  expired: number;
}

/** Covenant / compliance evidence status derived from certificate expiry dates. */
export function certificateStatus(certificates: unknown, now: Date = new Date()): CertificateStatus {
  const rows = Array.isArray(certificates) ? (certificates as Record<string, unknown>[]) : [];
  let current = 0;
  let expiring = 0;
  let expired = 0;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (const r of rows) {
    const d = typeof r.expiry_date === 'string' ? Date.parse(r.expiry_date) : NaN;
    if (Number.isNaN(d)) continue;
    const days = Math.round((d - today) / 86400000);
    if (days < 0) expired++;
    else if (days <= 60) {
      expiring++;
      current++;
    } else current++;
  }
  return { total: rows.length, current, expiring, expired };
}
