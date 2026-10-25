import { cookies } from 'next/headers';
import { cache } from 'react';
import createClient from 'openapi-fetch';
import type { MeResponse } from '@devmsr/validation';
import { SESSION_COOKIES } from '../cookies';
import { serverApiOrigin } from '../env';
import type { paths } from './generated/schema';

const serverApi = createClient<paths>({ baseUrl: serverApiOrigin() });

/** Forwards only the session cookie to the API, not the browser's other cookies. */
async function sessionCookieHeader(): Promise<string | undefined> {
  const jar = await cookies();
  for (const name of SESSION_COOKIES) {
    const value = jar.get(name)?.value;
    if (value !== undefined && value !== '') return `${name}=${value}`;
  }
  return undefined;
}

/**
 * The signed-in user, from GET /auth/me. Null when there is no valid session. Cached for one
 * render, so the layout and the page share a single API call.
 */
export const getCurrentUser = cache(async (): Promise<MeResponse | null> => {
  const cookie = await sessionCookieHeader();
  if (cookie === undefined) return null;
  const { data, response } = await serverApi.GET('/api/v1/auth/me', { headers: { cookie }, cache: 'no-store' });
  if (response.status === 401) return null;
  if (data === undefined) {
    throw new Error(`GET /auth/me failed with status ${String(response.status)}`);
  }
  return data;
});
