import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60; // see [...path]/route.ts

const API_URL = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const MAX_AGE = 60 * 60 * 8; // matches JWT_EXPIRES_IN default (8h)

/**
 * Login: exchanges credentials for a JWT and stores it in an httpOnly cookie.
 * The token is never exposed to JavaScript and never written to localStorage.
 */
export async function POST(req: NextRequest) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ statusCode: 400, message: 'Invalid request' }, { status: 400 });
  }

  let upstream: Response;
  try {
    const fwd = req.headers.get('x-forwarded-for');
    upstream = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(fwd ? { 'x-forwarded-for': fwd } : {}) },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json({ statusCode: 502, message: 'The Matanho API is unreachable. If it was idle, it may be waking up. Retry in a few seconds.' }, { status: 502 });
  }

  const data = (await upstream.json().catch(() => ({}))) as { accessToken?: string; user?: { organisation: { type: string }; homePath: string }; message?: string };
  if (!upstream.ok || !data.accessToken || !data.user) {
    return NextResponse.json(data, { status: upstream.status === 200 ? 500 : upstream.status });
  }

  const secure = process.env.NODE_ENV === 'production';
  const res = NextResponse.json({ user: data.user });
  res.cookies.set('nx_session', data.accessToken, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: MAX_AGE });
  // Non-sensitive hint used only by middleware to route users to their own portal (API still enforces access).
  res.cookies.set('nx_portal', data.user.organisation.type, { httpOnly: false, sameSite: 'lax', secure, path: '/', maxAge: MAX_AGE });
  return res;
}
