import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PrintPage } from '@/features/billing/print-page';
import { getDischargeSummary } from '@/features/discharge/server';
import { SummaryDocument } from '@/features/discharge/summary-document';
import { isUuid } from '@/lib/ids';

/** A discharge summary prints on A4, and only once the MD has signed it off (docs/billing-rules.md). */
export default async function PrintDischargeSummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const summary = await getDischargeSummary(id);
  if (summary.signedAt === null) {
    const t = await getTranslations('discharge.document');
    return <p className="mx-auto max-w-xl p-6">{t('notSignedYet')}</p>;
  }
  const { auto } = await searchParams;
  return (
    <PrintPage size="a4" auto={auto !== '0'}>
      <SummaryDocument summary={summary} />
    </PrintPage>
  );
}
