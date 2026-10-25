'use client';

import { Printer } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ErrorAlert } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { CreditNoteDocument, RefundDocument } from './documents';
import { useCreditNote, useRefund } from './queries';

function DocumentView({ heading, back, printPath, children }: { heading: string; back: { href: string; label: string }; printPath: string; children: ReactNode }) {
  const t = useTranslations('approvals.view');
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{heading}</h1>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="ghost">
            <Link href={back.href}>{back.label}</Link>
          </Button>
          <Button asChild variant="outline">
            <a href={`${printPath}?size=a4`} target="_blank" rel="noopener">
              <Printer aria-hidden />
              {t('printA4')}
            </a>
          </Button>
          <Button asChild>
            <a href={`${printPath}?size=thermal`} target="_blank" rel="noopener">
              <Printer aria-hidden />
              {t('printThermal')}
            </a>
          </Button>
        </div>
      </div>
      <div className="max-w-3xl rounded-md border border-border bg-print-paper p-6 shadow-sm">{children}</div>
    </section>
  );
}

export function CreditNoteView({ id }: { id: string }) {
  const t = useTranslations('approvals.view');
  const note = useCreditNote(id);
  if (note.error !== null) return <ErrorAlert error={note.error} />;
  if (note.data === undefined) return <p className="text-text-muted">{t('loading')}</p>;
  return (
    <DocumentView
      heading={t('creditNoteHeading', { number: note.data.number })}
      back={{ href: `/billing/invoices/${note.data.invoiceId}`, label: t('backToBill') }}
      printPath={`/print/credit-notes/${id}`}
    >
      <CreditNoteDocument note={note.data} size="a4" />
    </DocumentView>
  );
}

export function RefundView({ id }: { id: string }) {
  const t = useTranslations('approvals.view');
  const refund = useRefund(id);
  if (refund.error !== null) return <ErrorAlert error={refund.error} />;
  if (refund.data === undefined) return <p className="text-text-muted">{t('loading')}</p>;
  return (
    <DocumentView
      heading={t('refundHeading', { number: refund.data.number })}
      back={{ href: `/payments/patients/${refund.data.patient.id}`, label: t('backToPatient') }}
      printPath={`/print/refunds/${id}`}
    >
      <RefundDocument refund={refund.data} size="a4" />
    </DocumentView>
  );
}
