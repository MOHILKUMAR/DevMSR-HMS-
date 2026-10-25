'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { startBreakGlassSchema, type StartBreakGlass } from '@devmsr/validation';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { ErrorAlert, SelectField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { api, csrfHeader } from '@/lib/api/client';
import { unwrap } from '@/lib/api/errors';
import { zodResolver } from '@/lib/forms';

/** For a DevMSR super admin: choose a hospital, write the reason, open read-only access for 1 hour. */
export function BreakGlassStartForm() {
  const t = useTranslations('breakGlass');
  const router = useRouter();
  const hospitals = useQuery({
    queryKey: ['break-glass', 'hospitals'],
    queryFn: async () => unwrap(await api.GET('/api/v1/break-glass/hospitals')),
  });
  const start = useMutation({
    mutationFn: async (body: StartBreakGlass) => unwrap(await api.POST('/api/v1/break-glass', { params: { header: csrfHeader() }, body })),
    // The session now reaches the hospital: the server renders the shell again with its sections.
    onSuccess: () => {
      router.replace('/');
      router.refresh();
    },
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StartBreakGlass>({ resolver: zodResolver(startBreakGlassSchema), defaultValues: { hospitalId: '', reason: '' } });

  return (
    <form
      noValidate
      className="max-w-xl space-y-4 rounded-md border border-border bg-surface p-4"
      onSubmit={(event) => {
        void handleSubmit((values) => {
          start.mutate(values);
        })(event);
      }}
    >
      <SelectField id="break-glass-hospital" label={t('hospital')} error={errors.hospitalId && t('hospitalRequired')} {...register('hospitalId')}>
        <option value="">{t('chooseHospital')}</option>
        {hospitals.data?.data.map((hospital) => (
          <option key={hospital.id} value={hospital.id}>
            {hospital.name} ({hospital.code})
          </option>
        ))}
      </SelectField>
      <div className="space-y-1.5">
        <Label htmlFor="break-glass-reason">{t('reason')}</Label>
        <textarea
          id="break-glass-reason"
          rows={4}
          maxLength={500}
          aria-invalid={errors.reason === undefined ? undefined : true}
          aria-describedby="break-glass-reason-help"
          className="w-full rounded-md border border-input-border bg-surface px-3 py-2 text-base text-text aria-invalid:border-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          {...register('reason')}
        />
        <p id="break-glass-reason-help" className={errors.reason === undefined ? 'text-sm text-text-muted' : 'text-sm text-danger'}>
          {errors.reason === undefined ? t('reasonHint') : t('reasonInvalid')}
        </p>
      </div>
      {(hospitals.error ?? start.error) !== null && <ErrorAlert error={hospitals.error ?? start.error} />}
      <Button type="submit" disabled={start.isPending}>
        {start.isPending ? t('starting') : t('start')}
      </Button>
    </form>
  );
}

/** Ends break-glass access early. Used by the banner every signed-in screen shows while it is open. */
export function EndBreakGlassButton() {
  const t = useTranslations('breakGlass');
  const router = useRouter();
  const end = useMutation({
    mutationFn: async () => {
      unwrap(await api.POST('/api/v1/break-glass/current/end', { params: { header: csrfHeader() } }));
    },
    onSettled: () => {
      router.replace('/break-glass');
      router.refresh();
    },
  });
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={end.isPending}
      onClick={() => {
        end.mutate();
      }}
    >
      {end.isPending ? t('ending') : t('end')}
    </Button>
  );
}
