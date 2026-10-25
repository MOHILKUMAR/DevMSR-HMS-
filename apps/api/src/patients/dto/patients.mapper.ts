import type { DuplicateMatch, DuplicateReason, Patient, PatientSummary } from '@devmsr/validation';
import { toDateOnly } from '../../common/dates.js';
import type { PatientRow, PatientSummaryRow } from '../patients.repository.js';

export function toPatientSummary(row: PatientSummaryRow): PatientSummary {
  return {
    id: row.id,
    uhid: row.uhid,
    fullName: row.fullName,
    sex: row.sex,
    dateOfBirth: row.dateOfBirth === null ? null : toDateOnly(row.dateOfBirth),
    dateOfBirthEstimated: row.dateOfBirthEstimated,
    phone: row.phone,
  };
}

export function toDuplicateMatch(row: PatientSummaryRow, reasons: DuplicateReason[]): DuplicateMatch {
  return { ...toPatientSummary(row), reasons };
}

/** The full record. Only the last 4 digits of Aadhaar and ABHA leave the database. */
export function toPatient(row: PatientRow, registeredByName: string | null): Patient {
  return {
    ...toPatientSummary(row),
    addressLine: row.addressLine,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    guardianRelation: row.guardianRelation,
    guardianName: row.guardianName,
    emergencyContactName: row.emergencyContactName,
    emergencyContactPhone: row.emergencyContactPhone,
    aadhaarLast4: row.aadhaarLast4,
    abhaNumberLast4: row.abhaNumberLast4,
    registeredAt: row.createdAt.toISOString(),
    registeredByName,
    updatedAt: row.updatedAt.toISOString(),
  };
}
