import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const API_URL = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

export async function POST(req: NextRequest) {
  const token = req.cookies.get('nx_session')?.value;
  if (token) {
    // best effort: records LOGOUT in the audit trail
    await fetch(`${API_URL}/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, cache: 'no-store' }).catch(() => undefined);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete('nx_session');
  res.cookies.delete('nx_portal');
  return res;
}
