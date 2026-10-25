'use client';

import type { OpdVisit } from '@devmsr/validation';
import { Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ErrorAlert, FormActions } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Table, TableBody, TableHead, TableMessage, Td, Th } from '@/components/ui/table';
import { EMPTY_PAYMENT, paymentBody, paymentFormSchema, type PaymentFormValues } from '@/features/payments/payment-form';
import { PaymentFields } from '@/features/payments/payment-fields';
import { formatPaise } from '@/lib/format';
import { zodResolver } from '@/lib/forms';
import { paiseToRupeesInput } from '@/lib/money';
import { usePayOpdFee, useOpdVisits } from './queries';

/** Takes one token's consultation fee. The amount is the bill's total, set by the API. */
function FeeDialog({ visit, onDone }: { visit: OpdVisit; onDone: () => void }) {
  const t = useTranslations('opd.fees');
  const tc = useTranslations('common');
  const router = useRouter();
  const pay = usePayOpdFee(visit.id);
  const [key] = useState(() => crypto.randomUUID());
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    // The amount is not sent; it only satisfies the shared form, which the API's bill total replaces.
    defaultValues: { ...EMPTY_PAYMENT, rupees: paiseToRupeesInput(Math.max(visit.quotedFeePaise, 1)) },
  });

  return (
    <DialogContent
      title={t('dialogTitle', { token: visit.tokenNumber })}
      description={t('dialogDescription', { name: visit.patient.fullName, doctor: visit.doctor.fullName, fee: formatPaise(visit.quotedFeePaise) })}
      closeLabel={tc('close')}
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          void handleSubmit((values) => {
            const body = paymentBody(values);
            if (body === null) return;
            const { amountPaise: _amount, ...details } = body;
            pay.mutate(
              { body: details, key },
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
        <PaymentFields register={register} control={control} errors={errors} showAmount={false} />
        {pay.error !== null && <ErrorAlert error={pay.error} />}
        <FormActions pending={pay.isPending} onCancel={onDone} />
      </form>
    </DialogContent>
  );
}

/** Today's OPD tokens waiting for their consultation fee, at the cash counter. */
export function OpdFees() {
  const t = useTranslations('opd.fees');
  const visits = useOpdVisits({ status: 'awaiting_payment' });
  const [paying, setPaying] = useState<OpdVisit | null>(null);
  const rows = visits.data?.data;

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">{t('title')}</h2>
      {visits.error !== null && <ErrorAlert error={visits.error} />}
      <Table>
        <TableHead>
          <tr>
            <Th numeric>{t('token')}</Th>
            <Th>{t('patient')}</Th>
            <Th>{t('doctor')}</Th>
            <Th numeric>{t('fee')}</Th>
            <Th>
              <span className="sr-only">{t('actions')}</span>
            </Th>
          </tr>
        </TableHead>
        <TableBody>
          {rows === undefined && <TableMessage colSpan={5}>{t('loading')}</TableMessage>}
          {rows?.length === 0 && <TableMessage colSpan={5}>{t('none')}</TableMessage>}
          {rows?.map((visit) => (
            <tr key={visit.id}>
              <Td numeric className="text-lg font-semibold">
                {visit.tokenNumber}
              </Td>
              <Td>
                {visit.patient.fullName}
                <span className="block font-mono text-xs text-text-muted">{visit.patient.uhid}</span>
              </Td>
              <Td>{visit.doctor.fullName}</Td>
              <Td numeric>{formatPaise(visit.quotedFeePaise)}</Td>
              <Td>
                <div className="flex justify-end">
                  <Button variant="outline" aria-label={t('collectFor', { token: visit.tokenNumber })} onClick={() => { setPaying(visit); }}>
                    <Wallet aria-hidden />
                    {t('collect')}
                  </Button>
                </div>
              </Td>
            </tr>
          ))}
        </TableBody>
      </Table>
      <Dialog
        open={paying !== null}
        onOpenChange={(open) => {
          if (!open) setPaying(null);
        }}
      >
        {paying !== null && <FeeDialog key={paying.id} visit={paying} onDone={() => { setPaying(null); }} />}
      </Dialog>
    </div>
  );
}
