import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/lib/api/server';
import { formatDateTime } from '@/lib/format';

export default async function HomePage() {
  const me = await getCurrentUser();
  if (me === null) redirect('/login');
  const t = await getTranslations('home');
  return (
    <section className="max-w-2xl space-y-2">
      <h1 className="text-xl font-semibold">{t('welcome', { name: me.user.displayName })}</h1>
      <p className="text-text-muted">{t('sessionEnds', { time: formatDateTime(me.session.expiresAt) })}</p>
    </section>
  );
}
