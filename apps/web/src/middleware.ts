import { NextResponse, type NextRequest } from 'next/server';

/**
 * UX-level routing only. The API enforces real access on every request.
 *  - unauthenticated visitors to a portal are sent to /login
 *  - users who open another portal are redirected to their own
 */
const PORTAL_FOR_PREFIX: Array<{ prefix: string; orgType: string }> = [
  { prefix: '/internal', orgType: 'ASSET_MANAGER' },
  { prefix: '/portal', orgType: 'INVESTOR' },
  { prefix: '/custodian', orgType: 'CUSTODIAN' },
  { prefix: '/company', orgType: 'PORTFOLIO_COMPANY' },
];

const HOME: Record<string, string> = {
  ASSET_MANAGER: '/internal/dashboard',
  INVESTOR: '/portal/overview',
  CUSTODIAN: '/custodian',
  PORTFOLIO_COMPANY: '/company',
};

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = req.cookies.get('nx_session')?.value;
  const orgType = req.cookies.get('nx_portal')?.value;

  if (pathname === '/') {
    const url = req.nextUrl.clone();
    url.pathname = session && orgType && HOME[orgType] ? HOME[orgType]! : '/login';
    return NextResponse.redirect(url);
  }

  if (pathname === '/login' && session && orgType && HOME[orgType]) {
    const url = req.nextUrl.clone();
    url.pathname = HOME[orgType]!;
    url.search = '';
    return NextResponse.redirect(url);
  }

  const portal = PORTAL_FOR_PREFIX.find((p) => pathname === p.prefix || pathname.startsWith(`${p.prefix}/`));
  if (portal) {
    if (!session) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
      return NextResponse.redirect(url);
    }
    if (orgType && orgType !== portal.orgType && HOME[orgType]) {
      const url = req.nextUrl.clone();
      url.pathname = HOME[orgType]!;
      url.search = '';
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  // exclude API routes (avoids body cloning limits), Next internals and static files
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)'],
};
