// Used by proxy.ts. No imports, so the proxy bundle stays free of app code.

/** A fresh, unguessable value for every page request. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * CLAUDE.md section 9. Scripts run only with this request's nonce, which Next.js adds to its own
 * scripts; 'strict-dynamic' lets those load the page's chunks. Styles keep 'unsafe-inline' because
 * React style attributes cannot carry a nonce, and a nonce in style-src would switch 'unsafe-inline' off.
 */
export function contentSecurityPolicy(nonce: string, options: { apiOrigin: string; isDev: boolean }): string {
  return [
    "default-src 'self'",
    // React uses eval for better error stacks in development only.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${options.isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self' ${options.apiOrigin}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // No upgrade-insecure-requests: HSTS already forces HTTPS in production, and the directive would
    // break a production build served over http://localhost (CI and local Docker runs).
  ].join('; ');
}
