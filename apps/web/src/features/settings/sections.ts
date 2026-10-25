export type SettingsSectionKey = 'hospital' | 'users' | 'departments' | 'doctors' | 'wards' | 'rates' | 'advances';

export interface SettingsSection {
  key: SettingsSectionKey;
  href: string;
  /** Needed to open the section. */
  view: string;
  /** Needed to change anything in it. Without it the section is read-only. */
  manage: string;
}

// Codes come from apps/api/src/auth/permission-matrix.ts. The API checks them again on every request.
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { key: 'users', href: '/settings/users', view: 'users.user.manage', manage: 'users.user.manage' },
  { key: 'departments', href: '/settings/departments', view: 'masters.data.read', manage: 'masters.data.manage' },
  { key: 'doctors', href: '/settings/doctors', view: 'masters.data.read', manage: 'masters.data.manage' },
  { key: 'wards', href: '/settings/wards', view: 'masters.data.read', manage: 'masters.data.manage' },
  { key: 'rates', href: '/settings/rates', view: 'tariffs.tariff.read', manage: 'tariffs.tariff.manage' },
  { key: 'advances', href: '/settings/advances', view: 'tariffs.tariff.read', manage: 'tariffs.tariff.manage' },
  { key: 'hospital', href: '/settings/hospital', view: 'masters.data.read', manage: 'settings.hospital.manage' },
];

export function visibleSettingsSections(permissions: readonly string[]): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((section) => permissions.includes(section.view));
}

export function settingsSection(key: SettingsSectionKey): SettingsSection {
  const section = SETTINGS_SECTIONS.find((candidate) => candidate.key === key);
  if (section === undefined) throw new Error(`Unknown settings section ${key}`);
  return section;
}
