'use client';

import type { Shift } from '@devmsr/validation';
import { CircleCheck, Lock, TriangleAlert, Unlock } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { ErrorAlert, TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableHead, TableMessage, Td, Th } from '@/components/ui/table';
import { useCloseShift, useCurrentShift, useOpenShift } from '@/features/billing/queries';
import { PatientPicker } from '@/features/patients/patient-picker';
import { formatDateTime, formatPaise } from '@/lib/format';
import { zodResolver } from '@/lib/forms';
import { parseRupeesToPaise } from '@/lib/money';

const rupeesSchema = z.string().refine((value) => parseRupeesToPaise(value) !== null);

function OpenShiftForm() {
  const t = useTranslations('payments.shift');
  const open = useOpenShift();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ rupees: string }>({ resolver: zodResolver(z.object({ rupees: rupeesSchema })), defaultValues: { rupees: '' } });

  return (
    <form
      noValidate
      aria-labelledby="open-shift-title"
      className="max-w-md space-y-3 rounded-md border border-border bg-surface p-4"
      onSubmit={(event) => {
        void handleSubmit((values) => {
          const openingCashPaise = parseRupeesToPaise(values.rupees);
          if (openingCashPaise !== null) open.mutate({ openingCashPaise });
        })(event);
      }}
    >
      <h2 id="open-shift-title" className="text-base font-semibold">
        {t('openTitle')}
      </h2>
      <p className="text-sm text-text-muted">{t('openDescription')}</p>
      <TextField
        id="opening-cash"
        label={t('openingCash')}
        inputMode="decimal"
        autoComplete="off"
        className="text-lg tabular-nums"
        error={errors.rupees && t('cashError')}
        {...register('rupees')}
      />
      {open.error !== null && <ErrorAlert error={open.error} />}
      <Button type="submit" disabled={open.isPending}>
        <Unlock aria-hidden />
        {t('open')}
      </Button>
    </form>
  );
}

/** What was taken in the shift, by mode, and the cash the drawer should hold. */
function ShiftSummary({ shift }: { shift: Shift }) {
  const t = useTranslations('payments.shift');
  const tm = useTranslations('payments.modes');
  return (
    <div className="space-y-3 rounded-md border border-border bg-surface p-4">
      <h2 className="text-base font-semibold">{t('openSince', { time: formatDateTime(shift.openedAt) })}</h2>
      <Table>
        <TableHead>
          <tr>
            <Th>{t('mode')}</Th>
            <Th numeric>{t('count')}</Th>
            <Th numeric>{t('amount')}</Th>
          </tr>
        </TableHead>
        <TableBody>
          {shift.byMode.length === 0 && <TableMessage colSpan={3}>{t('nothingYet')}</TableMessage>}
          {shift.byMode.map((row) => (
            <tr key={row.mode}>
              <Td>{tm(row.mode)}</Td>
              <Td numeric>{row.count}</Td>
              <Td numeric>{formatPaise(row.amountPaise)}</Td>
            </tr>
          ))}
        </TableBody>
      </Table>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:max-w-md">
        <dt className="text-text-muted">{t('billPayments')}</dt>
        <dd className="text-right tabular-nums">{formatPaise(shift.billPaymentsPaise)}</dd>
        <dt className="text-text-muted">{t('deposits')}</dt>
        <dd className="text-right tabular-nums">{formatPaise(shift.depositsPaise)}</dd>
        <dt className="mt-2 text-text-muted">{t('openingCash')}</dt>
        <dd className="mt-2 text-right tabular-nums">{formatPaise(shift.openingCashPaise)}</dd>
        <dt className="text-text-muted">{t('cashReceived')}</dt>
        <dd className="text-right tabular-nums">{formatPaise(shift.byMode.find((row) => row.mode === 'cash')?.amountPaise ?? 0)}</dd>
        <dt className="font-semibold">{t('expectedCash')}</dt>
        <dd className="text-right font-semibold tabular-nums">{formatPaise(shift.expectedCashPaise)}</dd>
      </dl>
    </div>
  );
}

/** Closes the shift with the counted cash. A difference shows as it is typed and needs a reason. */
function CloseShiftForm({ shift }: { shift: Shift }) {
  const t = useTranslations('payments.shift');
  const close = useCloseShift(shift.id);
  const schema = z
    .object({ rupees: rupeesSchema, reason: z.string().trim() })
    .superRefine((value, ctx) => {
      const counted = parseRupeesToPaise(value.rupees);
      if (counted !== null && counted !== shift.expectedCashPaise && value.reason.length < 3) {
        ctx.addIssue({ code: 'custom', path: ['reason'], message: 'reason' });
      }
    });
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<{ rupees: string; reason: string }>({ resolver: zodResolver(schema), defaultValues: { rupees: '', reason: '' } });
  const counted = parseRupeesToPaise(useWatch({ control, name: 'rupees' }));
  const difference = counted === null ? null : counted - shift.expectedCashPaise;

  return (
    <form
      noValidate
      aria-labelledby="close-shift-title"
      className="max-w-md space-y-3 rounded-md border border-border bg-surface p-4"
      onSubmit={(event) => {
        void handleSubmit((values) => {
          const countedCashPaise = parseRupeesToPaise(values.rupees);
          if (countedCashPaise === null) return;
          close.mutate({ countedCashPaise, ...(countedCashPaise === shift.expectedCashPaise ? {} : { differenceReason: values.reason }) });
        })(event);
      }}
    >
      <h2 id="close-shift-title" className="text-base font-semibold">
        {t('closeTitle')}
      </h2>
      <TextField
        id="counted-cash"
        label={t('countedCash')}
        hint={t('countedHint')}
        inputMode="decimal"
        autoComplete="off"
        className="text-lg tabular-nums"
        error={errors.rupees && t('cashError')}
        {...register('rupees')}
      />
      {difference !== null && (
        <p role="status" className={`flex items-center gap-2 text-sm ${difference === 0 ? 'text-success' : 'text-danger'}`}>
          {difference === 0 ? <CircleCheck className="size-4" aria-hidden /> : <TriangleAlert className="size-4" aria-hidden />}
          {difference === 0
            ? t('matches')
            : difference < 0
              ? t('short', { amount: formatPaise(-difference) })
              : t('over', { amount: formatPaise(difference) })}
        </p>
      )}
      {difference !== null && difference !== 0 && (
        <TextField id="difference-reason" label={t('reason')} error={errors.reason && t('reasonError')} {...register('reason')} />
      )}
      {close.error !== null && <ErrorAlert error={close.error} />}
      <Button type="submit" variant="outline" disabled={close.isPending}>
        <Lock aria-hidden />
        {t('close')}
      </Button>
    </form>
  );
}

/** The cash counter: the cashier's shift, and the way to a patient's bills and deposits. */
export function CashierDesk({ canSeeShifts }: { canSeeShifts: boolean }) {
  const t = useTranslations('payments.desk');
  const current = useCurrentShift();
  const shift = current.data?.shift ?? null;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <p className="text-text-muted">{t('description')}</p>
        </div>
        {canSeeShifts && (
          <Button asChild variant="outline">
            <Link href="/payments/shifts">{t('allShifts')}</Link>
          </Button>
        )}
      </div>
      {current.error !== null && <ErrorAlert error={current.error} />}
      {current.isPending && <p className="text-text-muted">{t('loading')}</p>}
      {!current.isPending && shift === null && <OpenShiftForm />}
      {shift !== null && (
        <>
          <PatientPicker id="payments-patient" label={t('findPatient')} hrefFor={(id) => `/payments/patients/${id}`} />
          <ShiftSummary shift={shift} />
          <CloseShiftForm key={shift.id} shift={shift} />
        </>
      )}
    </section>
  );
}
