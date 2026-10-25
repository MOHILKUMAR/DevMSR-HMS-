import type { CreditNote, Refund } from '@devmsr/validation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { IssuerHeader, type DocumentSize } from '@/features/billing/invoice-document';
import { formatMobile } from '@/features/patients/format';
import { formatDateTime, formatPaise } from '@/lib/format';
import { cn } from '@/lib/utils';

function Row({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-4', strong && 'font-semibold')}>
      <span>{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  );
}

/** A credit note as printed: the bill it corrects, what is given back on each line, and the total. */
export function CreditNoteDocument({ note, size }: { note: CreditNote; size: DocumentSize }) {
  const t = useTranslations('approvals.document');
  const thermal = size === 'thermal';
  return (
    <div className={cn('space-y-3 text-print-ink', thermal ? 'text-xs' : 'text-sm')}>
      <IssuerHeader issuer={note.issuer} title={t('creditNoteTitle')} size={size} />
      <div className="space-y-0.5">
        <Row label={t('creditNoteNumber')} value={<span className="font-mono">{note.number}</span>} />
        <Row label={t('date')} value={formatDateTime(note.createdAt)} />
        <Row label={t('againstBill')} value={<span className="font-mono">{note.invoiceNumber}</span>} />
        <Row label={t('uhid')} value={<span className="font-mono">{note.patient.uhid}</span>} />
        <Row label={t('patient')} value={note.patient.fullName} />
        {note.patient.phone !== null && <Row label={t('mobile')} value={formatMobile(note.patient.phone)} />}
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-print-rule text-left">
            <th className="py-1 pr-2">{t('description')}</th>
            {!thermal && <th className="py-1 pr-2 text-right">{t('units')}</th>}
            {!thermal && <th className="py-1 pr-2 text-right">{t('taxable')}</th>}
            {!thermal && <th className="py-1 pr-2 text-right">{t('cgst')}</th>}
            {!thermal && <th className="py-1 pr-2 text-right">{t('sgst')}</th>}
            <th className="py-1 text-right">{t('amount')}</th>
          </tr>
        </thead>
        <tbody>
          {note.lines.map((line) => (
            <tr key={line.lineNo} className="border-b border-print-rule/40 align-top">
              <td className="py-1 pr-2">{line.description}</td>
              {!thermal && <td className="py-1 pr-2 text-right tabular-nums">{line.quantity ?? ''}</td>}
              {!thermal && <td className="py-1 pr-2 text-right tabular-nums">{formatPaise(line.taxablePaise)}</td>}
              {!thermal && <td className="py-1 pr-2 text-right tabular-nums">{formatPaise(line.cgstPaise)}</td>}
              {!thermal && <td className="py-1 pr-2 text-right tabular-nums">{formatPaise(line.sgstPaise)}</td>}
              <td className="py-1 text-right tabular-nums">{formatPaise(line.totalPaise)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={cn('ml-auto space-y-0.5', thermal ? 'w-full' : 'w-72')}>
        <Row label={t('taxable')} value={formatPaise(note.taxablePaise)} />
        <Row label={t('cgst')} value={formatPaise(note.cgstPaise)} />
        <Row label={t('sgst')} value={formatPaise(note.sgstPaise)} />
        <Row label={t('roundOff')} value={formatPaise(note.roundOffPaise)} />
        <div className="border-t border-print-rule pt-1">
          <Row label={t('totalCredited')} value={formatPaise(note.totalPaise)} strong />
        </div>
      </div>
      <p>{t('reason', { reason: note.reason })}</p>
      {note.approvedByName !== null && <p>{t('approvedBy', { name: note.approvedByName })}</p>}
    </div>
  );
}

/** A refund as printed: the money paid back, how, and where it came from. */
export function RefundDocument({ refund, size }: { refund: Refund; size: DocumentSize }) {
  const t = useTranslations('approvals.document');
  const tm = useTranslations('payments.modes');
  return (
    <div className={cn('space-y-3 text-print-ink', size === 'thermal' ? 'text-xs' : 'text-sm')}>
      <IssuerHeader issuer={refund.issuer} title={t('refundTitle')} size={size} />
      <div className="space-y-0.5">
        <Row label={t('refundNumber')} value={<span className="font-mono">{refund.number}</span>} />
        <Row label={t('date')} value={formatDateTime(refund.createdAt)} />
        <Row label={t('uhid')} value={<span className="font-mono">{refund.patient.uhid}</span>} />
        <Row label={t('patient')} value={refund.patient.fullName} />
        <Row label={t(refund.source === 'deposit' ? 'fromDeposit' : 'fromBill')} value={<span className="font-mono">{refund.sourceNumber}</span>} />
        <Row label={t('mode')} value={tm(refund.mode)} />
        {refund.reference !== null && <Row label={t('reference')} value={refund.reference} />}
        {refund.bankName !== null && <Row label={t('bank')} value={refund.bankName} />}
      </div>
      <p className={cn('border-y border-print-rule py-2 font-semibold tabular-nums', size === 'thermal' ? 'text-base' : 'text-lg')}>
        {t('amountRefunded', { amount: formatPaise(refund.amountPaise) })}
      </p>
      <p>{t('reason', { reason: refund.reason })}</p>
      {refund.approvedByName !== null && <p>{t('approvedBy', { name: refund.approvedByName })}</p>}
      {refund.paidByName !== null && <p>{t('paidBy', { name: refund.paidByName })}</p>}
      <p className="pt-6">{t('signature')}</p>
    </div>
  );
}
