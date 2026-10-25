import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LoginForm } from '@/features/auth/login-form';
import { safeRedirectPath } from '@/lib/safe-redirect';

export const metadata: Metadata = { title: 'Sign in | DevMSR HMS' };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { next } = await searchParams;
  const t = await getTranslations();
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-md border border-border bg-surface p-8 shadow-sm">
        <p className="text-sm font-semibold text-primary">{t('app.name')}</p>
        <h1 className="mt-2 text-xl font-semibold">{t('login.title')}</h1>
        <p className="mt-1 text-sm text-text-muted">{t('login.subtitle')}</p>
        <LoginForm next={safeRedirectPath(next)} />
      </div>
    </main>
  );
}
