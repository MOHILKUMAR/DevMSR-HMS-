import type { Patient } from '@devmsr/validation';
import { CircleCheck, Pencil } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { formatDate, formatDateTime } from '@/lib/format';
import { AgeSex } from './age-sex';
import { formatMobile, maskedAadhaar, maskedAbha } from './format';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-md border border-border bg-surface p-4">
      <h2 className="text-base font-semibold">{title}</h2>
      <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-2 text-sm">{children}</dl>
    </section>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-text-muted">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

/** A patient's record, read-only. `notice` says what just happened: registered or saved. */
export async function PatientRecord({ patient, canEdit, notice }: { patient: Patient; canEdit: boolean; notice: 'registered' | 'none' }) {
  const t = await getTranslations('patients');
  const tr = await getTranslations('patients.record');
  const notGiven = <span className="text-text-muted">{tr('notGiven')}</span>;
  const address = [patient.addressLine, patient.city, patient.state, patient.pincode].filter((part) => part !== null).join(', ');

  return (
    <article aria-labelledby="patient-name" className="max-w-4xl space-y-5">
      {notice === 'registered' && (
        <p role="status" className="flex items-center gap-2 rounded-md bg-success-soft px-3 py-2 text-sm text-success">
          <CircleCheck className="size-4 shrink-0" aria-hidden />
          {t('registered', { uhid: patient.uhid })}
        </p>
      )}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="font-mono text-2xl font-semibold tabular-nums">
            <span className="sr-only">{tr('uhid')} </span>
            {patient.uhid}
          </p>
          <h1 id="patient-name" className="text-xl font-semibold">
            {patient.fullName}
          </h1>
          <p className="text-text-muted">
            <AgeSex patient={patient} />
            {patient.guardianRelation !== null && patient.guardianName !== null && (
              <>
                , {t(`relation.${patient.guardianRelation}`)} {patient.guardianName}
              </>
            )}
          </p>
        </div>
        {canEdit && (
          <Button asChild variant="outline">
            <Link href={`/patients/${patient.id}/edit`}>
              <Pencil aria-hidden />
              {tr('editDetails')}
            </Link>
          </Button>
        )}
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title={tr('contact')}>
          <Item label={tr('mobile')}>{patient.phone === null ? notGiven : <span className="tabular-nums">{formatMobile(patient.phone)}</span>}</Item>
          <Item label={tr('emergencyContact')}>
            {patient.emergencyContactName === null && patient.emergencyContactPhone === null
              ? notGiven
              : [patient.emergencyContactName, patient.emergencyContactPhone === null ? null : formatMobile(patient.emergencyContactPhone)]
                  .filter((part) => part !== null)
                  .join(', ')}
          </Item>
          <Item label={tr('address')}>{address === '' ? notGiven : address}</Item>
        </Section>

        <Section title={tr('personal')}>
          <Item label={tr('sex')}>{t(`sex.${patient.sex}`)}</Item>
          <Item label={tr('dateOfBirth')}>
            {patient.dateOfBirth === null ? (
              notGiven
            ) : (
              <>
                <span className="tabular-nums">{formatDate(patient.dateOfBirth)}</span>
                {patient.dateOfBirthEstimated && <span className="text-text-muted"> ({tr('estimated')})</span>}
              </>
            )}
          </Item>
          <Item label={tr('guardian')}>
            {patient.guardianRelation === null || patient.guardianName === null
              ? notGiven
              : `${t(`relation.${patient.guardianRelation}`)} ${patient.guardianName}`}
          </Item>
        </Section>

        <Section title={tr('identity')}>
          <Item label={tr('aadhaar')}>{patient.aadhaarLast4 === null ? notGiven : <span className="font-mono">{maskedAadhaar(patient.aadhaarLast4)}</span>}</Item>
          <Item label={tr('abha')}>{patient.abhaNumberLast4 === null ? notGiven : <span className="font-mono">{maskedAbha(patient.abhaNumberLast4)}</span>}</Item>
        </Section>

        <Section title={tr('recordTitle')}>
          <Item label={tr('registeredOn')}>
            <span className="tabular-nums">{formatDateTime(patient.registeredAt)}</span>
            {patient.registeredByName !== null && <span className="text-text-muted"> ({patient.registeredByName})</span>}
          </Item>
          <Item label={tr('updatedOn')}>
            <span className="tabular-nums">{formatDateTime(patient.updatedAt)}</span>
          </Item>
        </Section>
      </div>
    </article>
  );
}
