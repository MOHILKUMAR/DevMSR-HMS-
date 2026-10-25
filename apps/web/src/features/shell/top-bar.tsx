import type { MeResponse } from '@devmsr/validation';
import { Search } from 'lucide-react';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { Input } from '@/components/ui/input';
import { THEME_COOKIE } from '@/lib/cookies';
import { SignOutButton } from './sign-out-button';
import { ThemeToggle } from './theme-toggle';

export async function TopBar({ me }: { me: MeResponse }) {
  const t = await getTranslations('shell');
  const dark = (await cookies()).get(THEME_COOKIE)?.value === 'dark';
  const canSearchPatients = me.permissions.includes('patients.patient.read');

  return (
    <header className="flex h-14 items-center gap-4 border-b border-border bg-surface px-4">
      {canSearchPatients ? (
        // The field is in place for every screen; it starts searching with patient registration.
        <form role="search" aria-label={t('searchLabel')} className="relative w-full max-w-md">
          <label htmlFor="patient-search" className="sr-only">
            {t('searchLabel')}
          </label>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted" aria-hidden />
          <Input
            id="patient-search"
            type="search"
            disabled
            placeholder={t('searchPlaceholder')}
            title={t('searchSoon')}
            aria-describedby="patient-search-hint"
            className="pl-9"
          />
          <span id="patient-search-hint" className="sr-only">
            {t('searchSoon')}
          </span>
        </form>
      ) : null}
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
