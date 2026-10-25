import type { Patient, RegisterPatient, UpdatePatient } from '@devmsr/validation';

/** Aadhaar and ABHA are never shown in full, so an empty box keeps them; removing is a separate choice. */
export interface IdentifierRemovals {
  aadhaar: boolean;
  abha: boolean;
}

/**
 * The PATCH body for an edit: only what differs from the record, or null when nothing does. An age
 * typed in replaces the date of birth; otherwise a changed date of birth is sent.
 */
export function patientChanges(patient: Patient, values: RegisterPatient, remove: IdentifierRemovals): UpdatePatient | null {
  const changes: UpdatePatient = {};
  if (values.fullName.replace(/\s+/g, ' ') !== patient.fullName) changes.fullName = values.fullName;
  if (values.sex !== patient.sex) changes.sex = values.sex;
  if (values.ageYears !== undefined) changes.ageYears = values.ageYears;
  else if (values.dateOfBirth !== undefined && values.dateOfBirth !== patient.dateOfBirth) changes.dateOfBirth = values.dateOfBirth;
  if (values.phone !== patient.phone) changes.phone = values.phone;

  const addressLine = values.addressLine ?? null;
  if (addressLine !== patient.addressLine) changes.addressLine = addressLine;
  const city = values.city ?? null;
  if (city !== patient.city) changes.city = city;
  const state = values.state ?? null;
  if (state !== patient.state) changes.state = state;
  const pincode = values.pincode ?? null;
  if (pincode !== patient.pincode) changes.pincode = pincode;
  const guardianRelation = values.guardianRelation ?? null;
  if (guardianRelation !== patient.guardianRelation) changes.guardianRelation = guardianRelation;
  const guardianName = values.guardianName ?? null;
  if (guardianName !== patient.guardianName) changes.guardianName = guardianName;
  const emergencyContactName = values.emergencyContactName ?? null;
  if (emergencyContactName !== patient.emergencyContactName) changes.emergencyContactName = emergencyContactName;
  const emergencyContactPhone = values.emergencyContactPhone ?? null;
  if (emergencyContactPhone !== patient.emergencyContactPhone) changes.emergencyContactPhone = emergencyContactPhone;

  if (remove.aadhaar) changes.aadhaar = null;
  else if (values.aadhaar != null) changes.aadhaar = values.aadhaar;
  if (remove.abha) changes.abhaNumber = null;
  else if (values.abhaNumber != null) changes.abhaNumber = values.abhaNumber;

  return Object.keys(changes).length === 0 ? null : changes;
}
