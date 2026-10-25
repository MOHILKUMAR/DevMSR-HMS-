import { notFound, redirect } from 'next/navigation';
import { DischargeView } from '@/features/discharge/discharge-view';
import { getCurrentUser } from '@/lib/api/server';
import { isUuid } from '@/lib/ids';

export default async function DischargeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (me === null) redirect('/login');
  if (!me.permissions.includes('ipd.admission.read') || !isUuid(id)) notFound();
  const has = (code: string) => me.permissions.includes(code);
  return (
    <DischargeView
      key={id}
      id={id}
      can={{
        canBill: has('billing.invoice.create'),
        canClear: has('billing.clearance.grant'),
        canWriteSummary: has('ipd.discharge-summary.write'),
        canSignSummary: has('ipd.discharge-summary.sign'),
        canReadSummary: has('ipd.discharge-summary.read'),
        canComplete: has('ipd.discharge.complete'),
      }}
    />
  );
}
