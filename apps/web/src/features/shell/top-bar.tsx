import type { MeResponse } from '@devmsr/validation';
import { UserRound } from 'lucide-react';
import { cookies } from 'next/headers';
import Link from 'next/link';
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
        {/* The name opens My account: password and sessions. */}
        <Link
          href="/account"
          className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span className="sr-only">{t('account')}: </span>
          <span className="hidden max-w-56 text-right leading-tight sm:block">
            <span className="block truncate text-sm font-medium">{me.user.displayName}</span>
            <span className="block truncate text-xs text-text-muted">{me.hospital?.name ?? t('platform')}</span>
          </span>
          <UserRound className="size-5 text-text-muted" aria-hidden />
        </Link>
        <ThemeToggle initialDark={dark} />
        <SignOutButton />
      </div>
    </header>
  );
}
