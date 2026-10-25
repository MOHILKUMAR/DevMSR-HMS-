import { notFound, redirect } from 'next/navigation';
import { ReportsView } from '@/features/reports/reports-view';
import { getCurrentUser } from '@/lib/api/server';

/** Day-end collection, the Tally day book and basic counts, each for those who may see it. */
export default async function ReportsPage() {
  const me = await getCurrentUser();
  if (me === null) redirect('/login');
  const has = (code: string) => me.permissions.includes(code);
  if (!has('reports.collection.read') && !has('reports.finance.export') && !has('reports.operations.read')) notFound();
  return <ReportsView canCollections={has('reports.collection.read')} canExport={has('reports.finance.export')} canOperations={has('reports.operations.read')} />;
}
