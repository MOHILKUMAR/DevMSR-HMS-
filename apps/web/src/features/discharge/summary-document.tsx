import type { DischargeSummaryDocument } from '@devmsr/validation';
import { useTranslations } from 'next-intl';
import { IssuerHeader } from '@/features/billing/invoice-document';
import { AgeSex } from '@/features/patients/age-sex';
import { formatDate, formatDateTime } from '@/lib/format';

/** The discharge summary as printed on A4: drafted by the treating doctor and signed off by the MD. */
export function SummaryDocument({ summary }: { summary: DischargeSummaryDocument }) {
  const t = useTranslations('discharge.document');
  const content = summary.content;
  const sections = content === null ? [] : ([
    [t('diagnosis'), content.diagnosis],
    [t('courseInHospital'), content.courseInHospital],
    [t('conditionAtDischarge'), content.conditionAtDischarge],
    [t('medications'), content.medications],
    [t('advice'), content.advice],
  ] as const);
  return (
    <div className="space-y-3 text-sm text-print-ink">
      <IssuerHeader issuer={summary.issuer} title={t('title')} size="a4" />
      <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
        <p>
          {summary.patient.fullName}, <span className="font-mono">{summary.patient.uhid}</span>, <AgeSex patient={summary.patient} />
        </p>
        <p className="text-right">{t('admission', { number: summary.admissionNumber })}</p>
        <p>{t('doctor', { name: summary.doctorName, department: summary.departmentName })}</p>
        <p className="text-right">{t('admittedAt', { time: formatDateTime(summary.admittedAt) })}</p>
        <p>{summary.wardName === null ? '' : t('ward', { name: summary.wardName })}</p>
        <p className="text-right">{summary.dischargedAt === null ? t('notDischarged') : t('dischargedAt', { time: formatDateTime(summary.dischargedAt) })}</p>
      </div>
      {content === null ? (
        <p className="py-4 text-center">{t('notWritten')}</p>
      ) : (
        <>
          {sections
            .filter(([, text]) => text !== null)
            .map(([label, text]) => (
              <section key={label} className="space-y-0.5 border-t border-print-rule pt-2">
                <h2 className="font-semibold">{label}</h2>
                <p className="whitespace-pre-line">{text}</p>
              </section>
            ))}
          {content.followUpDate !== null && <p className="border-t border-print-rule pt-2">{t('followUp', { date: formatDate(content.followUpDate) })}</p>}
        </>
      )}
      <div className="grid grid-cols-2 gap-x-6 border-t border-print-rule pt-2">
        <p>{summary.draftedByName === null ? '' : t('draftedBy', { name: summary.draftedByName })}</p>
        <p className="text-right font-medium">
          {summary.signedAt === null ? t('unsigned') : t('signedBy', { name: summary.signedByName ?? '', time: formatDateTime(summary.signedAt) })}
        </p>
      </div>
    </div>
  );
}
