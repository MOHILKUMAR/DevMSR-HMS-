import { notFound } from 'next/navigation';
import { CreditNoteDocument } from '@/features/approvals/documents';
import { PrintPage, printOptions } from '@/features/billing/print-page';
import { getCreditNote } from '@/features/billing/server';
import { isUuid } from '@/lib/ids';

export default async function PrintCreditNotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { size, auto } = printOptions(await searchParams);
  const note = await getCreditNote(id);
  return (
    <PrintPage size={size} auto={auto}>
      <CreditNoteDocument note={note} size={size} />
    </PrintPage>
  );
}
