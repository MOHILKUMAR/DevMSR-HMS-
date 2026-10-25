import { notFound, redirect } from 'next/navigation';
import { PatientBilling } from '@/features/billing/patient-billing';
import { getCurrentUser } from '@/lib/api/server';
import { isUuid } from '@/lib/ids';

/** One patient's charges and bills. The API checks the hospital and audits the account view. */
export default async function PatientBillingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (me === null) redirect('/login');
  if (!me.permissions.includes('billing.account.read') || !isUuid(id)) notFound();
  return (
    <PatientBilling
      key={id}
      patientId={id}
      canCharge={me.permissions.includes('billing.charge.create')}
      canDraft={me.permissions.includes('billing.invoice.create')}
    />
  );
}
