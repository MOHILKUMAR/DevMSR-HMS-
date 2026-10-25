import { notFound, redirect } from 'next/navigation';
import { PatientRecord } from '@/features/patients/patient-record';
import { getPatient } from '@/features/patients/server';
import { getCurrentUser } from '@/lib/api/server';
import { isUuid } from '@/lib/ids';


/** A patient's record. Opening it is audited by the API. */
export default async function PatientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { registered } = await searchParams;
  const me = await getCurrentUser();
  if (me === null) redirect('/login');
  if (!isUuid(id)) notFound();
  const patient = await getPatient(id);
  return (
    <PatientRecord
      patient={patient}
      canEdit={me.permissions.includes('patients.patient.update')}
      notice={registered === '1' ? 'registered' : 'none'}
    />
  );
}
