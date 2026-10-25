'use client';

import { registerPatientSchema, type Patient, type RegisterPatient } from '@devmsr/validation';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { CheckboxField, ErrorAlert } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { zodResolver } from '@/lib/forms';
import { patientChanges } from './changes';
import { mobileInput } from './format';
import { PatientFields } from './patient-fields';
import { useUpdatePatient } from './queries';

/** Edits a patient's details. The UHID never changes; only fields that differ are sent. */
export function EditPatient({ patient }: { patient: Patient }) {
  const t = useTranslations('patients');
  const tc = useTranslations('common');
  const router = useRouter();
  const update = useUpdatePatient(patient.id);
  const [removeAadhaar, setRemoveAadhaar] = useState(false);
  const [removeAbha, setRemoveAbha] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterPatient>({
    resolver: zodResolver(registerPatientSchema),
    defaultValues: {
      fullName: patient.fullName,
      ...(patient.sex === 'unknown' ? {} : { sex: patient.sex }),
      ...(patient.dateOfBirth === null ? {} : { dateOfBirth: patient.dateOfBirth }),
      phone: mobileInput(patient.phone),
      addressLine: patient.addressLine ?? '',
      city: patient.city ?? '',
      state: patient.state ?? '',
      pincode: patient.pincode ?? '',
      guardianRelation: patient.guardianRelation,
      guardianName: patient.guardianName ?? '',
      emergencyContactName: patient.emergencyContactName ?? '',
      emergencyContactPhone: mobileInput(patient.emergencyContactPhone),
      aadhaar: '',
      abhaNumber: '',
    },
  });
  const done = () => {
    router.push(`/patients/${patient.id}`);
    router.refresh();
  };
  const onRecord = (last4: string | null, fallback: string) => (last4 === null ? fallback : t('form.onRecord', { last4 }));

  return (
    <form
      noValidate
      aria-labelledby="edit-title"
      className="max-w-3xl space-y-6"
      onSubmit={(event) => {
        void handleSubmit((values) => {
          const changes = patientChanges(patient, values, { aadhaar: removeAadhaar, abha: removeAbha });
          if (changes === null) done();
          else update.mutate(changes, { onSuccess: done });
        })(event);
      }}
    >
      <div className="space-y-1">
        <h1 id="edit-title" className="text-xl font-semibold">
          {t('editTitle', { name: patient.fullName })}
        </h1>
        <p className="text-text-muted">
          {t('record.uhid')}: <span className="font-mono">{patient.uhid}</span>. {t('editDescription')}
        </p>
      </div>

      <PatientFields
        register={register}
        errors={errors}
        identifierHints={{
          aadhaar: onRecord(patient.aadhaarLast4, t('form.aadhaarHint')),
          abha: onRecord(patient.abhaNumberLast4, t('form.abhaHint')),
        }}
      />
      {(patient.aadhaarLast4 !== null || patient.abhaNumberLast4 !== null) && (
        <div className="flex flex-wrap gap-6">
          {patient.aadhaarLast4 !== null && (
            <CheckboxField
              id="remove-aadhaar"
              label={t('form.removeAadhaar')}
              checked={removeAadhaar}
              onChange={(event) => {
                setRemoveAadhaar(event.target.checked);
              }}
            />
          )}
          {patient.abhaNumberLast4 !== null && (
            <CheckboxField
              id="remove-abha"
              label={t('form.removeAbha')}
              checked={removeAbha}
              onChange={(event) => {
                setRemoveAbha(event.target.checked);
              }}
            />
          )}
        </div>
      )}

      {update.error !== null && <ErrorAlert error={update.error} />}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={done}>
          {tc('cancel')}
        </Button>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? tc('saving') : t('saveChanges')}
        </Button>
      </div>
    </form>
  );
}
