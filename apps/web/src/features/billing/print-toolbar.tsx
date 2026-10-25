'use client';

import { Printer } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Opens the print dialog once the page has drawn, and offers a button to print again. Hidden on
 * paper. `auto` is off in tests so the dialog does not block the browser.
 */
export function PrintToolbar({ auto }: { auto: boolean }) {
  const t = useTranslations('billing.print');
  useEffect(() => {
    if (auto) window.print();
  }, [auto]);
  return (
    <div className="mb-4 flex justify-end gap-2 print:hidden">
      <Button
        onClick={() => {
          window.print();
        }}
      >
        <Printer aria-hidden />
        {t('print')}
      </Button>
    </div>
  );
}
