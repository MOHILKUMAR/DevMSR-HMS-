import { notFound } from 'next/navigation';
import { PrintPage, printOptions } from '@/features/billing/print-page';
import { ReceiptDocument } from '@/features/billing/receipt-document';
import { getReceipt } from '@/features/billing/server';
import { isUuid } from '@/lib/ids';

export default async function PrintReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { size, auto } = printOptions(await searchParams);
  const receipt = await getReceipt(id);
  return (
    <PrintPage size={size} auto={auto}>
      <ReceiptDocument receipt={receipt} size={size} />
    </PrintPage>
  );
}
