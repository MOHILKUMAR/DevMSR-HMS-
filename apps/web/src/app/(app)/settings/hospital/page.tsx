import { HospitalProfileSection } from '@/features/settings/hospital-profile';
import { requireSettingsSection } from '@/features/settings/server';

export default async function HospitalProfilePage() {
  const { canManage } = await requireSettingsSection('hospital');
  return <HospitalProfileSection canManage={canManage} />;
}
