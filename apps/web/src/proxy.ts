import { NextResponse, type NextRequest } from 'next/server';

// Session cookie names set by the API. Kept inline: proxy code must not rely on shared modules.
const SESSION_COOKIES = ['__Secure-hms_session', 'hms_session'];

/**
 * The only job of this file (CLAUDE.md section 3, `middleware.ts` before Next.js 16 renamed it):
 * redirect to /login when there is no session cookie. It never checks permissions or validates the
 * session; the API does that on every request.
 */
export function proxy(request: NextRequest): NextResponse {
  if (SESSION_COOKIES.some((name) => request.cookies.has(name))) {
    return NextResponse.next();
  }
  const login = new URL('/login', request.url);
  const { pathname } = request.nextUrl;
  // The path only, never the query string: patient details must not travel in URLs.
  if (pathname !== '/') login.searchParams.set('next', pathname);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except the login page, Next.js assets and public files.
  matcher: ['/((?!login$|login/|_next/static|_next/image|favicon\\.ico$|robots\\.txt$).*)'],
};
