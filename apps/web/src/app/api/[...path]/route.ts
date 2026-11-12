import type { NextRequest } from 'next/server';

/**
 * Same-origin proxy to the NestJS API.
 *  - attaches the httpOnly session cookie as `Authorization: Bearer`
 *  - streams request bodies (multipart uploads) and response bodies (document downloads)
 * Real authorisation is enforced by the API, never here.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Serverless hosts (Vercel) read this: allow up to 60s so a sleeping API (free-tier cold start) can wake up.
export const maxDuration = 60;

const API_URL = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

const FORWARD_REQUEST = ['accept', 'content-type', 'idempotency-key', 'accept-language', 'user-agent'];
const FORWARD_RESPONSE = [
  'content-type',
  'content-disposition',
  'cache-control',
  'x-content-type-options',
  'x-document-sha256',
  'content-security-policy',
  'idempotent-replay',
  'retry-after',
];

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = `${API_URL}/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;

  const headers = new Headers();
  for (const h of FORWARD_REQUEST) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  const token = req.cookies.get('nx_session')?.value;
  if (token) headers.set('authorization', `Bearer ${token}`);
  const fwd = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip');
  if (fwd) headers.set('x-forwarded-for', fwd);

  const init: RequestInit & { duplex?: 'half' } = { method: req.method, headers, redirect: 'manual', cache: 'no-store' };
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
    init.body = req.body;
    init.duplex = 'half';
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return Response.json({ statusCode: 502, message: 'The Matanho API is unreachable. If it was idle, it may be waking up. Retry in a few seconds.' }, { status: 502 });
  }

  const out = new Headers();
  for (const h of FORWARD_RESPONSE) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  return new Response(upstream.status === 204 ? null : upstream.body, { status: upstream.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
