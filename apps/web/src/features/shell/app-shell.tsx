import type { MeResponse } from '@devmsr/validation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { BreakGlassBanner } from '@/features/break-glass/break-glass-banner';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';

/** Section 16 layout: sidebar filtered by role on the left, search bar on top, work area in the middle. */
export async function AppShell({ me, children }: { me: MeResponse; children: ReactNode }) {
  const t = await getTranslations('app');
  return (
    <div className="flex min-h-screen">
      <a
        href="#main"
        className="sr-only rounded-md bg-surface px-3 py-2 focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50"
      >
        {t('skipToContent')}
      </a>
      <Sidebar permissions={me.permissions} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar me={me} />
        <BreakGlassBanner me={me} />
        <main id="main" tabIndex={-1} className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
