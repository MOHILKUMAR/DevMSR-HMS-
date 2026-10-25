'use client';

import type { ApprovalRequest } from '@devmsr/validation';
import { CircleCheck, CircleX, Clock } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableHead, TableMessage, Td, Th } from '@/components/ui/table';
import { formatDateTime, formatPaise } from '@/lib/format';
import { canPayOut, decideState } from './decide';
import { DecisionDialog, PayRefundDialog } from './request-dialogs';

export interface Me {
  userId: string;
  permissions: readonly string[];
}

function RequestStatus({ request }: { request: ApprovalRequest }) {
  const t = useTranslations('approvals.status');
  if (request.status === 'pending') return <StatusBadge tone="warning" icon={Clock} label={t('pending')} />;
  return request.status === 'approved' ? (
    <StatusBadge tone="success" icon={CircleCheck} label={t('approved')} />
  ) : (
    <StatusBadge tone="danger" icon={CircleX} label={t('rejected')} />
  );
}

/** What was asked for, in a line or two: the lines and amounts, or where a refund comes from. */
function Summary({ request }: { request: ApprovalRequest }) {
  const t = useTranslations('approvals.summary');
  const tm = useTranslations('payments.modes');
  const details = request.details;
  switch (details.kind) {
    case 'discount':
      return (
        <ul className="text-xs text-text-muted">
          {details.lines.map((line) => (
            <li key={line.lineNo}>{t('discountLine', { name: line.description, amount: formatPaise(line.discountPaise) })}</li>
          ))}
        </ul>
      );
    case 'credit_note':
      return details.wholeBill ? (
        <p className="text-xs text-text-muted">{t('wholeBill')}</p>
      ) : (
        <ul className="text-xs text-text-muted">
          {details.lines.map((line) => (
            <li key={line.lineNo}>
              {line.quantity === null
                ? t('creditAmount', { name: line.description, amount: formatPaise(line.totalPaise) })
                : t('creditUnits', { name: line.description, count: line.quantity, amount: formatPaise(line.totalPaise) })}
            </li>
          ))}
        </ul>
      );
    case 'refund':
      return <p className="text-xs text-text-muted">{t(details.source === 'deposit' ? 'refundDeposit' : 'refundBill', { mode: tm(details.mode) })}</p>;
    case 'receipt_void':
      return <p className="text-xs text-text-muted">{t('void', { mode: tm(details.mode) })}</p>;
  }
}

function Target({ request }: { request: ApprovalRequest }) {
  const t = useTranslations('approvals.table');
  const link = 'whitespace-nowrap font-mono text-primary underline-offset-4 hover:underline';
  return (
    <div className="space-y-0.5">
      {request.invoiceId !== null && (
        <Link href={`/billing/invoices/${request.invoiceId}`} className={link}>
          {request.invoiceNumber ?? t('draftBill')}
        </Link>
      )}
      {request.receiptId !== null && (
        <Link href={`/payments/receipts/${request.receiptId}`} className={link}>
          {request.receiptNumber}
        </Link>
      )}
      {request.resultInvoiceId !== null && (
        <Link href={`/billing/invoices/${request.resultInvoiceId}`} className="block text-sm text-primary underline-offset-4 hover:underline">
          {t('newDraft')}
        </Link>
      )}
      {request.creditNote !== null && (
        <Link href={`/billing/credit-notes/${request.creditNote.id}`} className={`block ${link}`}>
          {request.creditNote.number}
        </Link>
      )}
      {request.refund !== null && (
        <Link href={`/payments/refunds/${request.refund.id}`} className={`block ${link}`}>
          {request.refund.number}
        </Link>
      )}
    </div>
  );
}

type Open = { request: ApprovalRequest; action: 'approve' | 'reject' | 'pay' } | null;

/** Requests with their state and, for those who may act, approve, reject and pay out buttons. */
export function RequestTable({
  requests,
  me,
  showPatient,
  emptyText,
}: {
  requests: readonly ApprovalRequest[] | undefined;
  me: Me;
  showPatient: boolean;
  emptyText: string;
}) {
  const t = useTranslations('approvals.table');
  const tk = useTranslations('approvals.kinds');
  const [open, setOpen] = useState<Open>(null);
  const close = () => {
    setOpen(null);
  };
  const columns = showPatient ? 8 : 7;

  return (
    <>
      <Table>
        <TableHead>
          <tr>
            <Th>{t('kind')}</Th>
            {showPatient && <Th>{t('patient')}</Th>}
            <Th>{t('for')}</Th>
            <Th numeric>{t('amount')}</Th>
            <Th>{t('reason')}</Th>
            <Th>{t('askedBy')}</Th>
            <Th>{t('status')}</Th>
            <Th>
              <span className="sr-only">{t('actions')}</span>
            </Th>
          </tr>
        </TableHead>
        <TableBody>
          {requests === undefined && <TableMessage colSpan={columns}>{t('loading')}</TableMessage>}
          {requests?.length === 0 && <TableMessage colSpan={columns}>{emptyText}</TableMessage>}
          {requests?.map((request) => {
            const state = decideState(request, me);
            return (
              <tr key={request.id} className="align-top">
                <Td className="font-medium">{tk(request.kind)}</Td>
                {showPatient && (
                  <Td>
                    {request.patient.fullName}
                    <span className="block font-mono text-xs text-text-muted">{request.patient.uhid}</span>
                  </Td>
                )}
                <Td>
                  <Target request={request} />
                </Td>
                <Td numeric className="font-semibold">
                  {formatPaise(request.amountPaise)}
                </Td>
                <Td className="max-w-xs">
                  <p>{request.reason}</p>
                  <Summary request={request} />
                  {request.decisionNote !== null && <p className="mt-1 text-xs">{t('note', { note: request.decisionNote })}</p>}
                </Td>
                <Td>
                  {request.requestedByName ?? ''}
                  <span className="block text-xs text-text-muted tabular-nums">{formatDateTime(request.requestedAt)}</span>
                </Td>
                <Td>
                  <RequestStatus request={request} />
                  {request.decidedByName !== null && <span className="block text-xs text-text-muted">{t('decidedBy', { name: request.decidedByName })}</span>}
                </Td>
                <Td>
                  <div className="flex flex-wrap justify-end gap-2">
                    {state === 'can-decide' && (
                      <>
                        <Button
                          variant="ghost"
                          aria-label={t('rejectFor', { kind: tk(request.kind), name: request.patient.fullName })}
                          onClick={() => {
                            setOpen({ request, action: 'reject' });
                          }}
                        >
                          {t('reject')}
                        </Button>
                        <Button
                          variant="outline"
                          aria-label={t('approveFor', { kind: tk(request.kind), name: request.patient.fullName })}
                          onClick={() => {
                            setOpen({ request, action: 'approve' });
                          }}
                        >
                          {t('approve')}
                        </Button>
                      </>
                    )}
                    {state === 'own-request' && <span className="text-xs text-text-muted">{t('ownRequest')}</span>}
                    {state === 'md-only' && <span className="text-xs text-text-muted">{t('mdOnly')}</span>}
                    {canPayOut(request, me.permissions) && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setOpen({ request, action: 'pay' });
                        }}
                      >
                        {t('payOut')}
                      </Button>
                    )}
                  </div>
                </Td>
              </tr>
            );
          })}
        </TableBody>
      </Table>
      <Dialog
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        {open !== null && open.action !== 'pay' && <DecisionDialog key={`${open.request.id}-${open.action}`} request={open.request} decision={open.action} onDone={close} />}
        {open?.action === 'pay' && open.request.details.kind === 'refund' && (
          <PayRefundDialog key={open.request.id} request={open.request} mode={open.request.details.mode} onDone={close} />
        )}
      </Dialog>
    </>
  );
}
