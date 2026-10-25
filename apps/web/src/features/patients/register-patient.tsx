'use client';

import { registerPatientSchema, type DuplicateCheckResponse, type RegisterPatient } from '@devmsr/validation';
import { UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ErrorAlert } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { zodResolver } from '@/lib/forms';
import { DuplicatePanel } from './duplicate-panel';
import { PatientFields } from './patient-fields';
import { useDuplicateCheck, useRegisterPatient } from './queries';

/**
 * Registration at the front desk. Before saving, the API is asked who already looks like this
 * patient; the panel lets staff open that record or, for a warning, register a new patient anyway.
 */
export function RegisterPatient() {
  const t = useTranslations('patients');
  const router = useRouter();
  // One key for this form: sending it again after a lost response returns the same patient.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [review, setReview] = useState<{ check: DuplicateCheckResponse; values: RegisterPatient } | null>(null);
  const duplicateCheck = useDuplicateCheck();
  const registration = useRegisterPatient(idempotencyKey);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterPatient>({
    resolver: zodResolver(registerPatientSchema),
    defaultValues: { fullName: '', phone: '', addressLine: '', city: '', state: '', pincode: '', guardianName: '', aadhaar: '', abhaNumber: '' },
  });

  const save = (values: RegisterPatient) => {
    registration.mutate(values, {
      onSuccess: (patient) => {
        router.push(`/patients/${patient.id}?registered=1`);
      },
    });
  };

  const error = registration.error ?? duplicateCheck.error;

  return (
    <form
      noValidate
      aria-labelledby="register-title"
      className="max-w-3xl space-y-6"
      onSubmit={(event) => {
        void handleSubmit((values) => {
          const { fullName, dateOfBirth, ageYears, phone, aadhaar, abhaNumber } = values;
          duplicateCheck.mutate(
            { fullName, dateOfBirth, ageYears, phone, aadhaar, abhaNumber },
            {
              onSuccess: (check) => {
                if (check.blocking.length > 0 || check.possible.length > 0) setReview({ check, values });
                else save(values);
              },
            },
          );
        })(event);
      }}
    >
      <div className="space-y-1">
        <h1 id="register-title" className="text-xl font-semibold">
          {t('registerTitle')}
        </h1>
        <p className="text-text-muted">{t('registerDescription')}</p>
      </div>

      <PatientFields register={register} errors={errors} />

      {review !== null && (
        <DuplicatePanel
          blocking={review.check.blocking}
          possible={review.check.possible}
          pending={registration.isPending}
          onBack={() => {
            setReview(null);
          }}
          onRegisterAnyway={() => {
            save({ ...review.values, acknowledgedDuplicateIds: review.check.possible.map((match) => match.id) });
          }}
        />
      )}

      {error !== null && <ErrorAlert error={error} />}

      <div className="flex justify-end">
        <Button type="submit" disabled={duplicateCheck.isPending || registration.isPending}>
          <UserPlus aria-hidden />
          {registration.isPending ? t('registering') : t('register')}
        </Button>
      </div>
    </form>
  );
}
