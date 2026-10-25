'use client';

import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

/** Shown when a signed-in screen fails to load, for example when the API is unreachable. */
export default function SignedInError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('loadError');
  return (
    <section role="alert" className="max-w-xl space-y-3">
      <h1 className="flex items-center gap-2 text-xl font-semibold">
        <TriangleAlert className="size-5 text-danger" aria-hidden />
        {t('title')}
      </h1>
      <p className="text-text-muted">{t('body')}</p>
      <Button variant="outline" onClick={reset}>
        {t('retry')}
      </Button>
    </section>
  );
}
