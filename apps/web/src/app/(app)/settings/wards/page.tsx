import { CodedMasters } from '@/features/settings/coded-masters';
import { ReadOnlyNote } from '@/features/settings/parts';
import { requireSettingsSection } from '@/features/settings/server';
import { Wards } from '@/features/settings/wards';

export default async function WardsPage() {
  const { canManage } = await requireSettingsSection('wards');
  return (
    <div className="space-y-10">
      {!canManage && <ReadOnlyNote />}
      <Wards canManage={canManage} />
      <CodedMasters kind="roomCategories" canManage={canManage} />
    </div>
  );
}
