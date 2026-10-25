import type { MeResponse } from '@devmsr/validation';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/api/server';
import { settingsSection, type SettingsSectionKey } from './sections';

/**
 * The signed-in user for a settings page, and whether they may change it. Someone without the view
 * permission gets the not found page; the API refuses them anyway.
 */
export async function requireSettingsSection(key: SettingsSectionKey): Promise<{ me: MeResponse; canManage: boolean }> {
  const me = await getCurrentUser();
  if (me === null) redirect('/login');
  const section = settingsSection(key);
  if (!me.permissions.includes(section.view)) notFound();
  return { me, canManage: me.permissions.includes(section.manage) };
}
