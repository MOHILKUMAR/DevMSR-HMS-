import { notFound, redirect } from 'next/navigation';
import { CreditNoteView } from '@/features/approvals/document-views';
import { getCurrentUser } from '@/lib/api/server';
import { isUuid } from '@/lib/ids';

export default async function CreditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (me === null) redirect('/login');
  if (!me.permissions.includes('billing.account.read') || !isUuid(id)) notFound();
  return <CreditNoteView key={id} id={id} />;
}
