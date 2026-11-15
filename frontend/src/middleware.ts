import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session';

/**
 * Cheap gate for pages: no session cookie → login. The API still validates the token (and the user's
 * current role/status) on every request, so this is UX, not the security boundary.
 */
export function middleware(req: NextRequest) {
  if (req.cookies.get(SESSION_COOKIE)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = req.nextUrl.pathname === '/' ? '' : `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // everything except the login page, the BFF proxy (returns JSON 401 itself) and static assets
  matcher: ['/((?!login|bff|_next/static|_next/image|favicon.ico).*)'],
};
