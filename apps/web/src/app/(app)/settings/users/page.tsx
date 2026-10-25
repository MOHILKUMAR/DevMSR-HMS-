import { requireSettingsSection } from '@/features/settings/server';
import { StaffUsers } from '@/features/settings/staff-users';

export default async function StaffUsersPage() {
  const { me } = await requireSettingsSection('users');
  return <StaffUsers currentUserId={me.user.id} />;
}
