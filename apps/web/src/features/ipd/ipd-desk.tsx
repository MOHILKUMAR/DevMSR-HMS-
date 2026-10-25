'use client';

import type { Admission, PatientSummary } from '@devmsr/validation';
import { BedDouble, TriangleAlert, X } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert, SelectField, TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableHead, TableMessage, Td, Th } from '@/components/ui/table';
import { AgeSex } from '@/features/patients/age-sex';
import { PatientPicker } from '@/features/patients/patient-picker';
import { useDoctorOptions } from '@/features/settings/queries';
import { formatDate, formatDateTime, formatPaise } from '@/lib/format';
import { useAdmissionAdvised, useAdmissions, useAdmit, useBedBoard } from './queries';

type Chosen = { patient: Pick<PatientSummary, 'id' | 'fullName' | 'uhid'> & Partial<PatientSummary>; opdVisitId?: string; doctorId?: string };

/** The free beds, grouped by ward, with each ward's room category and minimum advance. */
function FreeBedSelect({ value, onChange }: { value: string; onChange: (bedId: string) => void }) {
  const t = useTranslations('ipd.admit');
  const board = useBedBoard();
  const wards = (board.data?.wards ?? []).filter((ward) => ward.roomCategory !== null && ward.beds.some((bed) => bed.status === 'free'));
  return (
    <SelectField id="admit-bed" label={t('bed')} value={value} onChange={(event) => { onChange(event.target.value); }}>
      <option value="">{board.isPending ? t('loadingBeds') : wards.length === 0 ? t('noFreeBeds') : t('chooseBed')}</option>
      {wards.map((ward) => (
        <optgroup key={ward.id} label={t('wardGroup', { ward: ward.name, category: ward.roomCategory?.name ?? '', advance: formatPaise(ward.roomCategory?.minimumAdvancePaise ?? 0) })}>
          {ward.beds
            .filter((bed) => bed.status === 'free')
            .map((bed) => (
              <option key={bed.id} value={bed.id}>
                {ward.code} {bed.code}
              </option>
            ))}
        </optgroup>
      ))}
    </SelectField>
  );
}

/** Admits a patient into a free bed. A short advance is a warning only (docs/billing-rules.md). */
function AdmitForm({ chosen, onChosen }: { chosen: Chosen | null; onChosen: (chosen: Chosen | null) => void }) {
  const t = useTranslations('ipd.admit');
  const doctors = useDoctorOptions();
  const admit = useAdmit();
  const [doctorId, setDoctorId] = useState(chosen?.doctorId ?? '');
  const [bedId, setBedId] = useState('');
  const [reason, setReason] = useState('');
  const [key, setKey] = useState(() => crypto.randomUUID());
  const admitted: Admission | undefined = admit.data;
  const validReason = reason.trim() === '' || (reason.trim().length >= 3 && reason.trim().length <= 500);

  if (admitted !== undefined) {
    return (
      <div role="status" className="max-w-xl space-y-3 rounded-md border border-border bg-surface p-4">
        <p className="text-lg font-semibold">{t('admitted', { number: admitted.number, bed: admitted.bed === null ? '' : `${admitted.bed.wardName} ${admitted.bed.code}` })}</p>
        {admitted.advanceShort && (
          <p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            {t('advanceShort', { held: formatPaise(admitted.depositHeldPaise), minimum: formatPaise(admitted.minimumAdvancePaise) })}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/ipd/admissions/${admitted.id}`}>{t('open')}</Link>
          </Button>
          <Button
            onClick={() => {
              admit.reset();
              onChosen(null);
              setBedId('');
              setReason('');
              setKey(crypto.randomUUID());
            }}
          >
            {t('next')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-4 rounded-md border border-border bg-surface p-4">
      <h2 className="text-base font-semibold">{t('title')}</h2>
      {chosen === null ? (
        <PatientPicker id="admit-patient" label={t('findPatient')} onSelect={(patient) => { onChosen({ patient }); }} />
      ) : (
        <div className="flex items-start justify-between gap-3 rounded-md bg-primary-soft p-3">
          <div>
            <p className="font-medium">{chosen.patient.fullName}</p>
            <p className="font-mono text-sm text-text-muted">{chosen.patient.uhid}</p>
            {chosen.opdVisitId !== undefined && <p className="text-sm text-text-muted">{t('fromOpd')}</p>}
          </div>
          <Button variant="ghost" aria-label={t('changePatient')} onClick={() => { onChosen(null); }}>
            <X aria-hidden />
          </Button>
        </div>
      )}
      <SelectField id="admit-doctor" label={t('doctor')} value={doctorId} onChange={(event) => { setDoctorId(event.target.value); }}>
        <option value="">{t('chooseDoctor')}</option>
        {(doctors.data ?? [])
          .filter((doctor) => doctor.isActive)
          .map((doctor) => (
            <option key={doctor.id} value={doctor.id}>
              {doctor.fullName} ({doctor.departmentName})
            </option>
          ))}
      </SelectField>
      <FreeBedSelect value={bedId} onChange={setBedId} />
      <TextField id="admit-reason" label={t('reason')} value={reason} error={validReason ? undefined : t('reasonError')} onChange={(event) => { setReason(event.target.value); }} />
      {admit.error !== null && <ErrorAlert error={admit.error} />}
      <Button
        disabled={chosen === null || doctorId === '' || bedId === '' || !validReason || admit.isPending}
        onClick={() => {
          if (chosen === null) return;
          admit.mutate({
            body: {
              patientId: chosen.patient.id,
              doctorId,
              bedId,
              ...(reason.trim() === '' ? {} : { reason: reason.trim() }),
              ...(chosen.opdVisitId === undefined ? {} : { opdVisitId: chosen.opdVisitId }),
            },
            key,
          });
        }}
      >
        <BedDouble aria-hidden />
        {t('admit')}
      </Button>
    </div>
  );
}

/** Patients a doctor advised admitting in OPD this week, who are not admitted yet. */
function Advised({ onAdmit }: { onAdmit: (chosen: Chosen) => void }) {
  const t = useTranslations('ipd.advised');
  const advised = useAdmissionAdvised();
  const rows = advised.data?.data ?? [];
  if (rows.length === 0) return null;
  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">{t('title')}</h2>
      <Table>
        <TableHead>
          <tr>
            <Th>{t('date')}</Th>
            <Th>{t('patient')}</Th>
            <Th>{t('doctor')}</Th>
            <Th>{t('diagnosis')}</Th>
            <Th>
              <span className="sr-only">{t('actions')}</span>
            </Th>
          </tr>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <tr key={row.visitId}>
              <Td className="tabular-nums">{formatDate(row.visitDate)}</Td>
              <Td>
                {row.patient.fullName}
                <span className="block font-mono text-xs text-text-muted">{row.patient.uhid}</span>
              </Td>
              <Td>{row.doctor.fullName}</Td>
              <Td>{row.diagnosis ?? ''}</Td>
              <Td>
                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => { onAdmit({ patient: row.patient, opdVisitId: row.visitId, doctorId: row.doctor.id }); }}>
                    {t('admit')}
                  </Button>
                </div>
              </Td>
            </tr>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** The IPD desk: admit patients, and everyone admitted now. */
export function IpdDesk({ canAdmit }: { canAdmit: boolean }) {
  const t = useTranslations('ipd.desk');
  const admissions = useAdmissions('admitted');
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const rows = admissions.data?.data;

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-text-muted">{t('description')}</p>
      </div>
      {canAdmit && <AdmitForm key={chosen?.patient.id ?? 'none'} chosen={chosen} onChosen={setChosen} />}
      {canAdmit && <Advised onAdmit={setChosen} />}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t('current')}</h2>
        {admissions.error !== null && <ErrorAlert error={admissions.error} />}
        <Table>
          <TableHead>
            <tr>
              <Th>{t('number')}</Th>
              <Th>{t('patient')}</Th>
              <Th>{t('bed')}</Th>
              <Th>{t('doctor')}</Th>
              <Th>{t('admittedAt')}</Th>
            </tr>
          </TableHead>
          <TableBody>
            {rows === undefined && <TableMessage colSpan={5}>{t('loading')}</TableMessage>}
            {rows?.length === 0 && <TableMessage colSpan={5}>{t('none')}</TableMessage>}
            {rows?.map((row) => (
              <tr key={row.id}>
                <Td>
                  <Link href={`/ipd/admissions/${row.id}`} className="whitespace-nowrap font-mono text-primary underline-offset-4 hover:underline">
                    {row.number}
                  </Link>
                </Td>
                <Td>
                  {row.patient.fullName}
                  <span className="block text-xs text-text-muted">
                    <span className="font-mono">{row.patient.uhid}</span>, <AgeSex patient={row.patient} />
                  </span>
                </Td>
                <Td>{row.bed === null ? '' : `${row.bed.wardName} ${row.bed.code}`}</Td>
                <Td>{row.doctor.fullName}</Td>
                <Td className="whitespace-nowrap tabular-nums">{formatDateTime(row.admittedAt)}</Td>
              </tr>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
