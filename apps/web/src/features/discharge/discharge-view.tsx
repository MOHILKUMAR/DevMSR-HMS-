'use client';

import type { Discharge } from '@devmsr/validation';
import { CircleCheck, CircleDashed, DoorOpen, FileText, Printer, ReceiptIndianRupee, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { ErrorAlert, TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableHead, TableMessage, Td, Th } from '@/components/ui/table';
import { AgeSex } from '@/features/patients/age-sex';
import { formatDate, formatDateTime, formatPaise } from '@/lib/format';
import { useClear, useCompleteDischarge, useDischarge, useFinalBill, useRequestDues } from './queries';
import { clearanceHolds, nextStep, onlyDueLeft, type Step } from './steps';
import { SummarySection } from './summary-section';

export interface DischargePermissions {
  canBill: boolean;
  canClear: boolean;
  canWriteSummary: boolean;
  canSignSummary: boolean;
  canReadSummary: boolean;
  canComplete: boolean;
}

function Section({ title, done, children }: { title: string; done: boolean; children: ReactNode }) {
  const t = useTranslations('discharge.view');
  return (
    <section className="space-y-3 rounded-md border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {done ? <StatusBadge tone="success" icon={CircleCheck} label={t('done')} /> : <StatusBadge tone="neutral" icon={CircleDashed} label={t('waiting')} />}
      </div>
      {children}
    </section>
  );
}

function BillsStep({ discharge, can, step }: { discharge: Discharge; can: DischargePermissions; step: Step }) {
  const t = useTranslations('discharge.view');
  const router = useRouter();
  const [key, setKey] = useState(() => crypto.randomUUID());
  const finalBill = useFinalBill(discharge.id);
  const { balance } = discharge;
  const open = discharge.completedAt === null;
  return (
    <Section title={t('billsTitle')} done={step !== 'bill'}>
      <Table>
        <TableHead>
          <tr>
            <Th>{t('bill')}</Th>
            <Th>{t('billStatus')}</Th>
            <Th numeric>{t('total')}</Th>
            <Th numeric>{t('due')}</Th>
          </tr>
        </TableHead>
        <TableBody>
          {discharge.bills.length === 0 && <TableMessage colSpan={4}>{t('noBills')}</TableMessage>}
          {discharge.bills.map((bill) => (
            <tr key={bill.id}>
              <Td>
                <Link href={`/billing/invoices/${bill.id}`} className="font-mono text-primary underline-offset-4 hover:underline">
                  {bill.number ?? t('draft')}
                </Link>
              </Td>
              <Td>{t(`billStatuses.${bill.status}`)}</Td>
              <Td numeric>{formatPaise(bill.totalPaise)}</Td>
              <Td numeric>{formatPaise(bill.duePaise)}</Td>
            </tr>
          ))}
        </TableBody>
      </Table>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {(
          [
            ['unbilled', balance.unbilledPaise, balance.unbilledCount > 0],
            ['dueOnBills', balance.duePaise, balance.duePaise > 0],
            ['depositHeld', balance.depositHeldPaise, balance.depositHeldPaise > 0],
            ['refundable', balance.refundablePaise, balance.refundablePaise > 0],
          ] as const
        ).map(([label, amount, owed]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-text-muted">{t(label)}</dt>
            <dd className={owed ? 'font-medium text-danger tabular-nums' : 'tabular-nums'}>{formatPaise(amount)}</dd>
          </div>
        ))}
      </dl>
      {balance.missingRoomCharges.length > 0 && (
        <p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          {t('missingDays', { days: balance.missingRoomCharges.map(formatDate).join(', ') })}
        </p>
      )}
      {(balance.duePaise > 0 || balance.depositHeldPaise > 0 || balance.refundablePaise > 0) && (
        <p className="text-sm text-text-muted">{t('settleAtCounter')}</p>
      )}
      {finalBill.error !== null && <ErrorAlert error={finalBill.error} />}
      {open && can.canBill && (balance.unbilledCount > 0 || balance.missingRoomCharges.length > 0) && (
        <Button
          variant={step === 'bill' ? 'primary' : 'outline'}
          disabled={finalBill.isPending}
          onClick={() => {
            finalBill.mutate(key, {
              onSuccess: (bill) => {
                setKey(crypto.randomUUID());
                router.push(`/billing/invoices/${bill.id}`);
              },
            });
          }}
        >
          <ReceiptIndianRupee aria-hidden />
          {t('prepareFinalBill')}
        </Button>
      )}
    </Section>
  );
}

function ClearanceStep({ discharge, can, step }: { discharge: Discharge; can: DischargePermissions; step: Step }) {
  const t = useTranslations('discharge.view');
  const clear = useClear(discharge.id);
  const askDues = useRequestDues();
  const [reason, setReason] = useState('');
  const { balance, clearance } = discharge;
  const holds = clearanceHolds(discharge);
  const onlyDue = onlyDueLeft(discharge);
  const validReason = reason.trim().length >= 3 && reason.trim().length <= 500;
  const open = discharge.completedAt === null;
  return (
    <Section title={t('clearanceTitle')} done={holds || discharge.completedAt !== null}>
      {clearance === null ? (
        <p className="text-sm text-text-muted">{t('notCleared')}</p>
      ) : (
        <p className="text-sm">
          {clearance.duePaise > 0
            ? t('clearedWithDues', { name: clearance.clearedByName ?? '', time: formatDateTime(clearance.clearedAt), amount: formatPaise(clearance.duePaise) })
            : t('cleared', { name: clearance.clearedByName ?? '', time: formatDateTime(clearance.clearedAt) })}
        </p>
      )}
      {clearance !== null && !holds && open && <p className="text-sm text-warning">{t('clearanceOutdated')}</p>}
      {discharge.pendingDuesRequestId !== null && (
        <p className="text-sm">
          {t('duesWaiting')}{' '}
          <Link href="/approvals" className="text-primary underline-offset-4 hover:underline">
            {t('openApprovals')}
          </Link>
        </p>
      )}
      {clear.error !== null && <ErrorAlert error={clear.error} />}
      {open && can.canClear && !holds && balance.settled && (
        <Button variant={step === 'clear' ? 'primary' : 'outline'} disabled={clear.isPending} onClick={() => { clear.mutate(); }}>
          <CircleCheck aria-hidden />
          {t('giveClearance')}
        </Button>
      )}
      {open && can.canClear && !holds && onlyDue && discharge.pendingDuesRequestId === null && (
        <form
          noValidate
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (validReason) askDues.mutate({ dischargeId: discharge.id, reason: reason.trim() }, { onSuccess: () => { setReason(''); } });
          }}
        >
          <p className="text-sm">{t('duesExplain', { amount: formatPaise(balance.duePaise) })}</p>
          <TextField
            id="dues-reason"
            label={t('duesReason')}
            value={reason}
            error={reason !== '' && !validReason ? t('reasonError') : undefined}
            onChange={(event) => { setReason(event.target.value); }}
          />
          {askDues.error !== null && <ErrorAlert error={askDues.error} />}
          <Button type="submit" variant={step === 'clear' ? 'primary' : 'outline'} disabled={!validReason || askDues.isPending}>
            {t('askMd')}
          </Button>
        </form>
      )}
    </Section>
  );
}

function CompleteStep({ discharge, can, step }: { discharge: Discharge; can: DischargePermissions; step: Step }) {
  const t = useTranslations('discharge.view');
  const complete = useCompleteDischarge(discharge.id);
  return (
    <Section title={t('completeTitle')} done={discharge.completedAt !== null}>
      {discharge.completedAt === null ? (
        <p className="text-sm text-text-muted">{t('completeExplain')}</p>
      ) : (
        <p className="text-sm">{t('completed', { name: discharge.completedByName ?? '', time: formatDateTime(discharge.completedAt) })}</p>
      )}
      {complete.error !== null && <ErrorAlert error={complete.error} />}
      {discharge.completedAt === null && can.canComplete && (
        <Button variant={step === 'complete' ? 'primary' : 'outline'} disabled={step !== 'complete' || complete.isPending} onClick={() => { complete.mutate(); }}>
          <DoorOpen aria-hidden />
          {t('complete')}
        </Button>
      )}
    </Section>
  );
}

/** One discharge, step by step: fit, bills and the account, clearance, summary, and the patient leaving. */
export function DischargeView({ id, can }: { id: string; can: DischargePermissions }) {
  const t = useTranslations('discharge.view');
  const discharge = useDischarge(id);
  if (discharge.error !== null) return <ErrorAlert error={discharge.error} />;
  if (discharge.data === undefined) return <p className="text-text-muted">{t('loading')}</p>;
  const data = discharge.data;
  const step = nextStep(data);
  const admission = data.admission;

  return (
    <section className="max-w-4xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold">{t('title', { number: admission.number })}</h1>
            {data.completedAt === null ? (
              <StatusBadge tone="warning" icon={CircleDashed} label={t('inProgress')} />
            ) : (
              <StatusBadge tone="success" icon={DoorOpen} label={t('discharged')} />
            )}
          </div>
          <p className="text-text-muted">
            {admission.patient.fullName}, <span className="font-mono">{admission.patient.uhid}</span>, <AgeSex patient={admission.patient} />
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="ghost">
            <Link href="/discharge">{t('back')}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/ipd/admissions/${admission.id}`}>{t('openAdmission')}</Link>
          </Button>
          {data.summaryStatus === 'signed' && can.canReadSummary && (
            <Button asChild variant="outline">
              <a href={`/print/discharge-summaries/${data.id}`} target="_blank" rel="noopener">
                <Printer aria-hidden />
                {t('printSummary')}
              </a>
            </Button>
          )}
        </div>
      </div>

      <dl className="grid gap-x-6 gap-y-2 rounded-md border border-border bg-surface p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-text-muted">{t('bed')}</dt>
          <dd className="font-medium">{admission.bed === null ? t('noBed') : `${admission.bed.wardName} ${admission.bed.code}`}</dd>
        </div>
        <div>
          <dt className="text-text-muted">{t('doctor')}</dt>
          <dd className="font-medium">{admission.doctor.fullName}</dd>
        </div>
        <div>
          <dt className="text-text-muted">{t('fit')}</dt>
          <dd className="font-medium">{t('fitBy', { name: data.fitByName ?? '', time: formatDateTime(data.fitAt) })}</dd>
        </div>
        {data.fitNote !== null && (
          <div className="sm:col-span-3">
            <dt className="text-text-muted">{t('fitNote')}</dt>
            <dd>{data.fitNote}</dd>
          </div>
        )}
      </dl>

      <BillsStep discharge={data} can={can} step={step} />
      <ClearanceStep discharge={data} can={can} step={step} />
      <SummarySection discharge={data} can={can} step={step} />
      <CompleteStep discharge={data} can={can} step={step} />
      <p className="flex items-center gap-2 text-sm text-text-muted">
        <FileText className="size-4" aria-hidden />
        {t('order')}
      </p>
    </section>
  );
}
