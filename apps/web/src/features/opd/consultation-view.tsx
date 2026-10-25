'use client';

import { MAX_ORDER_QUANTITY, type Consultation, type ConsultationNotes } from '@devmsr/validation';
import { CircleCheck, Plus, Stethoscope } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, type ComponentProps } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { CheckboxField, ErrorAlert, SelectField, TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableHead, TableMessage, Td, Th } from '@/components/ui/table';
import { useServiceItemOptions } from '@/features/billing/queries';
import { AgeSex } from '@/features/patients/age-sex';
import { formatDateTime, formatPaise, todayIst } from '@/lib/format';
import { zodResolver } from '@/lib/forms';
import { useCallIn, useCompleteVisit, useConsultation, usePlaceOrder, useSaveNotes } from './queries';
import { VisitStatus } from './visit-status';

const NOTE_FIELDS = ['complaints', 'findings', 'diagnosis', 'advice'] as const;

function NoteArea({ id, label, ...props }: { id: string; label: string } & ComponentProps<'textarea'>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        rows={3}
        className="w-full rounded-md border border-input-border bg-surface px-3 py-2 text-base text-text disabled:bg-neutral-soft"
        {...props}
      />
    </div>
  );
}

interface NotesForm {
  complaints: string;
  findings: string;
  diagnosis: string;
  advice: string;
  followUpDate: string;
  admissionAdvised: boolean;
}

const notesFormSchema = z.object({
  complaints: z.string().max(2_000),
  findings: z.string().max(2_000),
  diagnosis: z.string().max(2_000),
  advice: z.string().max(2_000),
  followUpDate: z.union([z.literal(''), z.iso.date()]),
  admissionAdvised: z.boolean(),
});

function toBody(values: NotesForm): ConsultationNotes {
  const text = (value: string) => (value.trim() === '' ? null : value.trim());
  return {
    complaints: text(values.complaints),
    findings: text(values.findings),
    diagnosis: text(values.diagnosis),
    advice: text(values.advice),
    followUpDate: values.followUpDate === '' ? null : values.followUpDate,
    admissionAdvised: values.admissionAdvised,
  };
}

/** The doctor's notes. Saved as often as needed while the patient is in; read only once the visit is done. */
function NotesSection({ consultation, editable }: { consultation: Consultation; editable: boolean }) {
  const t = useTranslations('opd.consultation');
  const save = useSaveNotes(consultation.visit.id);
  const notes = consultation.notes;
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<NotesForm>({
    resolver: zodResolver(notesFormSchema),
    defaultValues: {
      complaints: notes.complaints ?? '',
      findings: notes.findings ?? '',
      diagnosis: notes.diagnosis ?? '',
      advice: notes.advice ?? '',
      followUpDate: notes.followUpDate ?? '',
      admissionAdvised: notes.admissionAdvised,
    },
  });

  return (
    <form
      noValidate
      aria-labelledby="notes-title"
      className="space-y-3 rounded-md border border-border bg-surface p-4"
      onSubmit={(event) => {
        void handleSubmit((values) => {
          save.mutate(toBody(values), { onSuccess: () => { reset(values); } });
        })(event);
      }}
    >
      <h2 id="notes-title" className="text-base font-semibold">
        {t('notes')}
      </h2>
      {NOTE_FIELDS.map((field) => (
        <NoteArea key={field} id={`note-${field}`} label={t(field)} disabled={!editable} {...register(field)} />
      ))}
      <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
        <TextField id="note-follow-up" type="date" min={todayIst()} label={t('followUpDate')} disabled={!editable} error={errors.followUpDate && t('dateError')} {...register('followUpDate')} />
        <CheckboxField id="note-admission" label={t('admissionAdvised')} disabled={!editable} {...register('admissionAdvised')} />
      </div>
      {save.error !== null && <ErrorAlert error={save.error} />}
      {editable && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="outline" disabled={save.isPending || !isDirty}>
            {t('saveNotes')}
          </Button>
          {consultation.notesUpdatedAt !== null && !isDirty && (
            <span className="text-sm text-text-muted">{t('savedAt', { time: formatDateTime(consultation.notesUpdatedAt) })}</span>
          )}
        </div>
      )}
    </form>
  );
}

/** Tests and procedures ordered in the visit. Each posts its charge for billing straight away. */
function OrdersSection({ consultation, editable }: { consultation: Consultation; editable: boolean }) {
  const t = useTranslations('opd.consultation');
  const items = useServiceItemOptions();
  const order = usePlaceOrder(consultation.visit.id);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const orderable = (items.data ?? []).filter((item) => item.isActive && !['consultation', 'room', 'nursing'].includes(item.kind));
  const count = Number(quantity);
  const validCount = /^\d{1,2}$/.test(quantity) && count >= 1 && count <= MAX_ORDER_QUANTITY;

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface p-4">
      <h2 className="text-base font-semibold">{t('orders')}</h2>
      <Table>
        <TableHead>
          <tr>
            <Th>{t('service')}</Th>
            <Th numeric>{t('quantity')}</Th>
            <Th numeric>{t('amount')}</Th>
          </tr>
        </TableHead>
        <TableBody>
          {consultation.orders.length === 0 && <TableMessage colSpan={3}>{t('noOrders')}</TableMessage>}
          {consultation.orders.map((line) => (
            <tr key={line.chargeId}>
              <Td>{line.description}</Td>
              <Td numeric>{line.quantity}</Td>
              <Td numeric>{formatPaise(line.amountPaise)}</Td>
            </tr>
          ))}
        </TableBody>
      </Table>
      {editable && (
        <div className="grid gap-3 sm:grid-cols-[1fr_6rem_auto] sm:items-end">
          <SelectField id="order-item" label={t('service')} value={itemId} onChange={(event) => { setItemId(event.target.value); }}>
            <option value="">{items.isPending ? t('loadingServices') : t('chooseService')}</option>
            {orderable.map((item) => (
              <option key={item.id} value={item.id} disabled={item.currentRate === null}>
                {item.name} ({item.currentRate === null ? t('noRate') : formatPaise(item.currentRate.ratePaise)})
              </option>
            ))}
          </SelectField>
          <TextField
            id="order-quantity"
            label={t('quantity')}
            inputMode="numeric"
            value={quantity}
            error={validCount ? undefined : t('quantityError', { max: MAX_ORDER_QUANTITY })}
            onChange={(event) => { setQuantity(event.target.value); }}
          />
          <Button
            variant="outline"
            disabled={itemId === '' || !validCount || order.isPending}
            onClick={() => {
              order.mutate(
                { body: { serviceItemId: itemId, quantity: count }, key },
                {
                  onSuccess: () => {
                    setKey(crypto.randomUUID());
                    setItemId('');
                    setQuantity('1');
                  },
                },
              );
            }}
          >
            <Plus aria-hidden />
            {t('order')}
          </Button>
        </div>
      )}
      {order.error !== null && <ErrorAlert error={order.error} />}
    </div>
  );
}

/** One OPD visit for its doctor: call the patient in, write notes, order tests, complete. */
export function ConsultationView({ id }: { id: string }) {
  const t = useTranslations('opd.consultation');
  const tc = useTranslations('common');
  const consultation = useConsultation(id);
  const callIn = useCallIn(id);
  const complete = useCompleteVisit(id);
  const [confirming, setConfirming] = useState(false);

  if (consultation.error !== null) return <ErrorAlert error={consultation.error} />;
  if (consultation.data === undefined) return <p className="text-text-muted">{t('loading')}</p>;
  const data = consultation.data;
  const visit = data.visit;
  const editable = visit.status === 'with_doctor';

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold">{t('title', { token: visit.tokenNumber, name: visit.patient.fullName })}</h1>
            <VisitStatus status={visit.status} />
          </div>
          <p className="text-text-muted">
            <span className="font-mono">{visit.patient.uhid}</span>, <AgeSex patient={visit.patient} />
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="ghost">
            <Link href="/opd">{t('backToQueue')}</Link>
          </Button>
          {visit.status === 'waiting' && (
            <Button disabled={callIn.isPending} onClick={() => { callIn.mutate(); }}>
              <Stethoscope aria-hidden />
              {t('callIn')}
            </Button>
          )}
          {editable && (
            <Button onClick={() => { setConfirming(true); }}>
              <CircleCheck aria-hidden />
              {t('complete')}
            </Button>
          )}
        </div>
      </div>
      {callIn.error !== null && <ErrorAlert error={callIn.error} />}
      {visit.status === 'waiting' && <p className="text-sm text-text-muted">{t('callInFirst')}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <NotesSection key={`${data.visit.status}-${data.notesUpdatedAt ?? ''}`} consultation={data} editable={editable} />
        <OrdersSection consultation={data} editable={editable} />
      </div>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        {confirming && (
          <DialogContent title={t('completeTitle')} description={t('completeBody')} closeLabel={tc('close')}>
            <div className="space-y-3">
              {complete.error !== null && <ErrorAlert error={complete.error} />}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setConfirming(false); }}>
                  {tc('cancel')}
                </Button>
                <Button disabled={complete.isPending} onClick={() => { complete.mutate(undefined, { onSuccess: () => { setConfirming(false); } }); }}>
                  {t('complete')}
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}
