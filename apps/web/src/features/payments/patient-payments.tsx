'use client';

import type { InvoiceSummary } from '@devmsr/validation';
import { Ban, PiggyBank, Undo2, TriangleAlert, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableHead, TableMessage, Td, Th } from '@/components/ui/table';
import { useApprovalRequests } from '@/features/approvals/queries';
import { RefundDialog, VoidDialog } from '@/features/approvals/request-dialogs';
import { RequestTable, type Me } from '@/features/approvals/request-table';
import { BillStatus } from '@/features/billing/invoice-table';
import { useAccount, useCurrentShift } from '@/features/billing/queries';
import { AgeSex } from '@/features/patients/age-sex';
import { formatDateTime, formatPaise } from '@/lib/format';
import { ApplyDepositDialog, DepositDialog, PaymentDialog } from './money-dialogs';

type Open =
  | { kind: 'pay'; invoice: InvoiceSummary }
  | { kind: 'apply'; invoice: InvoiceSummary }
  | { kind: 'deposit' }
  | { kind: 'refund' }
  | { kind: 'void'; receipt: { id: string; number: string; amountPaise: number } }
  | null;

/**
 * One patient at the cash counter: bills with money due, the deposit held, and receipts. Taking
 * money needs the cashier's own open shift; setting a deposit against a bill does not move cash.
 */
export function PatientPayments({
  patientId,
  me,
  canPay,
  canDeposit,
  canRequestRefund,
  canRequestVoid,
}: {
  patientId: string;
  me: Me;
  canPay: boolean;
  canDeposit: boolean;
  canRequestRefund: boolean;
  canRequestVoid: boolean;
}) {
  const t = useTranslations('payments.patient');
  const tm = useTranslations('payments.modes');
  const account = useAccount(patientId);
  const shift = useCurrentShift();
  const requests = useApprovalRequests({ patientId });
  const [open, setOpen] = useState<Open>(null);
  const close = () => {
    setOpen(null);
  };
  const patient = account.data?.patient;
  const held = account.data?.depositHeldPaise ?? 0;
  const dueBills = (account.data?.invoices ?? []).filter((invoice) => invoice.status === 'issued' && invoice.duePaise > 0);
  const noShift = shift.data !== undefined && shift.data.shift === null;
  const refundable = held + (account.data?.refundablePaise ?? 0);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">{patient === undefined ? t('loading') : t('title', { name: patient.fullName })}</h1>
          {patient !== undefined && (
            <p className="text-text-muted">
              <span className="font-mono">{patient.uhid}</span>, <AgeSex patient={patient} />
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
        {canRequestRefund && refundable > 0 && (
          <Button
            variant="outline"
            onClick={() => {
              setOpen({ kind: 'refund' });
            }}
          >
            <Undo2 aria-hidden />
            {t('requestRefund')}
          </Button>
        )}
        {canDeposit && (
          <Button
            variant="outline"
            disabled={noShift}
            onClick={() => {
              setOpen({ kind: 'deposit' });
            }}
          >
            <PiggyBank aria-hidden />
            {t('takeDeposit')}
          </Button>
        )}
        </div>
      </div>

      {noShift && (
        <div role="status" className="flex items-center gap-2 rounded-md border border-warning bg-warning-soft p-3 text-sm">
          <TriangleAlert className="size-4 text-warning" aria-hidden />
          <span>{t('noShift')}</span>
          <Link href="/payments" className="font-medium text-primary underline-offset-4 hover:underline">
            {t('openShift')}
          </Link>
        </div>
      )}

      {account.error !== null && <ErrorAlert error={account.error} />}
      {account.data !== undefined && (
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border bg-surface p-4">
            <dt className="text-sm text-text-muted">{t('due')}</dt>
            <dd className={`text-2xl font-semibold tabular-nums ${account.data.totalDuePaise > 0 ? 'text-danger' : 'text-success'}`}>
              {formatPaise(account.data.totalDuePaise)}
            </dd>
          </div>
          <div className="rounded-md border border-border bg-surface p-4">
            <dt className="text-sm text-text-muted">{t('depositHeld')}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{formatPaise(held)}</dd>
          </div>
        </dl>
      )}

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t('billsDue')}</h2>
        <Table>
          <TableHead>
            <tr>
              <Th>{t('number')}</Th>
              <Th>{t('date')}</Th>
              <Th numeric>{t('total')}</Th>
              <Th numeric>{t('dueColumn')}</Th>
              <Th>{t('status')}</Th>
              <Th>
                <span className="sr-only">{t('actions')}</span>
              </Th>
            </tr>
          </TableHead>
          <TableBody>
            {account.isPending && <TableMessage colSpan={6}>{t('loading')}</TableMessage>}
            {account.data !== undefined && dueBills.length === 0 && <TableMessage colSpan={6}>{t('nothingDue')}</TableMessage>}
            {dueBills.map((invoice) => (
              <tr key={invoice.id}>
                <Td>
                  <Link
                    href={`/billing/invoices/${invoice.id}`}
                    className="font-mono font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {invoice.number}
                  </Link>
                </Td>
                <Td className="tabular-nums">{formatDateTime(invoice.issuedAt ?? invoice.createdAt)}</Td>
                <Td numeric>{formatPaise(invoice.totalPaise)}</Td>
                <Td numeric className="font-semibold">
                  {formatPaise(invoice.duePaise)}
                </Td>
                <Td>
                  <BillStatus invoice={invoice} />
                </Td>
                <Td>
                  <div className="flex flex-wrap justify-end gap-2">
                    {canPay && held > 0 && (
                      <Button
                        variant="ghost"
                        aria-label={t('useDepositFor', { number: invoice.number ?? '' })}
                        onClick={() => {
                          setOpen({ kind: 'apply', invoice });
                        }}
                      >
                        {t('useDeposit')}
                      </Button>
                    )}
                    {canPay && (
                      <Button
                        variant="outline"
                        disabled={noShift}
                        aria-label={t('takePaymentFor', { number: invoice.number ?? '' })}
                        onClick={() => {
                          setOpen({ kind: 'pay', invoice });
                        }}
                      >
                        <Wallet aria-hidden />
                        {t('takePayment')}
                      </Button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t('receipts')}</h2>
        <Table>
          <TableHead>
            <tr>
              <Th>{t('number')}</Th>
              <Th>{t('date')}</Th>
              <Th>{t('kind')}</Th>
              <Th>{t('mode')}</Th>
              <Th numeric>{t('amount')}</Th>
              <Th>
                <span className="sr-only">{t('actions')}</span>
              </Th>
            </tr>
          </TableHead>
          <TableBody>
            {account.isPending && <TableMessage colSpan={6}>{t('loading')}</TableMessage>}
            {account.data?.receipts.length === 0 && <TableMessage colSpan={6}>{t('noReceipts')}</TableMessage>}
            {account.data?.receipts.map((receipt) => (
              <tr key={receipt.id}>
                <Td>
                  <Link
                    href={`/payments/receipts/${receipt.id}`}
                    className="font-mono font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {receipt.number}
                  </Link>
                </Td>
                <Td className="tabular-nums">{formatDateTime(receipt.createdAt)}</Td>
                <Td>{receipt.purpose === 'deposit' ? t('kindDeposit') : t('kindPayment')}</Td>
                <Td>{tm(receipt.mode)}</Td>
                <Td numeric className={receipt.voided ? 'line-through' : ''}>
                  {formatPaise(receipt.amountPaise)}
                </Td>
                <Td>
                  <div className="flex justify-end">
                    {receipt.voided && <StatusBadge tone="neutral" icon={Ban} label={t('voided')} />}
                    {!receipt.voided && canRequestVoid && receipt.shiftOpen && (
                      <Button
                        variant="ghost"
                        aria-label={t('askVoidFor', { number: receipt.number })}
                        onClick={() => {
                          setOpen({ kind: 'void', receipt });
                        }}
                      >
                        {t('askVoid')}
                      </Button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t('requests')}</h2>
        {requests.error !== null && <ErrorAlert error={requests.error} />}
        <RequestTable requests={requests.data?.data} me={me} showPatient={false} emptyText={t('noRequests')} />
      </div>

      <Dialog
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        {open?.kind === 'pay' && <PaymentDialog key={open.invoice.id} invoice={open.invoice} onDone={close} />}
        {open?.kind === 'apply' && <ApplyDepositDialog key={open.invoice.id} invoice={open.invoice} heldPaise={held} onDone={close} />}
        {open?.kind === 'deposit' && <DepositDialog patientId={patientId} onDone={close} />}
        {open?.kind === 'refund' && account.data !== undefined && <RefundDialog account={account.data} onDone={close} />}
        {open?.kind === 'void' && <VoidDialog key={open.receipt.id} receipt={open.receipt} onDone={close} />}
      </Dialog>
    </section>
  );
}
