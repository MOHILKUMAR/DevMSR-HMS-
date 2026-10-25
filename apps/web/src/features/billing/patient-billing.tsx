'use client';

import { MAX_CHARGE_QUANTITY, postChargeSchema, type PostCharge } from '@devmsr/validation';
import { FileText, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ErrorAlert, SelectField, TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableHead, TableMessage, Td, Th } from '@/components/ui/table';
import { AgeSex } from '@/features/patients/age-sex';
import { formatDate, formatPaise, todayIst } from '@/lib/format';
import { zodResolver } from '@/lib/forms';
import { InvoiceTable } from './invoice-table';
import { useAccount, useCreateDraft, usePendingCharges, usePostCharge, useServiceItemOptions } from './queries';

function Figure({ label, value, tone = 'text' }: { label: string; value: string; tone?: 'text' | 'danger' | 'success' }) {
  const colour = tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : 'text-text';
  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <p className="text-sm text-text-muted">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${colour}`}>{value}</p>
    </div>
  );
}

/** Posts a charge at today's rate (or the rate on an earlier service date). */
function AddChargeForm({ patientId }: { patientId: string }) {
  const t = useTranslations('billing.patient');
  const tv = useTranslations('validation');
  const items = useServiceItemOptions();
  const post = usePostCharge(patientId);
  // One key per charge: a resend after a lost response returns the same charge, not a second one.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const today = todayIst();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PostCharge>({ resolver: zodResolver(postChargeSchema), defaultValues: { serviceItemId: '', quantity: 1, serviceDate: today } });

  return (
    <form
      noValidate
      aria-labelledby="add-charge-title"
      className="space-y-3 rounded-md border border-border bg-surface p-4"
      onSubmit={(event) => {
        void handleSubmit((values) => {
          post.mutate(
            { body: values, key },
            {
              onSuccess: () => {
                setKey(crypto.randomUUID());
                reset({ serviceItemId: '', quantity: 1, serviceDate: today });
              },
            },
          );
        })(event);
      }}
    >
      <h2 id="add-charge-title" className="text-base font-semibold">
        {t('addCharge')}
      </h2>
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem_11rem_auto] sm:items-start">
        <SelectField id="charge-item" label={t('service')} error={errors.serviceItemId && t('serviceRequired')} {...register('serviceItemId')}>
          <option value="">{items.isPending ? t('loadingServices') : t('chooseService')}</option>
          {(items.data ?? [])
            .filter((item) => item.isActive)
            .map((item) => (
              <option key={item.id} value={item.id} disabled={item.currentRate === null}>
                {item.name} ({item.currentRate === null ? t('noRate') : formatPaise(item.currentRate.ratePaise)})
              </option>
            ))}
        </SelectField>
        <TextField
          id="charge-quantity"
          label={t('quantity')}
          inputMode="numeric"
          className="tabular-nums"
          error={errors.quantity && tv('quantity', { max: MAX_CHARGE_QUANTITY })}
          {...register('quantity', { valueAsNumber: true })}
        />
        <TextField id="charge-date" type="date" max={today} label={t('serviceDate')} error={errors.serviceDate && tv('date')} {...register('serviceDate')} />
        <Button type="submit" variant="outline" className="sm:mt-6" disabled={post.isPending}>
          <Plus aria-hidden />
          {t('addChargeButton')}
        </Button>
      </div>
      {post.error !== null && <ErrorAlert error={post.error} />}
    </form>
  );
}

/**
 * One patient's billing: what they owe and hold, charges not yet billed, and their bills. The clerk
 * adds charges, ticks the ones to bill, and prepares a draft.
 */
export function PatientBilling({ patientId, canCharge, canDraft }: { patientId: string; canCharge: boolean; canDraft: boolean }) {
  const t = useTranslations('billing.patient');
  const router = useRouter();
  const account = useAccount(patientId);
  const charges = usePendingCharges(patientId);
  const patient = account.data?.patient;
  const createDraft = useCreateDraft();
  const [key] = useState(() => crypto.randomUUID());
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const available = (charges.data?.data ?? []).filter((charge) => charge.invoiceId === null);
  const chosen = available.filter((charge) => !excluded.has(charge.id));
  const chosenTotal = chosen.reduce((sum, charge) => sum + charge.amountPaise, 0);

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{patient === undefined ? t('loading') : t('title', { name: patient.fullName })}</h1>
        {patient !== undefined && (
          <p className="text-text-muted">
            <span className="font-mono">{patient.uhid}</span>, <AgeSex patient={patient} />
          </p>
        )}
      </div>

      {account.error !== null && <ErrorAlert error={account.error} />}
      {account.data !== undefined && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Figure label={t('unbilled', { count: account.data.pendingCharges.count })} value={formatPaise(account.data.pendingCharges.amountPaise)} />
          <Figure label={t('due')} value={formatPaise(account.data.totalDuePaise)} tone={account.data.totalDuePaise > 0 ? 'danger' : 'success'} />
          <Figure label={t('depositHeld')} value={formatPaise(account.data.depositHeldPaise)} />
        </div>
      )}

      {canCharge && <AddChargeForm patientId={patientId} />}

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t('unbilledTitle')}</h2>
        <Table>
          <TableHead>
            <tr>
              {canDraft && <Th className="w-10">{t('bill')}</Th>}
              <Th>{t('service')}</Th>
              <Th>{t('serviceDate')}</Th>
              <Th numeric>{t('quantity')}</Th>
              <Th numeric>{t('rate')}</Th>
              <Th numeric>{t('amount')}</Th>
            </tr>
          </TableHead>
          <TableBody>
            {charges.isPending && <TableMessage colSpan={6}>{t('loading')}</TableMessage>}
            {!charges.isPending && available.length === 0 && <TableMessage colSpan={6}>{t('noUnbilled')}</TableMessage>}
            {available.map((charge) => (
              <tr key={charge.id}>
                {canDraft && (
                  <Td>
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      aria-label={t('includeNamed', { name: charge.description })}
                      checked={!excluded.has(charge.id)}
                      onChange={(event) => {
                        const next = new Set(excluded);
                        if (event.target.checked) next.delete(charge.id);
                        else next.add(charge.id);
                        setExcluded(next);
                      }}
                    />
                  </Td>
                )}
                <Td className="font-medium">{charge.description}</Td>
                <Td className="tabular-nums">{formatDate(charge.serviceDate)}</Td>
                <Td numeric>{charge.quantity}</Td>
                <Td numeric>{formatPaise(charge.unitRatePaise)}</Td>
                <Td numeric>{formatPaise(charge.amountPaise)}</Td>
              </tr>
            ))}
          </TableBody>
        </Table>
        {canDraft && available.length > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="text-sm text-text-muted tabular-nums">{t('chosen', { count: chosen.length, amount: formatPaise(chosenTotal) })}</span>
            <Button
              disabled={chosen.length === 0 || createDraft.isPending}
              onClick={() => {
                createDraft.mutate(
                  { body: { patientId, chargeIds: chosen.map((charge) => charge.id) }, key },
                  {
                    onSuccess: (invoice) => {
                      router.push(`/billing/invoices/${invoice.id}`);
                    },
                  },
                );
              }}
            >
              <FileText aria-hidden />
              {t('prepareBill')}
            </Button>
          </div>
        )}
        {createDraft.error !== null && <ErrorAlert error={createDraft.error} />}
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t('billsTitle')}</h2>
        <InvoiceTable invoices={account.data?.invoices} showPatient={false} emptyText={t('noBills')} />
      </div>
    </section>
  );
}
