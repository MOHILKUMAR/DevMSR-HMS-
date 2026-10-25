import { notFound, redirect } from 'next/navigation';
import { DischargeDesk } from '@/features/discharge/discharge-desk';
import { getCurrentUser } from '@/lib/api/server';

/** Discharges in progress and done. */
export default async function DischargePage() {
  const me = await getCurrentUser();
  if (me === null) redirect('/login');
  if (!me.permissions.includes('ipd.admission.read')) notFound();
  return <DischargeDesk />;
}
