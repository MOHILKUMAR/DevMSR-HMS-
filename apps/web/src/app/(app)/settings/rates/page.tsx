import { ReadOnlyNote } from '@/features/settings/parts';
import { Rates } from '@/features/settings/rates';
import { requireSettingsSection } from '@/features/settings/server';

export default async function RatesPage() {
  const { canManage } = await requireSettingsSection('rates');
  return (
    <div className="space-y-4">
      {!canManage && <ReadOnlyNote />}
      <Rates canManage={canManage} />
    </div>
  );
}
