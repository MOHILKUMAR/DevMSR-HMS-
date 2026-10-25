import { notFound } from 'next/navigation';
import { InvoiceDocument } from '@/features/billing/invoice-document';
import { PrintPage, printOptions } from '@/features/billing/print-page';
import { getInvoice } from '@/features/billing/server';
import { isUuid } from '@/lib/ids';

export default async function PrintInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { size, auto } = printOptions(await searchParams);
  const invoice = await getInvoice(id);
  return (
    <PrintPage size={size} auto={auto}>
      <InvoiceDocument invoice={invoice} size={size} />
    </PrintPage>
  );
}
