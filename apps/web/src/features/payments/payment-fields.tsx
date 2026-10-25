'use client';

import { PAYMENT_MODES } from '@devmsr/validation';
import { useTranslations } from 'next-intl';
import { useWatch, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { TextField } from '@/components/form-fields';
import type { PaymentFormValues } from './payment-form';

/**
 * Amount and payment mode, then only the details that mode needs: the UTR for UPI, approval code
 * and last 4 digits for a card, number and bank for a transfer or cheque.
 */
export function PaymentFields({
  register,
  control,
  errors,
  amountHint,
}: {
  register: UseFormRegister<PaymentFormValues>;
  control: Control<PaymentFormValues>;
  errors: FieldErrors<PaymentFormValues>;
  amountHint?: string;
}) {
  const t = useTranslations('payments.form');
  const tm = useTranslations('payments.modes');
  const mode = useWatch({ control, name: 'mode' });

  return (
    <div className="space-y-4">
      <TextField
        id="payment-amount"
        label={t('amount')}
        hint={amountHint}
        inputMode="decimal"
        autoComplete="off"
        className="text-lg tabular-nums"
        error={errors.rupees && t('amountError')}
        {...register('rupees')}
      />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t('mode')}</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {PAYMENT_MODES.map((value) => (
            <label key={value} className="flex items-center gap-2 text-base">
              <input type="radio" value={value} className="size-4 accent-primary" {...register('mode')} />
              {tm(value)}
            </label>
          ))}
        </div>
      </fieldset>
      {mode !== 'cash' && (
        <TextField
          id="payment-reference"
          label={t(`reference.${mode}`)}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          error={errors.reference && t('referenceError')}
          {...register('reference')}
        />
      )}
      {mode === 'card' && (
        <TextField
          id="payment-card"
          label={t('cardLast4')}
          inputMode="numeric"
          autoComplete="off"
          className="font-mono"
          error={errors.cardLast4 && t('cardLast4Error')}
          {...register('cardLast4')}
        />
      )}
      {(mode === 'bank_transfer' || mode === 'cheque') && (
        <TextField id="payment-bank" label={t('bankName')} autoComplete="off" error={errors.bankName && t('bankNameError')} {...register('bankName')} />
      )}
    </div>
  );
}
