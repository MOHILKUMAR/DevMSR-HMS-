import type { OpdVisit } from '@devmsr/validation';
import { notFound, redirect } from 'next/navigation';
import { serverApi, sessionCookieHeader } from '@/lib/api/server';

/** A visit for the token slip, without clinical notes. Another hospital's visit is the not found page. */
export async function getOpdVisit(id: string): Promise<OpdVisit> {
  const cookie = await sessionCookieHeader();
  if (cookie === undefined) redirect('/login');
  const { data, response } = await serverApi.GET('/api/v1/opd-visits/{id}', { params: { path: { id } }, headers: { cookie }, cache: 'no-store' });
  if (response.status === 401) redirect('/login');
  if (response.status === 404 || response.status === 400 || response.status === 403) notFound();
  if (data === undefined) throw new Error(`GET /opd-visits/:id failed with status ${String(response.status)}`);
  return data;
}
