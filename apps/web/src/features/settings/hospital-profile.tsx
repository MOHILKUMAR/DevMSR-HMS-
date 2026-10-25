'use client';

import { updateHospitalProfileSchema, type HospitalProfile, type UpdateHospitalProfile } from '@devmsr/validation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ErrorAlert, TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { api, csrfHeader } from '@/lib/api/client';
import { unwrap } from '@/lib/api/errors';
import { zodResolver } from '@/lib/forms';
import { changedFields } from './changes';
import { ReadOnlyNote, SectionHeader } from './parts';
import { settingsKeys, useHospitalProfile, useSave } from './queries';

export function HospitalProfileSection({ canManage }: { canManage: boolean }) {
  const t = useTranslations('settings.hospital');
  const tc = useTranslations('common');
  const profile = useHospitalProfile();
  const [saved, setSaved] = useState(false);

  return (
    <section className="max-w-2xl space-y-4">
      <SectionHeader title={t('title')} description={t('description')} />
      {!canManage && <ReadOnlyNote />}
      {profile.isPending && <p className="text-text-muted">{tc('loading')}</p>}
      {profile.error !== null && <ErrorAlert error={profile.error} />}
      {/* Keyed on the saved record, so the form starts again from what the API returned. */}
      {profile.data !== undefined && <ProfileForm key={JSON.stringify(profile.data)} profile={profile.data} canManage={canManage} saved={saved} onSaved={setSaved} />}
    </section>
  );
}

function ProfileForm({
  profile,
  canManage,
  saved,
  onSaved: setSaved,
}: {
  profile: HospitalProfile;
  canManage: boolean;
  saved: boolean;
  onSaved: (saved: boolean) => void;
}) {
  const t = useTranslations('settings.hospital');
  const tc = useTranslations('common');
  const tv = useTranslations('validation');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdateHospitalProfile>({
    resolver: zodResolver(updateHospitalProfileSchema),
    defaultValues: {
      name: profile.name,
      addressLine: profile.addressLine ?? '',
      city: profile.city ?? '',
      state: profile.state ?? '',
      pincode: profile.pincode ?? '',
      phone: profile.phone ?? '',
      email: profile.email ?? '',
    },
  });
  const save = useSave(
    async (body: UpdateHospitalProfile) => unwrap(await api.PATCH('/api/v1/hospital-profile', { params: { header: csrfHeader() }, body })),
    {
      invalidate: [settingsKeys.hospital],
      onSaved: () => {
        setSaved(true);
      },
    },
  );
  // Empty optional fields are cleared (null), as the API stores them.
  const blankAsNull = { setValueAs: (value: string | null) => (value === '' ? null : value) };
  const readOnly = !canManage;

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        setSaved(false);
        void handleSubmit((values) => {
          const changes = changedFields(profile, values);
          if (changes === null) setSaved(true);
          else save.mutate(changes);
        })(event);
      }}
    >
      <p className="text-sm text-text-muted">
        {t('code')}: <span className="font-mono">{profile.code}</span>. {t('codeHint')}
      </p>
      <TextField id="hospital-name" label={t('name')} readOnly={readOnly} error={errors.name && tv('name')} {...register('name')} />
      <TextField
        id="hospital-address"
        label={t('addressLine')}
        readOnly={readOnly}
        autoComplete="street-address"
        error={errors.addressLine && tv('text')}
        {...register('addressLine')}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField id="hospital-city" label={t('city')} readOnly={readOnly} error={errors.city && tv('text')} {...register('city')} />
        <TextField id="hospital-state" label={t('state')} readOnly={readOnly} error={errors.state && tv('text')} {...register('state')} />
        <TextField
          id="hospital-pincode"
          label={t('pincode')}
          readOnly={readOnly}
          inputMode="numeric"
          autoComplete="postal-code"
          className="tabular-nums"
          error={errors.pincode && tv('pincode')}
          {...register('pincode', blankAsNull)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="hospital-phone"
          type="tel"
          label={t('phone')}
          readOnly={readOnly}
          className="tabular-nums"
          error={errors.phone && tv('phone')}
          {...register('phone', blankAsNull)}
        />
        <TextField
          id="hospital-email"
          type="email"
          label={t('email')}
          readOnly={readOnly}
          error={errors.email && tv('email')}
          {...register('email', blankAsNull)}
        />
      </div>
      {save.error !== null && <ErrorAlert error={save.error} />}
      {canManage && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? tc('saving') : t('save')}
          </Button>
          <p role="status" className="text-sm text-success">
            {saved ? t('saved') : ''}
          </p>
        </div>
      )}
    </form>
  );
}
