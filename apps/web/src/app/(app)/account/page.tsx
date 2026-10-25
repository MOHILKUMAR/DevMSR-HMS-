import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ChangePasswordForm } from '@/features/account/change-password-form';
import { OwnSessions } from '@/features/account/own-sessions';
import { TwoFactorSection } from '@/features/account/two-factor-section';

export const metadata: Metadata = { title: 'My account | DevMSR HMS' };

/** Every signed-in user's own account: their sessions, password and two-factor sign-in. */
export default async function AccountPage() {
  const t = await getTranslations('account');
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-text-muted">{t('description')}</p>
      </div>
      <OwnSessions />
      <div className="grid gap-6 lg:grid-cols-2">
        <ChangePasswordForm />
        <TwoFactorSection />
      </div>
    </div>
  );
}
