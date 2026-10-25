import { notFound } from 'next/navigation';
import { PrintPage } from '@/features/billing/print-page';
import { InterimBillDocument } from '@/features/ipd/interim-bill-document';
import { getInterimBill } from '@/features/ipd/server';
import { isUuid } from '@/lib/ids';

/** An interim bill prints on A4 only. */
export default async function PrintInterimBillPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const bill = await getInterimBill(id);
  const { auto } = await searchParams;
  return (
    <PrintPage size="a4" auto={auto !== '0'}>
      <InterimBillDocument bill={bill} />
    </PrintPage>
  );
}
