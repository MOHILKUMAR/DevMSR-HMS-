'use client';

import { BadgePercent, FileCheck, FileMinus, Printer, Trash2, TriangleAlert, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useApprovalRequests } from '@/features/approvals/queries';
import { CreditNoteDialog, DiscountDialog } from '@/features/approvals/request-dialogs';
import { RequestTable, type Me } from '@/features/approvals/request-table';
import { formatPaise } from '@/lib/format';
import { InvoiceDocument } from './invoice-document';
import { BillStatus } from './invoice-table';
import { useDiscardInvoice, useInvoice, useIssueInvoice } from './queries';

/** Asks before a step that cannot be undone, inside the page (never a browser confirm box). */
function Confirm({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  danger = false,
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  pending: boolean;
  error: unknown;
  onConfirm: () => void;
}) {
  const tc = useTranslations('common');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent title={title} description={body} closeLabel={tc('close')}>
          <div className="space-y-3">
            {error !== null && <ErrorAlert error={error} />}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                }}
              >
                {tc('cancel')}
              </Button>
              <Button variant={danger ? 'danger' : 'primary'} disabled={pending} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

/**
 * A bill on screen. A draft can be issued (numbered and locked for good) or discarded, and a discount
 * can be asked for; an issued bill can be printed on A4 or an 80 mm slip, paid at the cash counter,
 * and corrected with a credit note. Requests on the bill, and their decisions, are listed below it.
 */
export function InvoiceView({
  id,
  me,
  canIssue,
  canDiscard,
  canPay,
  canRequestDiscount,
  canRequestCredit,
}: {
  id: string;
  me: Me;
  canIssue: boolean;
  canDiscard: boolean;
  canPay: boolean;
  canRequestDiscount: boolean;
  canRequestCredit: boolean;
}) {
  const t = useTranslations('billing.invoice');
  const invoice = useInvoice(id);
  const requests = useApprovalRequests({ invoiceId: id });
  const issue = useIssueInvoice(id);
  const discard = useDiscardInvoice(id);
  // One key for this bill's issue: pressing again after a lost response returns the same issued bill.
  const [issueKey] = useState(() => crypto.randomUUID());
  const [asking, setAsking] = useState<'issue' | 'discard' | 'discount' | 'credit' | null>(null);
  const close = () => {
    setAsking(null);
  };

  if (invoice.error !== null) return <ErrorAlert error={invoice.error} />;
  if (invoice.data === undefined) return <p className="text-text-muted">{t('loading')}</p>;
  const bill = invoice.data;
  const onBill = requests.data?.data ?? [];
  const discountWaiting = onBill.find((request) => request.kind === 'discount' && request.status === 'pending');
  const creditWaiting = onBill.some((request) => request.kind === 'credit_note' && request.status === 'pending');
  const replacement = onBill.find((request) => request.kind === 'discount' && request.status === 'approved' && request.resultInvoiceId !== null);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{bill.number === null ? t('draftHeading') : t('heading', { number: bill.number })}</h1>
          {bill.status !== 'discarded' && <BillStatus invoice={bill} />}
          {bill.status === 'discarded' && <span className="text-sm text-text-muted">{t('discarded')}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="ghost">
            <Link href={`/billing/patients/${bill.patient.id}`}>{t('backToPatient')}</Link>
          </Button>
          {bill.status === 'draft' && canRequestDiscount && discountWaiting === undefined && (
            <Button variant="outline" onClick={() => { setAsking('discount'); }}>
              <BadgePercent aria-hidden />
              {t('requestDiscount')}
            </Button>
          )}
          {bill.status === 'draft' && canDiscard && (
            <Button variant="outline" disabled={discountWaiting !== undefined} onClick={() => { setAsking('discard'); }}>
              <Trash2 aria-hidden />
              {t('discard')}
            </Button>
          )}
          {bill.status === 'draft' && canIssue && (
            <Button disabled={discountWaiting !== undefined} onClick={() => { setAsking('issue'); }}>
              <FileCheck aria-hidden />
              {t('issue')}
            </Button>
          )}
          {bill.status === 'issued' && (
            <>
              <Button asChild variant="outline">
                <a href={`/print/invoices/${bill.id}?size=a4`} target="_blank" rel="noopener">
                  <Printer aria-hidden />
                  {t('printA4')}
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href={`/print/invoices/${bill.id}?size=thermal`} target="_blank" rel="noopener">
                  <Printer aria-hidden />
                  {t('printThermal')}
                </a>
              </Button>
              {canRequestCredit && !creditWaiting && bill.creditedPaise < bill.totalPaise && (
                <Button variant="outline" onClick={() => { setAsking('credit'); }}>
                  <FileMinus aria-hidden />
                  {t('requestCredit')}
                </Button>
              )}
              {canPay && bill.duePaise > 0 && (
                <Button asChild>
                  <Link href={`/payments/patients/${bill.patient.id}`}>
                    <Wallet aria-hidden />
                    {t('takePayment', { amount: formatPaise(bill.duePaise) })}
                  </Link>
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {bill.status === 'draft' && discountWaiting !== undefined && (
        <p role="status" className="flex items-center gap-2 rounded-md border border-warning bg-warning-soft p-3 text-sm">
          <TriangleAlert className="size-4 text-warning" aria-hidden />
          {t('discountWaiting', { amount: formatPaise(discountWaiting.amountPaise) })}
        </p>
      )}
      {bill.status === 'discarded' && replacement?.resultInvoiceId != null && (
        <p role="status" className="rounded-md border border-border bg-primary-soft p-3 text-sm">
          {t('replacedByDiscount')}{' '}
          <Link href={`/billing/invoices/${replacement.resultInvoiceId}`} className="font-medium text-primary underline-offset-4 hover:underline">
            {t('openNewDraft')}
          </Link>
        </p>
      )}

      <div className="max-w-4xl rounded-md border border-border bg-print-paper p-6 shadow-sm">
        <InvoiceDocument invoice={bill} size="a4" />
      </div>

      {onBill.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{t('requestsTitle')}</h2>
          <RequestTable requests={onBill} me={me} showPatient={false} emptyText="" />
        </div>
      )}

      <Confirm
        open={asking === 'issue'}
        onOpenChange={(open) => {
          setAsking(open ? 'issue' : null);
        }}
        title={t('issueTitle')}
        body={t('issueBody', { amount: formatPaise(bill.totalPaise) })}
        confirmLabel={t('issue')}
        pending={issue.isPending}
        error={issue.error}
        onConfirm={() => {
          issue.mutate(issueKey, { onSuccess: close });
        }}
      />
      <Confirm
        open={asking === 'discard'}
        onOpenChange={(open) => {
          setAsking(open ? 'discard' : null);
        }}
        title={t('discardTitle')}
        body={t('discardBody')}
        confirmLabel={t('discard')}
        danger
        pending={discard.isPending}
        error={discard.error}
        onConfirm={() => {
          discard.mutate(undefined, { onSuccess: close });
        }}
      />
      <Dialog
        open={asking === 'discount' || asking === 'credit'}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        {asking === 'discount' && <DiscountDialog invoice={bill} onDone={close} />}
        {asking === 'credit' && <CreditNoteDialog invoice={bill} onDone={close} />}
      </Dialog>
    </section>
  );
}
