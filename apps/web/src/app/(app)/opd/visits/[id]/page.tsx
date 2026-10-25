import { notFound, redirect } from 'next/navigation';
import { ConsultationView } from '@/features/opd/consultation-view';
import { getCurrentUser } from '@/lib/api/server';
import { isUuid } from '@/lib/ids';

/** One visit for its doctor. The API returns another doctor's visit as not found. */
export default async function ConsultationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (me === null) redirect('/login');
  if (!me.permissions.includes('clinical.note.write') || !isUuid(id)) notFound();
  return <ConsultationView key={id} id={id} />;
}
