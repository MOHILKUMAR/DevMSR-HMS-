'use client';

import type { PatientSummary } from '@devmsr/validation';
import { useTranslations } from 'next-intl';
import { todayIst } from '@/lib/format';
import { ageParts } from './format';

/** "34 y, F": age and sex the way a registration slip shows them. */
export function AgeSex({ patient }: { patient: Pick<PatientSummary, 'dateOfBirth' | 'sex'> }) {
  const t = useTranslations('patients');
  const sex = t(`sexShort.${patient.sex}`);
  if (patient.dateOfBirth === null) return <span>{sex}</span>;
  const { count, unit } = ageParts(patient.dateOfBirth, todayIst());
  return (
    <span className="tabular-nums">
      {t(`age.${unit}`, { count })}, {sex}
    </span>
  );
}
