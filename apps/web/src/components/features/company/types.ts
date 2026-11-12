import {
  REPORTING_PACK,
  certificateStatus,
  type CertificateStatus,
  type CompanySubmissionStatus,
  type PackCompletion,
  type PackRepeater,
} from '@nexus/shared';

export interface FileVersion {
  versionNo: number;
  fileName: string;
  sizeBytes: number;
  uploadedByName: string | null;
  createdAt: string;
}

export interface FileDoc {
  id: string;
  ref: string;
  title: string;
  category: string;
  requirementKey: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  versionNo: number;
  uploadedAt: string;
  uploadedByName: string | null;
  versions: FileVersion[];
}

export interface QuestionView {
  id: string;
  requirementKey: string | null;
  question: string;
  raisedByName: string | null;
  createdAt: string;
  answer: string | null;
  answeredByName: string | null;
  answeredAt: string | null;
  status: 'OPEN' | 'ANSWERED' | 'CLOSED';
  closedAt: string | null;
  attachments: FileDoc[];
}

export interface PeriodDetail {
  period: { id: string; label: string; periodStart: string; periodEnd: string; dueDate: string; status: 'OPEN' | 'CLOSED' };
  company: { id: string; name: string; ref: string; sector: string | null; fundName: string | null };
  submission: {
    id: string | null;
    ref: string | null;
    status: CompanySubmissionStatus;
    version: number;
    completionPct: number;
    submittedAt: string | null;
    submittedByName: string | null;
    reviewedAt: string | null;
    reviewedByName: string | null;
    reviewNote: string | null;
  };
  editable: boolean;
  currency: string;
  values: Record<string, unknown>;
  files: Record<string, FileDoc[]>;
  questions: QuestionView[];
  requirements: Array<{ key: string; category: string; title: string; status: string }>;
  completion: PackCompletion;
  sectionStatus: Record<string, string>;
  certificates: CertificateStatus;
}

export interface PeriodListRow {
  id: string;
  label: string;
  dueDate: string;
  status: CompanySubmissionStatus;
  completionPct: number;
}

export interface Dashboard {
  company: { id: string; name: string; sector: string | null; fundName: string | null } | null;
  periods: PeriodListRow[];
  selected: { id: string; label: string; periodEnd: string; dueDate: string; status: CompanySubmissionStatus; version: number; editable: boolean } | null;
  needsAction: Array<{ id: string; label: string; status: CompanySubmissionStatus; openQuestions: number; completionPct: number }>;
  reviewNote?: string | null;
}

export type FV = Record<string, any>;

export const emptyRow = (r: PackRepeater): Record<string, unknown> =>
  Object.fromEntries(r.columns.map((c) => [c.key, c.type === 'select' ? (c.options?.[0] ?? '') : c.type === 'money' || c.type === 'number' ? undefined : '']));

/** Server values → form values (repeaters with a required minimum start with one empty row). */
export function toFormValues(values: Record<string, unknown>): FV {
  const out: FV = {};
  for (const s of REPORTING_PACK) {
    for (const f of s.fields) out[f.key] = values[f.key] ?? (f.type === 'text' || f.type === 'textarea' || f.type === 'date' ? '' : undefined);
    for (const r of s.repeaters) {
      const rows = Array.isArray(values[r.key]) ? (values[r.key] as unknown[]) : [];
      out[r.key] = rows.length ? rows : r.minRows > 0 ? [emptyRow(r)] : [];
    }
  }
  return out;
}

const isFilled = (v: unknown) => v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '') && !(typeof v === 'number' && !Number.isFinite(v));

/** Form values → API payload. Cleared fields become null (the API removes them); untouched blank rows are dropped. */
export function toPayload(values: FV): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const s of REPORTING_PACK) {
    for (const f of s.fields) out[f.key] = isFilled(values[f.key]) ? values[f.key] : null;
    for (const r of s.repeaters) {
      const rows = (Array.isArray(values[r.key]) ? values[r.key] : []) as Array<Record<string, unknown>>;
      out[r.key] = rows.filter((row) => r.columns.some((c) => c.type !== 'select' && isFilled(row?.[c.key])));
    }
  }
  return out;
}

export type TaskStatus = 'COMPLETE' | 'DUE' | 'IN_PROGRESS' | 'EXPIRING' | 'EXPIRED';
export interface Task {
  key: string;
  title: string;
  description: string;
  status: TaskStatus;
  label: string;
  missing: string[];
}

/** Per-category task rows for "What needs attention", derived live from the form so they react as the user types. */
export function buildTasks(completion: PackCompletion, certs: CertificateStatus): Task[] {
  return REPORTING_PACK.map((s) => {
    const c = completion.sections.find((x) => x.key === s.key)!;
    let status: TaskStatus = 'DUE';
    let label = 'Due';
    if (c.complete) {
      status = 'COMPLETE';
      label = 'Complete';
      if (s.key === 'compliance') {
        if (certs.expired > 0) {
          status = 'EXPIRED';
          label = `${certs.expired} expired`;
        } else if (certs.expiring > 0) {
          status = 'EXPIRING';
          label = `${certs.expiring} expiring`;
        }
      }
    } else if (c.done > 0) {
      status = 'IN_PROGRESS';
      label = `${c.total - c.done} remaining`;
    }
    return { key: s.key, title: s.title, description: s.description, status, label, missing: c.missing };
  });
}

export { certificateStatus };
