import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { visibleSettingsSections } from '@/features/settings/sections';
import { getCurrentUser } from '@/lib/api/server';

/** Opens the first settings section this user may see. */
export default async function SettingsPage() {
  const me = await getCurrentUser();
  if (me === null) redirect('/login');
  const [first] = visibleSettingsSections(me.permissions);
  if (first !== undefined) redirect(first.href);
  const t = await getTranslations('settings');
  return <p className="text-text-muted">{t('noSections')}</p>;
}
