import { notFound, redirect } from 'next/navigation';
import { RegisterPatient } from '@/features/patients/register-patient';
import { getCurrentUser } from '@/lib/api/server';

export default async function RegisterPatientPage() {
  const me = await getCurrentUser();
  if (me === null) redirect('/login');
  if (!me.permissions.includes('patients.patient.create')) notFound();
  return <RegisterPatient />;
}
