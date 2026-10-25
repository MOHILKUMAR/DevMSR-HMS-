import { notFound, redirect } from 'next/navigation';
import { BillingDesk } from '@/features/billing/billing-desk';
import { getCurrentUser } from '@/lib/api/server';

export default async function BillingPage() {
  const me = await getCurrentUser();
  if (me === null) redirect('/login');
  if (!me.permissions.includes('billing.account.read')) notFound();
  return <BillingDesk />;
}
