import type { Admission, AdmissionSummary } from '@devmsr/validation';
import { paise } from '../../billing/dto/billing.mapper.js';
import { toDateOnly } from '../../common/dates.js';
import type { AdmissionRow, BedPlaceRow, DailyRow } from '../ipd.repository.js';

function bedPlace(bed: BedPlaceRow) {
  return { id: bed.id, code: bed.code, wardName: bed.ward.name, roomCategoryName: bed.ward.roomCategory?.name ?? null };
}

export function toAdmissionSummary(row: AdmissionRow): AdmissionSummary {
  const current = row.assignments.find((assignment) => assignment.endedAt === null);
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    patient: {
      id: row.patient.id,
      uhid: row.patient.uhid,
      fullName: row.patient.fullName,
      sex: row.patient.sex,
      dateOfBirth: row.patient.dateOfBirth === null ? null : toDateOnly(row.patient.dateOfBirth),
    },
    doctor: row.doctor,
    bed: current === undefined ? null : bedPlace(current.bed),
    admittedAt: row.admittedAt.toISOString(),
    dischargedAt: row.dischargedAt?.toISOString() ?? null,
    minimumAdvancePaise: paise(row.minimumAdvancePaise),
    depositHeldPaise: paise(row.depositHeldPaise),
    advanceShort: row.depositHeldPaise < row.minimumAdvancePaise,
  };
}

export function toAdmission(row: AdmissionRow, daily: readonly DailyRow[], names: Map<string, string>): Admission {
  return {
    ...toAdmissionSummary(row),
    payerType: row.payerType,
    reason: row.reason,
    opdVisitId: row.opdVisitId,
    admittedByName: names.get(row.admittedById) ?? null,
    beds: row.assignments.map((assignment) => ({
      ...bedPlace(assignment.bed),
      startedAt: assignment.startedAt.toISOString(),
      endedAt: assignment.endedAt?.toISOString() ?? null,
      endReason: assignment.endReason,
    })),
    dailyCharges: daily.map((day) => ({
      chargeDate: toDateOnly(day.chargeDate),
      kind: day.kind,
      description: day.charge.description,
      amountPaise: paise(day.charge.amountPaise),
      bedCode: day.bed.code,
    })),
  };
}
