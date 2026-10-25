import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ChangePasswordForm } from '@/features/account/change-password-form';
import { OwnSessions } from '@/features/account/own-sessions';

export const metadata: Metadata = { title: 'My account | DevMSR HMS' };

/** Every signed-in user's own account: their password and their sessions. */
export default async function AccountPage() {
  const t = await getTranslations('account');
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-text-muted">{t('description')}</p>
      </div>
      <OwnSessions />
      <ChangePasswordForm />
    </div>
  );
}
