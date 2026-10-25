import type { Patient } from '@devmsr/validation';
import { notFound, redirect } from 'next/navigation';
import { serverApi, sessionCookieHeader } from '@/lib/api/server';

/**
 * Opens a patient record for a Server Component, forwarding only the session cookie. The API
 * audits the view. Another hospital's patient, or none, is the not found page.
 */
export async function getPatient(id: string): Promise<Patient> {
  const cookie = await sessionCookieHeader();
  if (cookie === undefined) redirect('/login');
  const { data, response } = await serverApi.GET('/api/v1/patients/{id}', {
    params: { path: { id } },
    headers: { cookie },
    cache: 'no-store',
  });
  if (response.status === 401) redirect('/login');
  if (response.status === 404 || response.status === 400 || response.status === 403) notFound();
  if (data === undefined) throw new Error(`GET /patients/:id failed with status ${String(response.status)}`);
  return data;
}
