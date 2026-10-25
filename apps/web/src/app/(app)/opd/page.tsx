import { notFound, redirect } from 'next/navigation';
import { DoctorQueue } from '@/features/opd/doctor-queue';
import { OpdDesk } from '@/features/opd/opd-desk';
import { getCurrentUser } from '@/lib/api/server';

/** OPD: the token desk for reception, the queue for doctors. */
export default async function OpdPage() {
  const me = await getCurrentUser();
  if (me === null) redirect('/login');
  const desk = me.permissions.includes('opd.appointment.manage') && me.permissions.includes('opd.visit.read');
  const queue = me.permissions.includes('opd.queue.read-own');
  if (!desk && !queue) notFound();
  return (
    <div className="space-y-10">
      {desk && <OpdDesk />}
      {queue && <DoctorQueue />}
    </div>
  );
}
