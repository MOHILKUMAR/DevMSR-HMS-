import { getTranslations } from 'next-intl/server';
import type { NavKey } from './nav-items';

/** Placeholder for a section whose screens arrive in a later phase 1 slice. */
export async function ComingSoon({ section }: { section: Exclude<NavKey, 'home'> }) {
  const t = await getTranslations();
  return (
    <section className="max-w-2xl space-y-2">
      <h1 className="text-xl font-semibold">{t(`nav.${section}`)}</h1>
      <p className="text-text-muted">{t('comingSoon.body')}</p>
    </section>
  );
}
