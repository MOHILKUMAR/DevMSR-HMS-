'use client';

import { Printer } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ErrorAlert } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { useReceipt } from '@/features/billing/queries';
import { ReceiptDocument } from '@/features/billing/receipt-document';

/** A receipt on screen, with the A4 and 80 mm print buttons and the way back to the patient. */
export function ReceiptView({ id }: { id: string }) {
  const t = useTranslations('payments.receipt');
  const receipt = useReceipt(id);

  if (receipt.error !== null) return <ErrorAlert error={receipt.error} />;
  if (receipt.data === undefined) return <p className="text-text-muted">{t('loading')}</p>;
  const data = receipt.data;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t('heading', { number: data.number })}</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="ghost">
            <Link href={`/payments/patients/${data.patient.id}`}>{t('backToPatient')}</Link>
          </Button>
          <Button asChild variant="outline">
            <a href={`/print/receipts/${data.id}?size=a4`} target="_blank" rel="noopener">
              <Printer aria-hidden />
              {t('printA4')}
            </a>
          </Button>
          <Button asChild>
            <a href={`/print/receipts/${data.id}?size=thermal`} target="_blank" rel="noopener">
              <Printer aria-hidden />
              {t('printThermal')}
            </a>
          </Button>
        </div>
      </div>
      <div className="max-w-xl rounded-md border border-border bg-print-paper p-6 shadow-sm">
        <ReceiptDocument receipt={data} size="a4" />
      </div>
    </section>
  );
}
