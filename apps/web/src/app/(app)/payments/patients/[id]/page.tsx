import { notFound, redirect } from 'next/navigation';
import { PatientPayments } from '@/features/payments/patient-payments';
import { getCurrentUser } from '@/lib/api/server';
import { isUuid } from '@/lib/ids';

export default async function PatientPaymentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (me === null) redirect('/login');
  const { permissions } = me;
  // The page reads the cashier's own shift, so it is for cashiers only.
  if (!permissions.includes('billing.account.read') || !permissions.includes('payments.shift.manage-own') || !isUuid(id)) notFound();
  return (
    <PatientPayments
      key={id}
      patientId={id}
      canPay={permissions.includes('payments.receipt.create')}
      canDeposit={permissions.includes('payments.deposit.create')}
      canRequestRefund={permissions.includes('billing.refund.request')}
      canRequestVoid={permissions.includes('payments.receipt.void-request')}
      me={{ userId: me.user.id, permissions }}
    />
  );
}
