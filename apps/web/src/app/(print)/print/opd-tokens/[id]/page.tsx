import { notFound, redirect } from 'next/navigation';
import { PrintPage } from '@/features/billing/print-page';
import { getOpdVisit } from '@/features/opd/server';
import { TokenSlip } from '@/features/opd/token-slip';
import { getCurrentUser } from '@/lib/api/server';
import { isUuid } from '@/lib/ids';

/** The token slip always prints on the 80 mm counter printer. */
export default async function PrintOpdTokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const me = await getCurrentUser();
  if (me === null) redirect('/login');
  const visit = await getOpdVisit(id);
  const { auto } = await searchParams;
  return (
    <PrintPage size="thermal" auto={auto !== '0'}>
      <TokenSlip visit={visit} hospitalName={me.hospital?.name ?? ''} />
    </PrintPage>
  );
}
