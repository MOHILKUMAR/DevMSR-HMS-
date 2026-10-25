import type { InterimBill } from '@devmsr/validation';
import { notFound, redirect } from 'next/navigation';
import { serverApi, sessionCookieHeader } from '@/lib/api/server';

/** The interim bill for the print page. Another hospital's admission is the not found page. */
export async function getInterimBill(id: string): Promise<InterimBill> {
  const cookie = await sessionCookieHeader();
  if (cookie === undefined) redirect('/login');
  const { data, response } = await serverApi.GET('/api/v1/admissions/{id}/interim-bill', { params: { path: { id } }, headers: { cookie }, cache: 'no-store' });
  if (response.status === 401) redirect('/login');
  if (response.status === 404 || response.status === 400 || response.status === 403) notFound();
  if (data === undefined) throw new Error(`GET /admissions/:id/interim-bill failed with status ${String(response.status)}`);
  return data;
}
