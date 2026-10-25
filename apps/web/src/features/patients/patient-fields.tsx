'use client';

import { GUARDIAN_RELATIONS, MAX_AGE_YEARS, SEXES, type RegisterPatient } from '@devmsr/validation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import { SelectField, TextField } from '@/components/form-fields';
import { todayIst } from '@/lib/format';

// Empty boxes mean "not given": undefined for the birth fields, null for an optional choice.
const optionalNumber = { setValueAs: (value: string | null | undefined) => (value === '' || value == null ? undefined : Number(value)) };
const optionalDate = { setValueAs: (value: string | null | undefined) => (value === '' || value == null ? undefined : value) };
const optionalChoice = { setValueAs: (value: string | null | undefined) => (value === '' || value == null ? null : value) };

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-md border border-border bg-surface p-4">
      <legend className="px-1 text-base font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

/**
 * The patient's details as a registration or edit form shows them: what is required first, then
 * the optional details. Large fields, keyboard order top to bottom (section 16).
 */
export function PatientFields({
  register,
  errors,
  identifierHints,
}: {
  register: UseFormRegister<RegisterPatient>;
  errors: FieldErrors<RegisterPatient>;
  /** On edit: what is on record for Aadhaar and ABHA, since they are never shown in full. */
  identifierHints?: { aadhaar: string; abha: string };
}) {
  const t = useTranslations('patients.form');
  const tp = useTranslations('patients');
  const tv = useTranslations('validation');
  const birthError = errors.ageYears ?? errors.dateOfBirth;

  return (
    <div className="space-y-6">
      <Group title={t('required')}>
        <TextField
          id="patient-name"
          label={t('fullName')}
          hint={t('fullNameHint')}
          autoComplete="off"
          autoFocus
          error={errors.fullName && tv('name')}
          {...register('fullName')}
        />
        <fieldset className="space-y-2" aria-describedby={errors.sex === undefined ? undefined : 'patient-sex-error'}>
          <legend className="text-sm font-medium">{t('sex')}</legend>
          <div className="flex flex-wrap gap-6">
            {SEXES.map((sex) => (
              <label key={sex} className="flex items-center gap-2 text-base">
                <input type="radio" value={sex} className="size-4 accent-primary" {...register('sex')} />
                {tp(`sex.${sex}`)}
              </label>
            ))}
          </div>
          {errors.sex !== undefined && (
            <p id="patient-sex-error" className="text-sm text-danger">
              {t('sexRequired')}
            </p>
          )}
        </fieldset>
        <div className="grid items-start gap-4 sm:grid-cols-[1fr_auto_1fr]">
          <TextField
            id="patient-age"
            label={t('ageYears')}
            inputMode="numeric"
            autoComplete="off"
            className="tabular-nums"
            hint={t('ageHint', { max: MAX_AGE_YEARS })}
            error={birthError && t('birthError')}
            {...register('ageYears', optionalNumber)}
          />
          <span className="pt-8 text-center text-sm text-text-muted">{t('or')}</span>
          <TextField id="patient-dob" type="date" max={todayIst()} label={t('dateOfBirth')} {...register('dateOfBirth', optionalDate)} />
        </div>
        <TextField
          id="patient-phone"
          type="tel"
          inputMode="numeric"
          autoComplete="off"
          className="tabular-nums"
          label={t('phone')}
          hint={t('phoneHint')}
          error={errors.phone && tv('mobile')}
          {...register('phone')}
        />
      </Group>

      <Group title={t('optional')}>
        <div className="grid gap-4 sm:grid-cols-[14rem_1fr]">
          <SelectField id="patient-relation" label={t('guardianRelation')} {...register('guardianRelation', optionalChoice)}>
            <option value="">{t('noGuardian')}</option>
            {GUARDIAN_RELATIONS.map((relation) => (
              <option key={relation} value={relation}>
                {tp(`relationLong.${relation}`)}
              </option>
            ))}
          </SelectField>
          <TextField
            id="patient-guardian"
            label={t('guardianName')}
            autoComplete="off"
            error={errors.guardianName && t('guardianError')}
            {...register('guardianName')}
          />
        </div>
        <TextField id="patient-address" label={t('addressLine')} autoComplete="off" error={errors.addressLine && tv('text')} {...register('addressLine')} />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField id="patient-city" label={t('city')} autoComplete="off" error={errors.city && tv('text')} {...register('city')} />
          <TextField id="patient-state" label={t('state')} autoComplete="off" error={errors.state && tv('text')} {...register('state')} />
          <TextField
            id="patient-pincode"
            label={t('pincode')}
            inputMode="numeric"
            autoComplete="off"
            className="tabular-nums"
            error={errors.pincode && tv('pincode')}
            {...register('pincode')}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="patient-emergency-name"
            label={t('emergencyContactName')}
            autoComplete="off"
            error={errors.emergencyContactName && tv('text')}
            {...register('emergencyContactName')}
          />
          <TextField
            id="patient-emergency-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            className="tabular-nums"
            label={t('emergencyContactPhone')}
            error={errors.emergencyContactPhone && tv('mobile')}
            {...register('emergencyContactPhone')}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="patient-aadhaar"
            inputMode="numeric"
            autoComplete="off"
            className="font-mono"
            label={t('aadhaar')}
            hint={identifierHints?.aadhaar ?? t('aadhaarHint')}
            error={errors.aadhaar && t('aadhaarError')}
            {...register('aadhaar')}
          />
          <TextField
            id="patient-abha"
            inputMode="numeric"
            autoComplete="off"
            className="font-mono"
            label={t('abhaNumber')}
            hint={identifierHints?.abha ?? t('abhaHint')}
            error={errors.abhaNumber && t('abhaError')}
            {...register('abhaNumber')}
          />
        </div>
      </Group>
    </div>
  );
}
