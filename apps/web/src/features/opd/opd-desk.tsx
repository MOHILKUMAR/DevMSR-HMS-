'use client';

import type { OpdVisit, PatientSummary } from '@devmsr/validation';
import { Printer, Ticket, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ErrorAlert, FormActions, SelectField, TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Table, TableBody, TableHead, TableMessage, Td, Th } from '@/components/ui/table';
import { AgeSex } from '@/features/patients/age-sex';
import { PatientPicker } from '@/features/patients/patient-picker';
import { useDoctorOptions } from '@/features/settings/queries';
import { formatPaise } from '@/lib/format';
import { zodResolver } from '@/lib/forms';
import { useCancelVisit, useIssueToken, useOpdVisits } from './queries';
import { VisitStatus } from './visit-status';

function CancelDialog({ visit, onDone }: { visit: OpdVisit; onDone: () => void }) {
  const t = useTranslations('opd.desk');
  const tc = useTranslations('common');
  const cancel = useCancelVisit(visit.id);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ reason: string }>({ resolver: zodResolver(z.object({ reason: z.string().trim().min(3).max(200) })), defaultValues: { reason: '' } });
  return (
    <DialogContent title={t('cancelTitle', { token: visit.tokenNumber })} description={t('cancelDescription')} closeLabel={tc('close')}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          void handleSubmit((values) => {
            cancel.mutate({ reason: values.reason.trim() }, { onSuccess: onDone });
          })(event);
        }}
      >
        <TextField id="cancel-reason" label={t('cancelReason')} error={errors.reason && t('cancelReasonError')} {...register('reason')} />
        {cancel.error !== null && <ErrorAlert error={cancel.error} />}
        <FormActions pending={cancel.isPending} onCancel={onDone} />
      </form>
    </DialogContent>
  );
}

/** Issues a token: the patient, then the doctor. The token prints for the patient to take to the cash counter. */
function IssueToken() {
  const t = useTranslations('opd.desk');
  const doctors = useDoctorOptions();
  const issue = useIssueToken();
  const [patient, setPatient] = useState<PatientSummary | null>(null);
  const [doctorId, setDoctorId] = useState('');
  // One key per token: a resend after a lost response returns the same token, not a second one.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const issued = issue.data;

  const reset = () => {
    setPatient(null);
    setDoctorId('');
    setKey(crypto.randomUUID());
    issue.reset();
  };

  if (issued !== undefined) {
    return (
      <div role="status" className="max-w-xl space-y-3 rounded-md border border-border bg-surface p-4">
        <p className="text-sm text-text-muted">{t('issuedFor', { name: issued.patient.fullName, doctor: issued.doctor.fullName })}</p>
        <p className="text-3xl font-semibold tabular-nums">{t('tokenNumber', { token: issued.tokenNumber })}</p>
        <p>{t('payAtCounter', { fee: formatPaise(issued.quotedFeePaise) })}</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={`/print/opd-tokens/${issued.id}`} target="_blank" rel="noopener">
              <Printer aria-hidden />
              {t('printSlip')}
            </a>
          </Button>
          <Button onClick={reset}>{t('nextPatient')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-4 rounded-md border border-border bg-surface p-4">
      <h2 className="text-base font-semibold">{t('issueTitle')}</h2>
      {patient === null ? (
        <PatientPicker id="opd-patient" label={t('findPatient')} onSelect={setPatient} />
      ) : (
        <div className="flex items-start justify-between gap-3 rounded-md bg-primary-soft p-3">
          <div>
            <p className="font-medium">{patient.fullName}</p>
            <p className="text-sm text-text-muted">
              <span className="font-mono">{patient.uhid}</span>, <AgeSex patient={patient} />
            </p>
          </div>
          <Button variant="ghost" aria-label={t('changePatient')} onClick={() => { setPatient(null); }}>
            <X aria-hidden />
          </Button>
        </div>
      )}
      <SelectField
        id="opd-doctor"
        label={t('doctor')}
        value={doctorId}
        onChange={(event) => {
          setDoctorId(event.target.value);
        }}
      >
        <option value="">{doctors.isPending ? t('loadingDoctors') : t('chooseDoctor')}</option>
        {(doctors.data ?? [])
          .filter((doctor) => doctor.isActive)
          .map((doctor) => (
            <option key={doctor.id} value={doctor.id}>
              {doctor.fullName} ({doctor.departmentName})
            </option>
          ))}
      </SelectField>
      {issue.error !== null && <ErrorAlert error={issue.error} />}
      <Button
        disabled={patient === null || doctorId === '' || issue.isPending}
        onClick={() => {
          if (patient !== null) issue.mutate({ body: { patientId: patient.id, doctorId }, key });
        }}
      >
        <Ticket aria-hidden />
        {t('issue')}
      </Button>
    </div>
  );
}

/** The OPD desk: issue tokens, and today's tokens with where each one is. */
export function OpdDesk() {
  const t = useTranslations('opd.desk');
  const visits = useOpdVisits({});
  const [cancelling, setCancelling] = useState<OpdVisit | null>(null);
  const rows = visits.data?.data;

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-text-muted">{t('description')}</p>
      </div>
      <IssueToken />
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t('today')}</h2>
        {visits.error !== null && <ErrorAlert error={visits.error} />}
        <Table>
          <TableHead>
            <tr>
              <Th numeric>{t('token')}</Th>
              <Th>{t('patient')}</Th>
              <Th>{t('doctor')}</Th>
              <Th numeric>{t('fee')}</Th>
              <Th>{t('status')}</Th>
              <Th>
                <span className="sr-only">{t('actions')}</span>
              </Th>
            </tr>
          </TableHead>
          <TableBody>
            {rows === undefined && <TableMessage colSpan={6}>{t('loading')}</TableMessage>}
            {rows?.length === 0 && <TableMessage colSpan={6}>{t('none')}</TableMessage>}
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
                  <VisitStatus status={visit.status} />
                </Td>
                <Td>
                  <div className="flex justify-end gap-2">
                    <Button asChild variant="ghost" aria-label={t('printSlipFor', { token: visit.tokenNumber })}>
                      <a href={`/print/opd-tokens/${visit.id}`} target="_blank" rel="noopener">
                        <Printer aria-hidden />
                      </a>
                    </Button>
                    {visit.status === 'awaiting_payment' && (
                      <Button variant="ghost" onClick={() => { setCancelling(visit); }}>
                        {t('cancel')}
                      </Button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog
        open={cancelling !== null}
        onOpenChange={(open) => {
          if (!open) setCancelling(null);
        }}
      >
        {cancelling !== null && <CancelDialog key={cancelling.id} visit={cancelling} onDone={() => { setCancelling(null); }} />}
      </Dialog>
    </section>
  );
}
