/**
 * Browser → Next.js proxy → NestJS API.
 * Every request goes to same-origin `/api/*`; the proxy attaches the httpOnly session cookie as a Bearer token.
 * The API is the only authority: this client never decides access.
 */

export class ApiError extends Error {
  status: number;
  /** Field-level validation errors keyed by path, when the API returns them */
  errors?: Record<string, string>;
  constructor(message: string, status: number, errors?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
  query?: Query;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export function buildQuery(query?: Query): string {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form; // browser sets multipart boundary
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(`/api${path.startsWith('/') ? path : `/${path}`}${buildQuery(opts.query)}`, {
      method: opts.method ?? (body ? 'POST' : 'GET'),
      headers,
      body,
      credentials: 'same-origin',
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError('Network error. Check your connection and try again. Your data has not been lost.', 0);
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const d = (data ?? {}) as { message?: string | string[]; errors?: Record<string, string> };
    const message = Array.isArray(d.message) ? d.message.join(', ') : (d.message ?? `Request failed (${res.status})`);
    if (res.status === 401 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/apply')) {
      window.location.assign(`/login?expired=1&next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    }
    throw new ApiError(message, res.status, d.errors);
  }
  return data as T;
}

/** Same-origin URL for a document's bytes (cookie auth is attached by the proxy). */
export function documentUrl(id: string, opts?: { version?: number; inline?: boolean }): string {
  const p = new URLSearchParams();
  if (opts?.version) p.set('version', String(opts.version));
  p.set('disposition', opts?.inline ? 'inline' : 'attachment');
  return `/api/documents/${id}/content?${p.toString()}`;
}

/** Standard paginated list response. */
export interface Paged<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

/** Maps API field errors onto react-hook-form (use with form.setError). */
export function applyFieldErrors(
  err: unknown,
  setError: (name: never, error: { type: string; message: string }) => void,
): boolean {
  if (err instanceof ApiError && err.errors) {
    for (const [path, message] of Object.entries(err.errors)) {
      if (path !== '_') setError(path as never, { type: 'server', message });
    }
    return true;
  }
  return false;
}
