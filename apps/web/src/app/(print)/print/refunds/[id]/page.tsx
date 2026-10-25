import { notFound } from 'next/navigation';
import { RefundDocument } from '@/features/approvals/documents';
import { PrintPage, printOptions } from '@/features/billing/print-page';
import { getRefund } from '@/features/billing/server';
import { isUuid } from '@/lib/ids';

export default async function PrintRefundPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { size, auto } = printOptions(await searchParams);
  const refund = await getRefund(id);
  return (
    <PrintPage size={size} auto={auto}>
      <RefundDocument refund={refund} size={size} />
    </PrintPage>
  );
}
