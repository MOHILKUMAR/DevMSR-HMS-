import { notFound, redirect } from 'next/navigation';
import { IpdDesk } from '@/features/ipd/ipd-desk';
import { getCurrentUser } from '@/lib/api/server';

/** IPD: admit patients and see everyone admitted now. */
export default async function IpdPage() {
  const me = await getCurrentUser();
  if (me === null) redirect('/login');
  if (!me.permissions.includes('ipd.admission.read')) notFound();
  return <IpdDesk canAdmit={me.permissions.includes('ipd.admission.create')} />;
}
