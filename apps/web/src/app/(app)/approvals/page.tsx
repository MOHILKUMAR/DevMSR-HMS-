import { notFound, redirect } from 'next/navigation';
import { ApprovalsInbox } from '@/features/approvals/approvals-inbox';
import { getCurrentUser } from '@/lib/api/server';

/** Discounts, credit notes, refunds and voids waiting for a decision, and decided ones for the record. */
export default async function ApprovalsPage() {
  const me = await getCurrentUser();
  if (me === null) redirect('/login');
  if (!me.permissions.includes('billing.account.read')) notFound();
  return <ApprovalsInbox me={{ userId: me.user.id, permissions: me.permissions }} />;
}
