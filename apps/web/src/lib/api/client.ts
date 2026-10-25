import createClient from 'openapi-fetch';
import { readCsrfToken } from '../cookies';
import { browserApiOrigin } from '../env';
import type { paths } from './generated/schema';

/**
 * The typed API client for Client Components. Types come from docs/openapi.json (`pnpm api:spec`),
 * so a changed API route breaks the web build instead of the billing counter.
 */
export const api = createClient<paths>({ baseUrl: browserApiOrigin, credentials: 'include' });

/** The X-CSRF-Token header for a state-changing request. Empty before the first GET /auth/csrf. */
export function csrfHeader(): { 'X-CSRF-Token': string } {
  return { 'X-CSRF-Token': readCsrfToken(document.cookie) ?? '' };
}

/**
 * Gets a fresh CSRF token, signed for whatever session the browser has now. Signing in needs this
 * every time: a CSRF cookie left from a session that has since expired no longer verifies.
 */
export async function refreshCsrfToken(): Promise<void> {
  await api.GET('/api/v1/auth/csrf');
}
