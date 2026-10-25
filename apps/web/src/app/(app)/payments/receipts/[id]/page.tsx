import { notFound, redirect } from 'next/navigation';
import { ReceiptView } from '@/features/payments/receipt-view';
import { getCurrentUser } from '@/lib/api/server';
import { isUuid } from '@/lib/ids';

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (me === null) redirect('/login');
  if (!me.permissions.includes('billing.account.read') || !isUuid(id)) notFound();
  return <ReceiptView key={id} id={id} />;
}
