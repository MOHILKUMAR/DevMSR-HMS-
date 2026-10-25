import { notFound, redirect } from 'next/navigation';
import { BedBoard } from '@/features/ipd/bed-board';
import { getCurrentUser } from '@/lib/api/server';

/** The bed board. Nurses also set empty beds free, cleaning, reserved or blocked. */
export default async function BedsPage() {
  const me = await getCurrentUser();
  if (me === null) redirect('/login');
  if (!me.permissions.includes('beds.bed.read')) notFound();
  return <BedBoard canSetStatus={me.permissions.includes('beds.bed.update-status')} />;
}
