// Cookie names set by the API (apps/api/src/auth/auth-cookies.ts). Production adds the __Secure- prefix.
export const SESSION_COOKIES = ['__Secure-hms_session', 'hms_session'] as const;
export const CSRF_COOKIES = ['__Secure-hms_csrf', 'hms_csrf'] as const;

/** Light or dark, chosen by the user. Not a secret, so the browser sets it. */
export const THEME_COOKIE = 'hms_theme';

/** Reads a cookie from a `document.cookie` style string. */
export function readCookie(cookieHeader: string, name: string): string | undefined {
  for (const part of cookieHeader.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

/** The CSRF token the API set, which every POST, PUT, PATCH and DELETE must echo in X-CSRF-Token. */
export function readCsrfToken(cookieHeader: string): string | undefined {
  for (const name of CSRF_COOKIES) {
    const value = readCookie(cookieHeader, name);
    if (value !== undefined && value !== '') return value;
  }
  return undefined;
}
