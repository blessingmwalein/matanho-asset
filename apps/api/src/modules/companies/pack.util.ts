import { Prisma } from '@prisma/client';
import {
  REPORTING_PACK,
  certificateStatus,
  computePackCompletion,
  type PackCompletion,
  type PackValues,
  type RequirementStatus,
} from '@nexus/shared';

/** Reporting-pack helpers shared by the company portal and the internal review workspace. */

export const FIELD_BY_KEY = new Map(REPORTING_PACK.flatMap((s) => s.fields).map((f) => [f.key, f]));
export const REPEATER_BY_KEY = new Map(REPORTING_PACK.flatMap((s) => s.repeaters).map((r) => [r.key, r]));
export const FILE_BY_KEY = new Map(REPORTING_PACK.flatMap((s) => s.files.map((f) => [f.key, { ...f, sectionKey: s.key }] as const)));
export const SECTION_KEYS = new Set(REPORTING_PACK.map((s) => s.key));

/** Statuses in which the company may still change values / files. */
export const EDITABLE_STATUSES = ['DRAFT', 'CORRECTIONS_REQUESTED', 'QUESTIONS_OPEN'] as const;
/** Statuses in which the pack is awaiting (or in) internal review. */
export const REVIEWABLE_STATUSES = ['SUBMITTED', 'RESUBMITTED', 'QUESTIONS_OPEN'] as const;

export const isFilled = (v: unknown): boolean => {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.length > 0;
  return true;
};

export type StoredValue = { key: string; valueNumber: Prisma.Decimal | null; valueText: string | null; valueJson: Prisma.JsonValue | null };

/** DB rows → plain values (numbers as JS numbers, repeaters as arrays). */
export function decodeValues(rows: StoredValue[]): PackValues {
  const out: PackValues = {};
  for (const r of rows) {
    if (REPEATER_BY_KEY.has(r.key)) out[r.key] = Array.isArray(r.valueJson) ? r.valueJson : [];
    else if (r.valueNumber !== null) out[r.key] = Number(r.valueNumber);
    else if (r.valueText !== null) out[r.key] = r.valueText;
  }
  return out;
}

export type EncodedValue =
  | { remove: true }
  | { remove: false; valueNumber: Prisma.Decimal | null; valueText: string | null; valueJson: Prisma.InputJsonValue | typeof Prisma.DbNull };

/** Plain value → storage columns (numbers → valueNumber, strings → valueText, repeaters → valueJson). */
export function encodeValue(key: string, v: unknown): EncodedValue {
  const rep = REPEATER_BY_KEY.get(key);
  if (rep) {
    const rows = (Array.isArray(v) ? v : []).filter((row) => row && typeof row === 'object' && Object.values(row as Record<string, unknown>).some(isFilled));
    if (!rows.length) return { remove: true };
    return { remove: false, valueNumber: null, valueText: null, valueJson: JSON.parse(JSON.stringify(rows)) as Prisma.InputJsonValue };
  }
  if (!isFilled(v)) return { remove: true };
  const f = FIELD_BY_KEY.get(key);
  if (f && ['money', 'number', 'percent'].includes(f.type)) return { remove: false, valueNumber: new Prisma.Decimal(v as number), valueText: null, valueJson: Prisma.DbNull };
  return { remove: false, valueNumber: null, valueText: String(v).trim(), valueJson: Prisma.DbNull };
}

export interface SectionState {
  key: string;
  status: RequirementStatus;
}

/** Completion is derived from the actual stored values and uploaded file slots (never from a flag). */
export function analysePack(values: PackValues, fileKeys: readonly string[]) {
  const completion: PackCompletion = computePackCompletion(values, fileKeys);
  const sections: SectionState[] = REPORTING_PACK.map((s) => {
    const c = completion.sections.find((x) => x.key === s.key)!;
    const hasAny = s.fields.some((f) => isFilled(values[f.key])) || s.repeaters.some((r) => isFilled(values[r.key])) || s.files.some((f) => fileKeys.includes(f.key));
    return { key: s.key, status: c.complete ? 'COMPLETE' : hasAny ? 'IN_PROGRESS' : 'PENDING' };
  });
  return { completion, sections, certificates: certificateStatus(values.certificates) };
}

/** Per-category task rows for the "What needs attention" list. */
export function buildTasks(completion: PackCompletion, certificates: ReturnType<typeof certificateStatus>, sections: SectionState[]) {
  return REPORTING_PACK.map((s) => {
    const c = completion.sections.find((x) => x.key === s.key)!;
    const state = sections.find((x) => x.key === s.key)!.status;
    let status: 'COMPLETE' | 'DUE' | 'IN_PROGRESS' | 'EXPIRING' | 'EXPIRED' = 'DUE';
    let label = 'Due';
    if (c.complete) {
      status = 'COMPLETE';
      label = 'Complete';
      if (s.key === 'compliance') {
        if (certificates.expired > 0) {
          status = 'EXPIRED';
          label = `${certificates.expired} expired`;
        } else if (certificates.expiring > 0) {
          status = 'EXPIRING';
          label = `${certificates.expiring} expiring`;
        }
      }
    } else if (state === 'IN_PROGRESS') {
      status = 'IN_PROGRESS';
      label = `${c.missing.length} remaining`;
    }
    return { key: s.key, category: s.category, title: s.title, description: s.description, status, label, remaining: c.missing.length, missing: c.missing };
  });
}
