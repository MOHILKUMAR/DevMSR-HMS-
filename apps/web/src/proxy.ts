import { NextResponse, type NextRequest } from 'next/server';
import { contentSecurityPolicy, createNonce } from './content-security-policy';

// Session cookie names set by the API. Kept inline: the proxy imports nothing from src/lib.
const SESSION_COOKIES = ['__Secure-hms_session', 'hms_session'];
// The browser calls the API directly, so the CSP must allow its origin.
const API_ORIGIN = new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').origin;
const IS_DEV = process.env.NODE_ENV === 'development';

/**
 * The two jobs of this file (CLAUDE.md section 3, `middleware.ts` before Next.js 16 renamed it):
 * 1. Redirect to /login when there is no session cookie. It never checks permissions or validates
 *    the session; the API does that on every request.
 * 2. Give every page a fresh CSP nonce. Next.js reads it from the request's CSP header and puts it
 *    on its scripts, so no inline script without it can run (docs/decisions.md).
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const isLogin = pathname === '/login' || pathname.startsWith('/login/');

  if (!isLogin && !SESSION_COOKIES.some((name) => request.cookies.has(name))) {
    const login = new URL('/login', request.url);
    // The path only, never the query string: patient details must not travel in URLs.
    if (pathname !== '/') login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  const policy = contentSecurityPolicy(createNonce(), { apiOrigin: API_ORIGIN, isDev: IS_DEV });
  const headers = new Headers(request.headers);
  headers.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  // Every page, the login page included. Not Next.js assets or public files, which run no scripts.
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico$|robots\\.txt$).*)'],
};
