import type { MeResponse } from '@devmsr/validation';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { PatientSearchBox } from '@/features/patients/patient-search-box';
import { THEME_COOKIE } from '@/lib/cookies';
import { SignOutButton } from './sign-out-button';
import { ThemeToggle } from './theme-toggle';

export async function TopBar({ me }: { me: MeResponse }) {
  const t = await getTranslations('shell');
  const dark = (await cookies()).get(THEME_COOKIE)?.value === 'dark';
  const canSearchPatients = me.permissions.includes('patients.patient.read');

  return (
    <header className="flex h-14 items-center gap-4 border-b border-border bg-surface px-4">
      {canSearchPatients ? <PatientSearchBox /> : null}
      <div className="ml-auto flex items-center gap-2">
        <div className="hidden text-right leading-tight sm:block">
          <p className="text-sm font-medium">{me.user.displayName}</p>
          <p className="text-xs text-text-muted">{me.hospital?.name ?? t('platform')}</p>
        </div>
        <ThemeToggle initialDark={dark} />
        <SignOutButton />
      </div>
    </header>
  );
}
