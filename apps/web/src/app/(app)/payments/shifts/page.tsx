import { notFound, redirect } from 'next/navigation';
import { ShiftsList } from '@/features/payments/shifts-list';
import { getCurrentUser } from '@/lib/api/server';

export default async function ShiftsPage() {
  const me = await getCurrentUser();
  if (me === null) redirect('/login');
  if (!me.permissions.includes('reports.collection.read')) notFound();
  return <ShiftsList />;
}
