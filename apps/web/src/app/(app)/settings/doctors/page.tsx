import { Doctors } from '@/features/settings/doctors';
import { ReadOnlyNote } from '@/features/settings/parts';
import { requireSettingsSection } from '@/features/settings/server';

export default async function DoctorsPage() {
  const { me, canManage } = await requireSettingsSection('doctors');
  return (
    <div className="space-y-4">
      {!canManage && <ReadOnlyNote />}
      <Doctors canManage={canManage} canLinkLogins={me.permissions.includes('users.user.manage')} />
    </div>
  );
}
