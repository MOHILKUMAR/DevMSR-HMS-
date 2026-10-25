import type { Invoice, Receipt } from '@devmsr/validation';
import { notFound, redirect } from 'next/navigation';
import { serverApi, sessionCookieHeader } from '@/lib/api/server';

/** The session cookie for a Server Component call, or the login page when there is none. */
async function cookieOrLogin(): Promise<string> {
  const cookie = await sessionCookieHeader();
  if (cookie === undefined) redirect('/login');
  return cookie;
}

/** No session is the login page; another hospital's record, a bad id or no permission is not found. */
function check(status: number, what: string): never {
  if (status === 401) redirect('/login');
  if (status === 404 || status === 400 || status === 403) notFound();
  throw new Error(`GET ${what} failed with status ${String(status)}`);
}

/** A bill for the print page. The API audits the view. */
export async function getInvoice(id: string): Promise<Invoice> {
  const { data, response } = await serverApi.GET('/api/v1/invoices/{id}', {
    params: { path: { id } },
    headers: { cookie: await cookieOrLogin() },
    cache: 'no-store',
  });
  if (data === undefined) check(response.status, '/invoices/:id');
  return data;
}

/** A receipt for the print page. */
export async function getReceipt(id: string): Promise<Receipt> {
  const { data, response } = await serverApi.GET('/api/v1/receipts/{id}', {
    params: { path: { id } },
    headers: { cookie: await cookieOrLogin() },
    cache: 'no-store',
  });
  if (data === undefined) check(response.status, '/receipts/:id');
  return data;
}
