import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { visibleSettingsSections } from '@/features/settings/sections';
import { SettingsTabs } from '@/features/settings/settings-tabs';
import { getCurrentUser } from '@/lib/api/server';

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const me = await getCurrentUser();
  if (me === null) redirect('/login');
  const t = await getTranslations('settings');
  const sections = visibleSettingsSections(me.permissions).map(({ key, href }) => ({ key, href }));
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('title')}</h1>
      {sections.length > 0 && <SettingsTabs sections={sections} />}
      {children}
    </div>
  );
}
