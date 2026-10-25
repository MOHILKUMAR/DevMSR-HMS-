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

/** Makes sure the CSRF cookie exists, as the login screen needs before anyone is signed in. */
export async function ensureCsrfToken(): Promise<void> {
  if (readCsrfToken(document.cookie) === undefined) {
    await api.GET('/api/v1/auth/csrf');
  }
}
