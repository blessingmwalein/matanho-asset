import type { DraftIdentity } from './types';

/**
 * localStorage holds ONLY a convenience pointer to the draft ({reference, token}) so the applicant
 * can come back on the same device. All application data lives in the API; nothing here is a data store.
 */
const KEY = 'nx.apply.pointer';

export function readPointer(): DraftIdentity | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<DraftIdentity>;
    return p.reference && p.token ? { reference: p.reference, token: p.token } : null;
  } catch {
    return null;
  }
}

export function writePointer(p: DraftIdentity): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: the resume link still works */
  }
}

export function clearPointer(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function resumeUrl(p: DraftIdentity): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/apply?ref=${encodeURIComponent(p.reference)}&token=${encodeURIComponent(p.token)}`;
}

/** URL of the applicant's own uploaded file (token-authorised public endpoint). */
export function applicantDocUrl(p: DraftIdentity, documentId: string, opts?: { version?: number; download?: boolean }): string {
  const q = new URLSearchParams({ token: p.token });
  if (opts?.version) q.set('version', String(opts.version));
  if (opts?.download) q.set('disposition', 'attachment');
  return `/api/public/applications/${encodeURIComponent(p.reference)}/documents/${encodeURIComponent(documentId)}/content?${q.toString()}`;
}
