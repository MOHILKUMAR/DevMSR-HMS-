import { notFound, redirect } from 'next/navigation';
import { AdmissionView } from '@/features/ipd/admission-view';
import { getCurrentUser } from '@/lib/api/server';
import { isUuid } from '@/lib/ids';

export default async function AdmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (me === null) redirect('/login');
  if (!me.permissions.includes('ipd.admission.read') || !isUuid(id)) notFound();
  return (
    <AdmissionView
      key={id}
      id={id}
      canTransfer={me.permissions.includes('ipd.transfer.create')}
      canSeeBill={me.permissions.includes('billing.account.read')}
    />
  );
}
