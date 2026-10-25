'use client';

import type { Discharge, DischargeSummaryDocument, DischargeSummaryInput } from '@devmsr/validation';
import { CircleCheck, CircleDashed, PenLine } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ErrorAlert, TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate, formatDateTime, todayIst } from '@/lib/format';
import { zodResolver } from '@/lib/forms';
import type { DischargePermissions } from './discharge-view';
import type { Step } from './steps';
import { useDischargeSummary, useSaveSummary, useSignSummary } from './queries';

const FIELDS = [
  { name: 'diagnosis', max: 2000, required: true },
  { name: 'courseInHospital', max: 4000, required: true },
  { name: 'conditionAtDischarge', max: 1000, required: true },
  { name: 'medications', max: 4000, required: false },
  { name: 'advice', max: 2000, required: false },
] as const;

const formSchema = z.object({
  diagnosis: z.string().trim().min(3).max(2000),
  courseInHospital: z.string().trim().min(3).max(4000),
  conditionAtDischarge: z.string().trim().min(3).max(1000),
  medications: z.string().max(4000),
  advice: z.string().max(2000),
  followUpDate: z.union([z.literal(''), z.iso.date()]),
});
type SummaryForm = z.infer<typeof formSchema>;

function toBody(values: SummaryForm): DischargeSummaryInput {
  const text = (value: string) => (value.trim() === '' ? null : value.trim());
  return {
    diagnosis: values.diagnosis.trim(),
    courseInHospital: values.courseInHospital.trim(),
    conditionAtDischarge: values.conditionAtDischarge.trim(),
    medications: text(values.medications),
    advice: text(values.advice),
    followUpDate: values.followUpDate === '' ? null : values.followUpDate,
  };
}

function TextArea({ id, label, error, ...props }: { id: string; label: string; error?: string | undefined } & ComponentProps<'textarea'>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        rows={3}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : `${id}-error`}
        className="w-full rounded-md border border-input-border bg-surface px-3 py-2 text-base text-text aria-invalid:border-danger"
        {...props}
      />
      {error !== undefined && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** The treating doctor's draft, rewritten as often as needed until the MD signs it off. */
function SummaryFormView({ discharge, content, primary }: { discharge: Discharge; content: DischargeSummaryDocument['content']; primary: boolean }) {
  const t = useTranslations('discharge.summary');
  const save = useSaveSummary(discharge.id);
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<SummaryForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      diagnosis: content?.diagnosis ?? '',
      courseInHospital: content?.courseInHospital ?? '',
      conditionAtDischarge: content?.conditionAtDischarge ?? '',
      medications: content?.medications ?? '',
      advice: content?.advice ?? '',
      followUpDate: content?.followUpDate ?? '',
    },
  });
  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={(event) => {
        void handleSubmit((values) => {
          save.mutate(toBody(values), { onSuccess: () => { reset(values); } });
        })(event);
      }}
    >
      {FIELDS.map((field) => (
        <TextArea
          key={field.name}
          id={`summary-${field.name}`}
          label={field.required ? t(field.name) : t('optional', { label: t(field.name) })}
          error={errors[field.name] === undefined ? undefined : t('textError', { max: field.max })}
          {...register(field.name)}
        />
      ))}
      <TextField id="summary-follow-up" type="date" min={todayIst()} label={t('followUpDate')} error={errors.followUpDate && t('dateError')} {...register('followUpDate')} />
      {save.error !== null && <ErrorAlert error={save.error} />}
      <Button type="submit" variant={primary && isDirty ? 'primary' : 'outline'} disabled={save.isPending || !isDirty}>
        <PenLine aria-hidden />
        {t('save')}
      </Button>
    </form>
  );
}

function SummaryText({ content }: { content: NonNullable<DischargeSummaryDocument['content']> }) {
  const t = useTranslations('discharge.summary');
  return (
    <dl className="space-y-2 text-sm">
      {FIELDS.filter((field) => content[field.name] !== null).map((field) => (
        <div key={field.name}>
          <dt className="text-text-muted">{t(field.name)}</dt>
          <dd className="whitespace-pre-line">{content[field.name]}</dd>
        </div>
      ))}
      {content.followUpDate !== null && (
        <div>
          <dt className="text-text-muted">{t('followUpDate')}</dt>
          <dd>{formatDate(content.followUpDate)}</dd>
        </div>
      )}
    </dl>
  );
}

/** The discharge summary: drafted by the treating doctor, signed off by the MD (docs/billing-rules.md). */
export function SummarySection({ discharge, can, step }: { discharge: Discharge; can: DischargePermissions; step: Step }) {
  const t = useTranslations('discharge.summary');
  const tv = useTranslations('discharge.view');
  const summary = discharge.summary;
  const open = discharge.completedAt === null;
  const editable = open && can.canWriteSummary && discharge.isTreatingDoctor && discharge.summaryStatus !== 'signed';
  const document = useDischargeSummary(discharge.id, can.canReadSummary && summary !== null);
  const sign = useSignSummary(discharge.id);
  const content = document.data?.content ?? null;

  return (
    <section className="space-y-3 rounded-md border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t('title')}</h2>
        {discharge.summaryStatus === 'signed' ? (
          <StatusBadge tone="success" icon={CircleCheck} label={tv('done')} />
        ) : (
          <StatusBadge tone="neutral" icon={CircleDashed} label={tv('waiting')} />
        )}
      </div>
      <p className="text-sm text-text-muted">
        {summary === null
          ? t('none')
          : summary.signedAt === null
            ? t('drafted', { name: summary.draftedByName ?? '', time: formatDateTime(summary.draftedAt) })
            : t('signed', { name: summary.signedByName ?? '', time: formatDateTime(summary.signedAt) })}
      </p>
      {document.error !== null && <ErrorAlert error={document.error} />}
      {editable && (summary === null || document.data !== undefined) && (
        <SummaryFormView key={document.data?.draftedAt ?? 'new'} discharge={discharge} content={content} primary={step === 'summary' || step === 'sign'} />
      )}
      {!editable && content !== null && <SummaryText content={content} />}
      {sign.error !== null && <ErrorAlert error={sign.error} />}
      {open && can.canSignSummary && discharge.summaryStatus === 'draft' && (
        <Button variant={step === 'sign' ? 'primary' : 'outline'} disabled={sign.isPending} onClick={() => { sign.mutate(); }}>
          <CircleCheck aria-hidden />
          {t('sign')}
        </Button>
      )}
    </section>
  );
}
