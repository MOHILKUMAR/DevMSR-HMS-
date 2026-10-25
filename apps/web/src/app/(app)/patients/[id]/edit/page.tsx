import { notFound, redirect } from 'next/navigation';
import { EditPatient } from '@/features/patients/edit-patient';
import { getPatient } from '@/features/patients/server';
import { getCurrentUser } from '@/lib/api/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditPatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (me === null) redirect('/login');
  if (!me.permissions.includes('patients.patient.update') || !UUID.test(id)) notFound();
  return <EditPatient patient={await getPatient(id)} />;
}
