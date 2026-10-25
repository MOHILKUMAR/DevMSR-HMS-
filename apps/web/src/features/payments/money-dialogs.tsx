'use client';

import type { InvoiceSummary } from '@devmsr/validation';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ErrorAlert, FormActions, TextField } from '@/components/form-fields';
import { DialogContent } from '@/components/ui/dialog';
import { useApplyDeposit, useTakeDeposit, useTakePayment } from '@/features/billing/queries';
import { formatPaise } from '@/lib/format';
import { zodResolver } from '@/lib/forms';
import { paiseToRupeesInput, parseRupeesToPaise } from '@/lib/money';
import { EMPTY_PAYMENT, paymentBody, paymentFormSchema, type PaymentFormValues } from './payment-form';
import { PaymentFields } from './payment-fields';

/** A payment against one bill, defaulting to what is due. Opens the receipt when done. */
export function PaymentDialog({ invoice, onDone }: { invoice: InvoiceSummary; onDone: () => void }) {
  const t = useTranslations('payments.dialogs');
  const tc = useTranslations('common');
  const router = useRouter();
  const pay = useTakePayment();
  // One key per payment: a resend after a lost response returns the same receipt.
  const [key] = useState(() => crypto.randomUUID());
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: { ...EMPTY_PAYMENT, rupees: paiseToRupeesInput(invoice.duePaise) },
  });

  return (
    <DialogContent
      title={t('payTitle', { number: invoice.number ?? '' })}
      description={t('payDescription', { due: formatPaise(invoice.duePaise) })}
      closeLabel={tc('close')}
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          void handleSubmit((values) => {
            const body = paymentBody(values);
            if (body === null) return;
            pay.mutate(
              { body: { invoiceId: invoice.id, ...body }, key },
              {
                onSuccess: (receipt) => {
                  onDone();
                  router.push(`/payments/receipts/${receipt.id}`);
                },
              },
            );
          })(event);
        }}
      >
        <PaymentFields register={register} control={control} errors={errors} amountHint={t('payHint', { due: formatPaise(invoice.duePaise) })} />
        {pay.error !== null && <ErrorAlert error={pay.error} />}
        <FormActions pending={pay.isPending} onCancel={onDone} />
      </form>
    </DialogContent>
  );
}

/** An advance held for the patient: not revenue until it is set against a bill. */
export function DepositDialog({ patientId, onDone }: { patientId: string; onDone: () => void }) {
  const t = useTranslations('payments.dialogs');
  const tc = useTranslations('common');
  const router = useRouter();
  const deposit = useTakeDeposit();
  const [key] = useState(() => crypto.randomUUID());
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<PaymentFormValues>({ resolver: zodResolver(paymentFormSchema), defaultValues: EMPTY_PAYMENT });

  return (
    <DialogContent title={t('depositTitle')} description={t('depositDescription')} closeLabel={tc('close')}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          void handleSubmit((values) => {
            const body = paymentBody(values);
            if (body === null) return;
            deposit.mutate(
              { body: { patientId, ...body }, key },
              {
                onSuccess: (receipt) => {
                  onDone();
                  router.push(`/payments/receipts/${receipt.id}`);
                },
              },
            );
          })(event);
        }}
      >
        <PaymentFields register={register} control={control} errors={errors} />
        {deposit.error !== null && <ErrorAlert error={deposit.error} />}
        <FormActions pending={deposit.isPending} onCancel={onDone} />
      </form>
    </DialogContent>
  );
}

const applySchema = z.object({ rupees: z.string().refine((value) => (parseRupeesToPaise(value) ?? 0) > 0) });

/** Sets held deposit against a bill, defaulting to as much as both allow. No money changes hands. */
export function ApplyDepositDialog({ invoice, heldPaise, onDone }: { invoice: InvoiceSummary; heldPaise: number; onDone: () => void }) {
  const t = useTranslations('payments.dialogs');
  const tc = useTranslations('common');
  const apply = useApplyDeposit(invoice.id);
  const [key] = useState(() => crypto.randomUUID());
  const most = Math.min(heldPaise, invoice.duePaise);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ rupees: string }>({ resolver: zodResolver(applySchema), defaultValues: { rupees: paiseToRupeesInput(most) } });

  return (
    <DialogContent
      title={t('applyTitle', { number: invoice.number ?? '' })}
      description={t('applyDescription', { held: formatPaise(heldPaise), due: formatPaise(invoice.duePaise) })}
      closeLabel={tc('close')}
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          void handleSubmit((values) => {
            const amountPaise = parseRupeesToPaise(values.rupees);
            if (amountPaise === null) return;
            apply.mutate({ body: { amountPaise }, key }, { onSuccess: onDone });
          })(event);
        }}
      >
        <TextField
          id="apply-amount"
          label={t('applyAmount')}
          hint={t('applyHint', { most: formatPaise(most) })}
          inputMode="decimal"
          autoComplete="off"
          className="text-lg tabular-nums"
          error={errors.rupees && t('amountError')}
          {...register('rupees')}
        />
        {apply.error !== null && <ErrorAlert error={apply.error} />}
        <FormActions pending={apply.isPending} onCancel={onDone} />
      </form>
    </DialogContent>
  );
}
