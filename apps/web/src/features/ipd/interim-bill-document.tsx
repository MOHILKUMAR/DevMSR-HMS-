import type { InterimBill } from '@devmsr/validation';
import { useTranslations } from 'next-intl';
import { IssuerHeader } from '@/features/billing/invoice-document';
import { formatDate, formatDateTime, formatPaise } from '@/lib/format';

/** An interim bill as printed: what the stay has come to so far. It has no number and is not a bill. */
export function InterimBillDocument({ bill }: { bill: InterimBill }) {
  const t = useTranslations('ipd.interim');
  const balance = bill.totalPaise - bill.depositHeldPaise;
  return (
    <div className="space-y-3 text-sm text-print-ink">
      <IssuerHeader issuer={bill.issuer} title={t('title')} size="a4" />
      <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
        <p>{t('admission', { number: bill.admissionNumber })}</p>
        <p className="text-right">{t('generated', { time: formatDateTime(bill.generatedAt) })}</p>
        <p>
          {bill.patient.fullName}, <span className="font-mono">{bill.patient.uhid}</span>
        </p>
        <p className="text-right">{t('admittedAt', { time: formatDateTime(bill.admittedAt) })}</p>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-print-rule text-left">
            <th className="py-1 pr-2">{t('description')}</th>
            <th className="py-1 pr-2">{t('date')}</th>
            <th className="py-1 pr-2 text-right">{t('quantity')}</th>
            <th className="py-1 pr-2 text-right">{t('rate')}</th>
            <th className="py-1 text-right">{t('amount')}</th>
          </tr>
        </thead>
        <tbody>
          {bill.lines.length === 0 && (
            <tr>
              <td colSpan={5} className="py-2 text-center">
                {t('nothing')}
              </td>
            </tr>
          )}
          {bill.lines.map((line, index) => (
            <tr key={`${line.description}-${String(index)}`} className="border-b border-print-rule/40">
              <td className="py-1 pr-2">{line.description}</td>
              <td className="py-1 pr-2 tabular-nums">{formatDate(line.serviceDate)}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{line.quantity}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{formatPaise(line.unitRatePaise)}</td>
              <td className="py-1 text-right tabular-nums">{formatPaise(line.totalPaise)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ml-auto w-72 space-y-0.5">
        {[
          [t('subtotal'), bill.subtotalPaise],
          [t('cgst'), bill.cgstPaise],
          [t('sgst'), bill.sgstPaise],
          [t('roundOff'), bill.roundOffPaise],
        ].map(([label, value]) => (
          <div key={String(label)} className="flex justify-between">
            <dt>{label}</dt>
            <dd className="tabular-nums">{formatPaise(Number(value))}</dd>
          </div>
        ))}
        <div className="flex justify-between border-t border-print-rule pt-1 font-semibold">
          <dt>{t('total')}</dt>
          <dd className="tabular-nums">{formatPaise(bill.totalPaise)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>{t('deposit')}</dt>
          <dd className="tabular-nums">{formatPaise(bill.depositHeldPaise)}</dd>
        </div>
        <div className="flex justify-between font-semibold">
          <dt>{balance >= 0 ? t('balance') : t('excess')}</dt>
          <dd className="tabular-nums">{formatPaise(Math.abs(balance))}</dd>
        </div>
      </dl>
      <p className="text-xs">{t('note')}</p>
    </div>
  );
}
