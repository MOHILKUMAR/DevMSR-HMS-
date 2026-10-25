import { redirect } from 'next/navigation';
import { PatientsFinder } from '@/features/patients/patients-finder';
import { getCurrentUser } from '@/lib/api/server';

export default async function PatientsPage() {
  const me = await getCurrentUser();
  if (me === null) redirect('/login');
  return <PatientsFinder canRegister={me.permissions.includes('patients.patient.create')} />;
}
