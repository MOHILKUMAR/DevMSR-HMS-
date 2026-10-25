import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { BreakGlassStartForm } from '@/features/break-glass/break-glass-panel';
import { getCurrentUser } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Break-glass access | DevMSR HMS' };

/** DevMSR super admins only. While access is open, the banner on every screen shows it and ends it. */
export default async function BreakGlassPage() {
  const me = await getCurrentUser();
  if (me === null) redirect('/login');
  if (!me.permissions.includes('platform.break-glass.use')) notFound();
  const t = await getTranslations('breakGlass');
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="mt-1 max-w-2xl text-sm text-text-muted">{t('description')}</p>
      </div>
      {me.breakGlass === null && <BreakGlassStartForm />}
    </div>
  );
}
