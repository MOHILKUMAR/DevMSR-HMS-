import type { OpdVisit } from '@devmsr/validation';
import { useTranslations } from 'next-intl';
import { AgeSex } from '@/features/patients/age-sex';
import { formatDate, formatDateTime, formatPaise } from '@/lib/format';

/** The OPD token slip, on an 80 mm printer: the number large, then who and where. */
export function TokenSlip({ visit, hospitalName }: { visit: OpdVisit; hospitalName: string }) {
  const t = useTranslations('opd.slip');
  return (
    <div className="space-y-2 text-center text-sm text-print-ink">
      <p className="font-semibold">{hospitalName}</p>
      <p className="border-b border-print-rule pb-1 text-xs uppercase tracking-wide">{t('title')}</p>
      <p className="text-5xl font-semibold tabular-nums">{visit.tokenNumber}</p>
      <p>{formatDate(visit.visitDate)}</p>
      <div className="space-y-0.5 border-y border-print-rule py-2 text-left">
        <p>
          <span className="font-medium">{visit.patient.fullName}</span>, <AgeSex patient={visit.patient} />
        </p>
        <p className="font-mono">{visit.patient.uhid}</p>
        <p>{t('doctor', { name: visit.doctor.fullName, department: visit.doctor.departmentName })}</p>
      </div>
      <p className="font-semibold">
        {visit.status === 'awaiting_payment' ? t('payFirst', { fee: formatPaise(visit.quotedFeePaise) }) : t('paid', { number: visit.feeInvoiceNumber ?? '' })}
      </p>
      <p className="text-xs">{t('issuedAt', { time: formatDateTime(visit.createdAt) })}</p>
    </div>
  );
}
