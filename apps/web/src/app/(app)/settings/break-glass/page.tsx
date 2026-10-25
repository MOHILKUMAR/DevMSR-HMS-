import { BreakGlassHistory } from '@/features/break-glass/break-glass-history';
import { requireSettingsSection } from '@/features/settings/server';

export default async function BreakGlassHistoryPage() {
  await requireSettingsSection('breakGlass');
  return <BreakGlassHistory />;
}
