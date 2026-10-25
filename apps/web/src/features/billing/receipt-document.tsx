import type { Receipt } from '@devmsr/validation';
import { useTranslations } from 'next-intl';
import { formatMobile } from '@/features/patients/format';
import { formatDateTime, formatPaise } from '@/lib/format';
import { cn } from '@/lib/utils';
import { IssuerHeader, type DocumentSize } from './invoice-document';

/** A receipt as printed: the money, how it came in, and what it was set against. */
export function ReceiptDocument({ receipt, size }: { receipt: Receipt; size: DocumentSize }) {
  const t = useTranslations('billing.document');
  const tm = useTranslations('payments.modes');
  const rows: [string, string][] = [
    [t('receiptNumber'), receipt.number],
    [t('receiptDate'), formatDateTime(receipt.createdAt)],
    [t('uhid'), receipt.patient.uhid],
    [t('patient'), receipt.patient.fullName],
    ...(receipt.patient.phone === null ? [] : [[t('mobile'), formatMobile(receipt.patient.phone)] as [string, string]]),
    [t('mode'), tm(receipt.mode)],
    ...(receipt.reference === null ? [] : [[t('reference'), receipt.reference] as [string, string]]),
    ...(receipt.cardLast4 === null ? [] : [[t('card'), `XXXX ${receipt.cardLast4}`] as [string, string]]),
    ...(receipt.bankName === null ? [] : [[t('bank'), receipt.bankName] as [string, string]]),
  ];

  return (
    <div className={cn('space-y-3 text-print-ink', size === 'thermal' ? 'text-xs' : 'text-sm')}>
      <IssuerHeader issuer={receipt.issuer} title={receipt.purpose === 'deposit' ? t('depositTitle') : t('receiptTitle')} size={size} />
      <dl className="space-y-0.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt>{label}</dt>
            <dd className="text-right">{value}</dd>
          </div>
        ))}
      </dl>
      <p className={cn('border-y border-print-rule py-2 font-semibold tabular-nums', size === 'thermal' ? 'text-base' : 'text-lg')}>
        {t('amountReceived', { amount: formatPaise(receipt.amountPaise) })}
      </p>
      {receipt.allocations.map((allocation) => (
        <p key={allocation.invoiceId} className="tabular-nums">
          {t('setAgainst', { amount: formatPaise(allocation.amountPaise), number: allocation.invoiceNumber })}
        </p>
      ))}
      {receipt.purpose === 'deposit' && <p className="tabular-nums">{t('held', { amount: formatPaise(receipt.heldPaise) })}</p>}
      {receipt.receivedByName !== null && <p className="pt-2">{t('receivedBy', { name: receipt.receivedByName })}</p>}
    </div>
  );
}
