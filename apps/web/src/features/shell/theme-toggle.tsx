'use client';

import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { THEME_COOKIE } from '@/lib/cookies';

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** Light by default, dark for night shifts. The choice is kept in a cookie so the server renders it. */
export function ThemeToggle({ initialDark }: { initialDark: boolean }) {
  const t = useTranslations('shell');
  const [dark, setDark] = useState(initialDark);

  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    document.cookie = `${THEME_COOKIE}=${next ? 'dark' : 'light'}; Path=/; Max-Age=${String(ONE_YEAR_SECONDS)}; SameSite=Lax`;
    setDark(next);
  };

  const label = dark ? t('themeLight') : t('themeDark');
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label={label} title={label}>
      {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </Button>
  );
}
