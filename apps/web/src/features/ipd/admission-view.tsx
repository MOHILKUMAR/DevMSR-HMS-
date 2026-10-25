'use client';

import type { Admission } from '@devmsr/validation';
import { ArrowRightLeft, BedDouble, DoorOpen, Printer, Stethoscope, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert, FormActions, SelectField, TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableHead, TableMessage, Td, Th } from '@/components/ui/table';
import { useMarkFit } from '@/features/discharge/queries';
import { AgeSex } from '@/features/patients/age-sex';
import { formatDate, formatDateTime, formatPaise } from '@/lib/format';
import { InterimBillDocument } from './interim-bill-document';
import { useAdmission, useBedBoard, useInterimBill, useTransfer } from './queries';

function TransferDialog({ admission, onDone }: { admission: Admission; onDone: () => void }) {
  const t = useTranslations('ipd.transfer');
  const tc = useTranslations('common');
  const board = useBedBoard();
  const transfer = useTransfer(admission.id);
  const [bedId, setBedId] = useState('');
  const wards = (board.data?.wards ?? []).filter((ward) => ward.roomCategory !== null && ward.beds.some((bed) => bed.status === 'free'));
  return (
    <DialogContent title={t('title', { name: admission.patient.fullName })} description={t('description')} closeLabel={tc('close')}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (bedId !== '') transfer.mutate({ bedId }, { onSuccess: onDone });
        }}
      >
        <SelectField id="transfer-bed" label={t('bed')} value={bedId} onChange={(event) => { setBedId(event.target.value); }}>
          <option value="">{t('chooseBed')}</option>
          {wards.map((ward) => (
            <optgroup key={ward.id} label={`${ward.name} (${ward.roomCategory?.name ?? ''})`}>
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
        {transfer.error !== null && <ErrorAlert error={transfer.error} />}
        <FormActions pending={transfer.isPending || bedId === ''} onCancel={onDone} />
      </form>
    </DialogContent>
  );
}

/** The treating doctor marks the patient fit for discharge, with an optional note. This starts the discharge. */
function MarkFitDialog({ admission, onDone }: { admission: Admission; onDone: () => void }) {
  const t = useTranslations('ipd.fit');
  const tc = useTranslations('common');
  const router = useRouter();
  const markFit = useMarkFit();
  const [note, setNote] = useState('');
  const validNote = note.trim() === '' || (note.trim().length >= 3 && note.trim().length <= 500);
  return (
    <DialogContent title={t('title', { name: admission.patient.fullName })} description={t('description')} closeLabel={tc('close')}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!validNote) return;
          markFit.mutate(
            { admissionId: admission.id, ...(note.trim() === '' ? {} : { note: note.trim() }) },
            {
              onSuccess: (discharge) => {
                onDone();
                router.push(`/discharge/${discharge.id}`);
              },
            },
          );
        }}
      >
        <TextField id="fit-note" label={t('note')} value={note} error={validNote ? undefined : t('noteError')} onChange={(event) => { setNote(event.target.value); }} />
        {markFit.error !== null && <ErrorAlert error={markFit.error} />}
        <FormActions pending={markFit.isPending || !validNote} onCancel={onDone} />
      </form>
    </DialogContent>
  );
}

/** One admission: the patient, their bed and its history, the nights charged, and the interim bill. */
export function AdmissionView({ id, canTransfer, canSeeBill, canMarkFit }: { id: string; canTransfer: boolean; canSeeBill: boolean; canMarkFit: boolean }) {
  const t = useTranslations('ipd.admission');
  const admission = useAdmission(id);
  const interim = useInterimBill(id, canSeeBill);
  const [moving, setMoving] = useState(false);
  const [markingFit, setMarkingFit] = useState(false);

  if (admission.error !== null) return <ErrorAlert error={admission.error} />;
  if (admission.data === undefined) return <p className="text-text-muted">{t('loading')}</p>;
  const data = admission.data;
  const admitted = data.status === 'admitted';

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold">{t('title', { number: data.number })}</h1>
            {admitted ? <StatusBadge tone="info" icon={BedDouble} label={t('admitted')} /> : <StatusBadge tone="neutral" icon={DoorOpen} label={t('discharged')} />}
          </div>
          <p className="text-text-muted">
            {data.patient.fullName}, <span className="font-mono">{data.patient.uhid}</span>, <AgeSex patient={data.patient} />
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="ghost">
            <Link href="/ipd">{t('back')}</Link>
          </Button>
          {canSeeBill && (
            <Button asChild variant="outline">
              <a href={`/print/interim-bills/${data.id}`} target="_blank" rel="noopener">
                <Printer aria-hidden />
                {t('printInterim')}
              </a>
            </Button>
          )}
          {admitted && canTransfer && (
            <Button variant="outline" onClick={() => { setMoving(true); }}>
              <ArrowRightLeft aria-hidden />
              {t('transfer')}
            </Button>
          )}
          {data.dischargeId !== null && (
            <Button asChild variant="outline">
              <Link href={`/discharge/${data.dischargeId}`}>
                <DoorOpen aria-hidden />
                {t('openDischarge')}
              </Link>
            </Button>
          )}
          {admitted && canMarkFit && data.dischargeId === null && (
            <Button variant="outline" onClick={() => { setMarkingFit(true); }}>
              <Stethoscope aria-hidden />
              {t('markFit')}
            </Button>
          )}
        </div>
      </div>

      {data.advanceShort && (
        <p role="status" className="flex items-start gap-2 rounded-md border border-warning bg-warning-soft p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          {t('advanceShort', { held: formatPaise(data.depositHeldPaise), minimum: formatPaise(data.minimumAdvancePaise) })}
        </p>
      )}

      <dl className="grid gap-x-6 gap-y-2 rounded-md border border-border bg-surface p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-text-muted">{t('bed')}</dt>
          <dd className="font-medium">{data.bed === null ? t('noBed') : `${data.bed.wardName} ${data.bed.code} (${data.bed.roomCategoryName ?? ''})`}</dd>
        </div>
        <div>
          <dt className="text-text-muted">{t('doctor')}</dt>
          <dd className="font-medium">{data.doctor.fullName}</dd>
        </div>
        <div>
          <dt className="text-text-muted">{t('admittedAt')}</dt>
          <dd className="font-medium">{formatDateTime(data.admittedAt)}</dd>
        </div>
        <div className="sm:col-span-3">
          <dt className="text-text-muted">{t('reason')}</dt>
          <dd>{data.reason ?? t('noReason')}</dd>
        </div>
      </dl>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t('beds')}</h2>
        <Table>
          <TableHead>
            <tr>
              <Th>{t('bed')}</Th>
              <Th>{t('from')}</Th>
              <Th>{t('to')}</Th>
            </tr>
          </TableHead>
          <TableBody>
            {data.beds.map((bed) => (
              <tr key={`${bed.id}-${bed.startedAt}`}>
                <Td>
                  {bed.wardName} {bed.code}
                  <span className="block text-xs text-text-muted">{bed.roomCategoryName ?? ''}</span>
                </Td>
                <Td className="tabular-nums">{formatDateTime(bed.startedAt)}</Td>
                <Td className="tabular-nums">{bed.endedAt === null ? t('now') : `${formatDateTime(bed.endedAt)} (${t(`endReason.${bed.endReason ?? 'transfer'}`)})`}</Td>
              </tr>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t('nights')}</h2>
        <p className="text-sm text-text-muted">{t('nightsHint')}</p>
        <Table>
          <TableHead>
            <tr>
              <Th>{t('night')}</Th>
              <Th>{t('charge')}</Th>
              <Th>{t('bed')}</Th>
              <Th numeric>{t('amount')}</Th>
            </tr>
          </TableHead>
          <TableBody>
            {data.dailyCharges.length === 0 && <TableMessage colSpan={4}>{t('noNights')}</TableMessage>}
            {data.dailyCharges.map((day) => (
              <tr key={`${day.chargeDate}-${day.kind}`}>
                <Td className="tabular-nums">{formatDate(day.chargeDate)}</Td>
                <Td>{day.description}</Td>
                <Td className="font-mono">{day.bedCode}</Td>
                <Td numeric>{formatPaise(day.amountPaise)}</Td>
              </tr>
            ))}
          </TableBody>
        </Table>
      </div>

      {canSeeBill && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{t('interim')}</h2>
          {interim.error !== null && <ErrorAlert error={interim.error} />}
          {interim.data !== undefined && (
            <div className="max-w-4xl rounded-md border border-border bg-print-paper p-6 shadow-sm">
              <InterimBillDocument bill={interim.data} />
            </div>
          )}
        </div>
      )}

      <Dialog open={moving} onOpenChange={setMoving}>
        {moving && <TransferDialog admission={data} onDone={() => { setMoving(false); }} />}
      </Dialog>
      <Dialog open={markingFit} onOpenChange={setMarkingFit}>
        {markingFit && <MarkFitDialog admission={data} onDone={() => { setMarkingFit(false); }} />}
      </Dialog>
    </section>
  );
}
