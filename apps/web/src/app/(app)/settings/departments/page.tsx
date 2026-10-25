import { CodedMasters } from '@/features/settings/coded-masters';
import { ReadOnlyNote } from '@/features/settings/parts';
import { requireSettingsSection } from '@/features/settings/server';

export default async function DepartmentsPage() {
  const { canManage } = await requireSettingsSection('departments');
  return (
    <div className="space-y-4">
      {!canManage && <ReadOnlyNote />}
      <CodedMasters kind="departments" canManage={canManage} />
    </div>
  );
}
