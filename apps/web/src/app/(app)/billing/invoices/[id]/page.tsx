import { notFound, redirect } from 'next/navigation';
import { InvoiceView } from '@/features/billing/invoice-view';
import { getCurrentUser } from '@/lib/api/server';
import { isUuid } from '@/lib/ids';

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (me === null) redirect('/login');
  if (!me.permissions.includes('billing.account.read') || !isUuid(id)) notFound();
  return (
    <InvoiceView
      key={id}
      id={id}
      canIssue={me.permissions.includes('billing.invoice.issue')}
      canDiscard={me.permissions.includes('billing.invoice.create')}
      canPay={me.permissions.includes('payments.receipt.create')}
    />
  );
}
