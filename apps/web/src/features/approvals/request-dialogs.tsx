'use client';

import { REFUND_MODES, type ApprovalRequest, type Invoice, type PatientAccount, type RefundMode } from '@devmsr/validation';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type ComponentProps } from 'react';
import { useForm, useWatch, type UseFormRegisterReturn } from 'react-hook-form';
import { z } from 'zod';
import { ErrorAlert, FormActions, SelectField, TextField } from '@/components/form-fields';
import { DialogContent } from '@/components/ui/dialog';
import { Table, TableBody, TableHead, Td, Th } from '@/components/ui/table';
import { formatPaise } from '@/lib/format';
import { zodResolver } from '@/lib/forms';
import { useApprove, usePayRefund, useReject, useRequestCreditNote, useRequestDiscount, useRequestRefund, useRequestVoid } from './queries';
import {
  creditBody,
  creditFormSchema,
  discountBody,
  discountFormSchema,
  payRefundBody,
  payRefundSchema,
  refundBody,
  refundFormSchema,
  type CreditFormValues,
  type DiscountFormValues,
  type RefundFormValues,
} from './request-forms';

function ReasonField({ error, ...props }: { error: boolean } & UseFormRegisterReturn<'reason'>) {
  const t = useTranslations('approvals.form');
  return <TextField id="request-reason" label={t('reason')} hint={t('reasonHint')} error={error ? t('reasonError') : undefined} {...props} />;
}

function Radio({ name, value, label, ...props }: { name: string; value: string; label: string } & ComponentProps<'input'>) {
  return (
    <label className="flex items-center gap-2 text-base">
      <input type="radio" name={name} value={value} className="size-4 accent-primary" {...props} />
      {label}
    </label>
  );
}

/** Asks for a discount on a draft bill: an amount or percentage off the bill, or amounts off chosen lines. */
export function DiscountDialog({ invoice, onDone }: { invoice: Invoice; onDone: () => void }) {
  const t = useTranslations('approvals.discount');
  const tf = useTranslations('approvals.form');
  const tc = useTranslations('common');
  const ask = useRequestDiscount();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<DiscountFormValues>({
    resolver: zodResolver(discountFormSchema),
    defaultValues: { scope: 'bill_amount', rupees: '', percent: '', lines: invoice.lines.map(() => ''), reason: '' },
  });
  const scope = useWatch({ control, name: 'scope' });

  return (
    <DialogContent title={t('title')} description={t('description', { subtotal: formatPaise(invoice.subtotalPaise) })} closeLabel={tc('close')} className="max-w-2xl">
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          void handleSubmit((values) => {
            const body = discountBody(
              invoice.id,
              invoice.lines.map((line) => line.lineNo),
              values,
            );
            if (body !== null) ask.mutate(body, { onSuccess: onDone });
          })(event);
        }}
      >
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('scope')}</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Radio label={t('billAmount')} value="bill_amount" {...register('scope')} />
            <Radio label={t('billPercent')} value="bill_percent" {...register('scope')} />
            <Radio label={t('byLine')} value="lines" {...register('scope')} />
          </div>
        </fieldset>
        {scope === 'bill_amount' && (
          <TextField id="discount-rupees" label={t('amount')} inputMode="decimal" autoComplete="off" className="text-lg tabular-nums" error={errors.rupees && tf('amountError')} {...register('rupees')} />
        )}
        {scope === 'bill_percent' && (
          <TextField id="discount-percent" label={t('percent')} inputMode="decimal" autoComplete="off" className="text-lg tabular-nums" error={errors.percent && t('percentError')} {...register('percent')} />
        )}
        {scope === 'lines' && (
          <div className="space-y-2">
            <Table>
              <TableHead>
                <tr>
                  <Th>{t('line')}</Th>
                  <Th numeric>{t('lineAmount')}</Th>
                  <Th numeric>{t('lineDiscount')}</Th>
                </tr>
              </TableHead>
              <TableBody>
                {invoice.lines.map((line, index) => (
                  <tr key={line.lineNo}>
                    <Td>{line.description}</Td>
                    <Td numeric>{formatPaise(line.amountPaise)}</Td>
                    <Td numeric>
                      <input
                        aria-label={t('lineDiscountFor', { name: line.description })}
                        inputMode="decimal"
                        autoComplete="off"
                        className="h-10 w-32 rounded-md border border-input-border bg-surface px-2 text-right text-base tabular-nums"
                        {...register(`lines.${index}`)}
                      />
                    </Td>
                  </tr>
                ))}
              </TableBody>
            </Table>
            {errors.lines !== undefined && <p className="text-sm text-danger">{t('linesError')}</p>}
          </div>
        )}
        <ReasonField error={errors.reason !== undefined} {...register('reason')} />
        <p className="text-sm text-text-muted">{t('approvalNote')}</p>
        {ask.error !== null && <ErrorAlert error={ask.error} />}
        <FormActions pending={ask.isPending} onCancel={onDone} />
      </form>
    </DialogContent>
  );
}

/** Asks for a credit note on an issued bill: the whole bill (a void) or chosen lines by units or amount. */
export function CreditNoteDialog({ invoice, onDone }: { invoice: Invoice; onDone: () => void }) {
  const t = useTranslations('approvals.credit');
  const tc = useTranslations('common');
  const ask = useRequestCreditNote();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CreditFormValues>({
    resolver: zodResolver(creditFormSchema),
    defaultValues: { scope: 'lines', lines: invoice.lines.map(() => ({ how: 'none' as const, value: '' })), reason: '' },
  });
  const scope = useWatch({ control, name: 'scope' });
  const lines = useWatch({ control, name: 'lines' });

  return (
    <DialogContent title={t('title', { number: invoice.number ?? '' })} description={t('description')} closeLabel={tc('close')} className="max-w-3xl">
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          void handleSubmit((values) => {
            const body = creditBody(
              invoice.id,
              invoice.lines.map((line) => line.lineNo),
              values,
            );
            if (body !== null) ask.mutate(body, { onSuccess: onDone });
          })(event);
        }}
      >
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('scope')}</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Radio label={t('chosenLines')} value="lines" {...register('scope')} />
            <Radio label={t('wholeBill')} value="whole_bill" {...register('scope')} />
          </div>
        </fieldset>
        {scope === 'whole_bill' && <p className="rounded-md bg-warning-soft p-3 text-sm">{t('wholeBillNote')}</p>}
        {scope === 'lines' && (
          <div className="space-y-2">
            <Table>
              <TableHead>
                <tr>
                  <Th>{t('line')}</Th>
                  <Th numeric>{t('quantity')}</Th>
                  <Th numeric>{t('taxable')}</Th>
                  <Th>{t('how')}</Th>
                  <Th numeric>{t('value')}</Th>
                </tr>
              </TableHead>
              <TableBody>
                {invoice.lines.map((line, index) => (
                  <tr key={line.lineNo}>
                    <Td>{line.description}</Td>
                    <Td numeric>{line.quantity}</Td>
                    <Td numeric>{formatPaise(line.taxablePaise)}</Td>
                    <Td>
                      <select
                        aria-label={t('howFor', { name: line.description })}
                        className="h-10 rounded-md border border-input-border bg-surface px-2 text-base"
                        {...register(`lines.${index}.how`)}
                      >
                        <option value="none">{t('howNone')}</option>
                        <option value="quantity">{t('howQuantity')}</option>
                        <option value="amount">{t('howAmount')}</option>
                      </select>
                    </Td>
                    <Td numeric>
                      {lines[index]?.how !== 'none' && (
                        <input
                          aria-label={t('valueFor', { name: line.description })}
                          aria-invalid={errors.lines?.[index]?.value === undefined ? undefined : true}
                          inputMode="decimal"
                          autoComplete="off"
                          className="h-10 w-28 rounded-md border border-input-border bg-surface px-2 text-right text-base tabular-nums aria-invalid:border-danger"
                          {...register(`lines.${index}.value`)}
                        />
                      )}
                    </Td>
                  </tr>
                ))}
              </TableBody>
            </Table>
            {errors.lines !== undefined && <p className="text-sm text-danger">{t('linesError')}</p>}
          </div>
        )}
        <ReasonField error={errors.reason !== undefined} {...register('reason')} />
        {ask.error !== null && <ErrorAlert error={ask.error} />}
        <FormActions pending={ask.isPending} onCancel={onDone} />
      </form>
    </DialogContent>
  );
}

/** Asks for a refund of excess deposit or an overpaid bill. The MD approves every refund. */
export function RefundDialog({ account, onDone }: { account: PatientAccount; onDone: () => void }) {
  const t = useTranslations('approvals.refund');
  const tf = useTranslations('approvals.form');
  const tm = useTranslations('payments.modes');
  const tc = useTranslations('common');
  const ask = useRequestRefund();
  const sources = [
    ...account.receipts
      .filter((receipt) => receipt.purpose === 'deposit' && receipt.heldPaise > 0)
      .map((receipt) => ({ value: `deposit:${receipt.id}`, label: t('fromDeposit', { number: receipt.number, amount: formatPaise(receipt.heldPaise) }), most: receipt.heldPaise })),
    ...account.invoices
      .filter((invoice) => invoice.refundablePaise > 0)
      .map((invoice) => ({ value: `bill:${invoice.id}`, label: t('fromBill', { number: invoice.number ?? '', amount: formatPaise(invoice.refundablePaise) }), most: invoice.refundablePaise })),
  ];
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<RefundFormValues>({ resolver: zodResolver(refundFormSchema), defaultValues: { source: sources[0]?.value ?? '', rupees: '', mode: 'cash', reason: '' } });
  const chosen = useWatch({ control, name: 'source' });
  const source = sources.find((candidate) => candidate.value === chosen);

  return (
    <DialogContent title={t('title')} description={t('description')} closeLabel={tc('close')}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          void handleSubmit((values) => {
            const body = refundBody(values);
            if (body !== null) ask.mutate(body, { onSuccess: onDone });
          })(event);
        }}
      >
        <SelectField id="refund-source" label={t('source')} error={errors.source && t('sourceError')} {...register('source')}>
          {sources.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <TextField
          id="refund-amount"
          label={tf('amount')}
          hint={source === undefined ? undefined : t('most', { amount: formatPaise(source.most) })}
          inputMode="decimal"
          autoComplete="off"
          className="text-lg tabular-nums"
          error={errors.rupees && tf('amountError')}
          {...register('rupees')}
        />
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('mode')}</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {REFUND_MODES.map((mode) => (
              <Radio key={mode} label={tm(mode)} value={mode} {...register('mode')} />
            ))}
          </div>
        </fieldset>
        <ReasonField error={errors.reason !== undefined} {...register('reason')} />
        <p className="text-sm text-text-muted">{t('approvalNote')}</p>
        {ask.error !== null && <ErrorAlert error={ask.error} />}
        <FormActions pending={ask.isPending} onCancel={onDone} />
      </form>
    </DialogContent>
  );
}

/** Asks for a receipt entered by mistake to be voided. Finance or the MD approves. */
export function VoidDialog({ receipt, onDone }: { receipt: { id: string; number: string; amountPaise: number }; onDone: () => void }) {
  const t = useTranslations('approvals.void');
  const tc = useTranslations('common');
  const ask = useRequestVoid();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ reason: string }>({ resolver: zodResolver(z.object({ reason: z.string().trim().min(3).max(500) })), defaultValues: { reason: '' } });

  return (
    <DialogContent title={t('title', { number: receipt.number })} description={t('description', { amount: formatPaise(receipt.amountPaise) })} closeLabel={tc('close')}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          void handleSubmit((values) => {
            ask.mutate({ receiptId: receipt.id, reason: values.reason.trim() }, { onSuccess: onDone });
          })(event);
        }}
      >
        <ReasonField error={errors.reason !== undefined} {...register('reason')} />
        {ask.error !== null && <ErrorAlert error={ask.error} />}
        <FormActions pending={ask.isPending} onCancel={onDone} />
      </form>
    </DialogContent>
  );
}

/** Pays out an approved refund from the cashier's open shift, then opens the refund to print. */
export function PayRefundDialog({ request, mode, onDone }: { request: ApprovalRequest; mode: RefundMode; onDone: () => void }) {
  const t = useTranslations('approvals.pay');
  const tp = useTranslations('payments.form');
  const tm = useTranslations('payments.modes');
  const tc = useTranslations('common');
  const router = useRouter();
  const pay = usePayRefund(request.id);
  const [key] = useState(() => crypto.randomUUID());
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ reference: string; bankName: string }>({ resolver: zodResolver(payRefundSchema(mode)), defaultValues: { reference: '', bankName: '' } });

  return (
    <DialogContent
      title={t('title', { amount: formatPaise(request.amountPaise) })}
      description={t('description', { mode: tm(mode), name: request.patient.fullName })}
      closeLabel={tc('close')}
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          void handleSubmit((values) => {
            pay.mutate(
              { body: payRefundBody(mode, values), key },
              {
                onSuccess: (refund) => {
                  onDone();
                  router.push(`/payments/refunds/${refund.id}`);
                },
              },
            );
          })(event);
        }}
      >
        {mode !== 'cash' && (
          <TextField
            id="refund-reference"
            label={tp(`reference.${mode}`)}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            error={errors.reference && tp('referenceError')}
            {...register('reference')}
          />
        )}
        {(mode === 'bank_transfer' || mode === 'cheque') && (
          <TextField id="refund-bank" label={tp('bankName')} autoComplete="off" error={errors.bankName && tp('bankNameError')} {...register('bankName')} />
        )}
        {mode === 'cash' && <p className="text-sm">{t('cashNote')}</p>}
        {pay.error !== null && <ErrorAlert error={pay.error} />}
        <FormActions pending={pay.isPending} onCancel={onDone} />
      </form>
    </DialogContent>
  );
}

/** Approves (with an optional note) or rejects (with a reason) a request. */
export function DecisionDialog({ request, decision, onDone }: { request: ApprovalRequest; decision: 'approve' | 'reject'; onDone: () => void }) {
  const t = useTranslations('approvals.decide');
  const tk = useTranslations('approvals.kinds');
  const tc = useTranslations('common');
  const approve = useApprove(request.kind, request.id);
  const reject = useReject(request.kind, request.id);
  const [key] = useState(() => crypto.randomUUID());
  const schema = z.object({ note: decision === 'reject' ? z.string().trim().min(3).max(500) : z.string().trim().max(500) });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ note: string }>({ resolver: zodResolver(schema), defaultValues: { note: '' } });
  const pending = approve.isPending || reject.isPending;
  const error = approve.error ?? reject.error;

  return (
    <DialogContent
      title={decision === 'approve' ? t('approveTitle', { kind: tk(request.kind) }) : t('rejectTitle', { kind: tk(request.kind) })}
      description={t('description', { name: request.patient.fullName, amount: formatPaise(request.amountPaise) })}
      closeLabel={tc('close')}
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          void handleSubmit((values) => {
            const note = values.note.trim();
            if (decision === 'approve') approve.mutate({ body: note === '' ? {} : { note }, key }, { onSuccess: onDone });
            else reject.mutate({ note }, { onSuccess: onDone });
          })(event);
        }}
      >
        <TextField
          id="decision-note"
          label={decision === 'approve' ? t('noteOptional') : t('noteRequired')}
          error={errors.note && t('noteError')}
          {...register('note')}
        />
        {error !== null && <ErrorAlert error={error} />}
        <FormActions pending={pending} onCancel={onDone} />
      </form>
    </DialogContent>
  );
}
