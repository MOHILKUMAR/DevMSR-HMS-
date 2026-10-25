import { Advances } from '@/features/ipd/advances';
import { ReadOnlyNote } from '@/features/settings/parts';
import { requireSettingsSection } from '@/features/settings/server';

export default async function AdvancesPage() {
  const { canManage } = await requireSettingsSection('advances');
  return (
    <div className="space-y-4">
      {!canManage && <ReadOnlyNote />}
      <Advances canManage={canManage} />
    </div>
  );
}
