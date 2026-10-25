import type { Invoice, Issuer } from '@devmsr/validation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { AgeSex } from '@/features/patients/age-sex';
import { formatMobile } from '@/features/patients/format';
import { formatDate, formatDateTime, formatPaise } from '@/lib/format';
import { formatBp } from '@/lib/money';
import { cn } from '@/lib/utils';

export type DocumentSize = 'a4' | 'thermal';

/** The hospital header of a bill or receipt (section 16: hospital header on every print). */
export function IssuerHeader({ issuer, title, size }: { issuer: Issuer; title: string; size: DocumentSize }) {
  const t = useTranslations('billing.document');
  const address = [issuer.addressLine, issuer.city, issuer.state, issuer.pincode].filter((part) => part !== null).join(', ');
  return (
    <header className={cn('border-b border-print-rule pb-2', size === 'thermal' ? 'text-center' : '')}>
      <p className={cn('font-semibold', size === 'thermal' ? 'text-base' : 'text-xl')}>{issuer.name}</p>
      {address !== '' && <p>{address}</p>}
      {(issuer.phone !== null || issuer.email !== null) && <p>{[issuer.phone, issuer.email].filter((part) => part !== null).join(', ')}</p>}
      {issuer.gstin !== null && <p>{t('gstin', { gstin: issuer.gstin })}</p>}
      <p className={cn('mt-2 font-semibold uppercase tracking-wide', size === 'thermal' ? 'text-sm' : 'text-base')}>{title}</p>
    </header>
  );
}

function Row({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-4', strong && 'font-semibold')}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/**
 * A bill as printed: hospital, patient, lines with CGST and SGST, totals with round off, and what
 * is paid and due. A4 shows every column; the 80 mm thermal slip keeps description, quantity and amount.
 */
export function InvoiceDocument({ invoice, size }: { invoice: Invoice; size: DocumentSize }) {
  const t = useTranslations('billing.document');
  const issued = invoice.status === 'issued';
  const title = issued ? t('billTitle') : t('draftTitle');
  const thermal = size === 'thermal';

  return (
    <div className={cn('space-y-3 text-print-ink', thermal ? 'text-xs' : 'text-sm')}>
      <IssuerHeader issuer={invoice.issuer} title={title} size={size} />

      <div className={cn('grid gap-x-6 gap-y-0.5', thermal ? 'grid-cols-1' : 'grid-cols-2')}>
        <Row label={t('billNumber')} value={<span className="font-mono">{invoice.number ?? t('notIssued')}</span>} />
        <Row label={t('billDate')} value={invoice.issuedAt === null ? t('notIssued') : formatDateTime(invoice.issuedAt)} />
        <Row label={t('uhid')} value={<span className="font-mono">{invoice.patient.uhid}</span>} />
        <Row label={t('patient')} value={invoice.patient.fullName} />
        <Row label={t('ageSex')} value={<AgeSex patient={invoice.patient} />} />
        {invoice.patient.phone !== null && <Row label={t('mobile')} value={formatMobile(invoice.patient.phone)} />}
        {!thermal && invoice.patient.address !== null && <Row label={t('address')} value={invoice.patient.address} />}
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-print-rule text-left">
            {!thermal && <th className="py-1 pr-2">{t('lineNo')}</th>}
            <th className="py-1 pr-2">{t('description')}</th>
            {!thermal && <th className="py-1 pr-2">{t('date')}</th>}
            <th className="py-1 pr-2 text-right">{t('quantity')}</th>
            {!thermal && <th className="py-1 pr-2 text-right">{t('rate')}</th>}
            {!thermal && <th className="py-1 pr-2 text-right">{t('taxRate')}</th>}
            {!thermal && <th className="py-1 pr-2 text-right">{t('cgst')}</th>}
            {!thermal && <th className="py-1 pr-2 text-right">{t('sgst')}</th>}
            <th className="py-1 text-right">{t(thermal ? 'amount' : 'taxable')}</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((line) => (
            <tr key={line.lineNo} className="border-b border-print-rule/40 align-top">
              {!thermal && <td className="py-1 pr-2 tabular-nums">{line.lineNo}</td>}
              <td className="py-1 pr-2">{line.description}</td>
              {!thermal && <td className="py-1 pr-2 tabular-nums">{formatDate(line.serviceDate)}</td>}
              <td className="py-1 pr-2 text-right tabular-nums">{line.quantity}</td>
              {!thermal && <td className="py-1 pr-2 text-right tabular-nums">{formatPaise(line.unitRatePaise)}</td>}
              {!thermal && <td className="py-1 pr-2 text-right tabular-nums">{formatBp(line.taxRateBp)}</td>}
              {!thermal && <td className="py-1 pr-2 text-right tabular-nums">{formatPaise(line.cgstPaise)}</td>}
              {!thermal && <td className="py-1 pr-2 text-right tabular-nums">{formatPaise(line.sgstPaise)}</td>}
              <td className="py-1 text-right tabular-nums">{formatPaise(thermal ? line.totalPaise : line.taxablePaise)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={cn('ml-auto space-y-0.5', thermal ? 'w-full' : 'w-72')}>
        <Row label={t('subtotal')} value={formatPaise(invoice.subtotalPaise)} />
        {invoice.discountPaise > 0 && <Row label={t('discount')} value={`-${formatPaise(invoice.discountPaise)}`} />}
        <Row label={t('cgst')} value={formatPaise(invoice.cgstPaise)} />
        <Row label={t('sgst')} value={formatPaise(invoice.sgstPaise)} />
        <Row label={t('roundOff')} value={formatPaise(invoice.roundOffPaise)} />
        <div className="border-t border-print-rule pt-1">
          <Row label={t('total')} value={formatPaise(invoice.totalPaise)} strong />
        </div>
        {issued && <Row label={t('paid')} value={formatPaise(invoice.paidPaise)} />}
        {issued && <Row label={t('due')} value={formatPaise(invoice.duePaise)} strong />}
      </div>

      {issued && invoice.issuedByName !== null && <p className="pt-2">{t('issuedBy', { name: invoice.issuedByName })}</p>}
    </div>
  );
}
