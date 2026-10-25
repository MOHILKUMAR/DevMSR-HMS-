import { z } from 'zod';
import { atLeastOneField, isoDateSchema, listResponseSchema, nameSchema, optionalTextSchema } from './common.js';
import { normalizeAadhaar, normalizeAbhaNumber, normalizeIndianMobile } from './identity.js';
import { paginationQuerySchema } from './pagination.js';

/** Sexes staff choose at registration. `unknown` is kept for unidentified emergency patients. */
export const SEXES = ['male', 'female', 'other'] as const;
export const GUARDIAN_RELATIONS = ['son_of', 'daughter_of', 'wife_of', 'husband_of', 'care_of'] as const;
export type GuardianRelation = (typeof GUARDIAN_RELATIONS)[number];

/** Oldest age accepted at registration. */
export const MAX_AGE_YEARS = 130;

function istToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

/** Turns an identifier as typed into its stored form, or refuses it with `message`. */
function identifier(normalize: (text: string) => string | null, message: string) {
  return z
    .string()
    .trim()
    .refine((text) => normalize(text) !== null, message)
    .transform((text) => normalize(text) ?? text);
}

/**
 * The same, optional: empty clears the value (null), missing leaves it unchanged (undefined), so a
 * PATCH that leaves a field out never wipes it.
 */
function optionalIdentifier(normalize: (text: string) => string | null, message: string) {
  return z
    .string()
    .trim()
    .nullable()
    .refine((text) => text === null || text === '' || normalize(text) !== null, message)
    .transform((text) => (text === null || text === '' ? null : normalize(text)))
    .optional();
}

export const indianMobileSchema = identifier(normalizeIndianMobile, 'Use a 10-digit Indian mobile number');
const optionalMobileSchema = optionalIdentifier(normalizeIndianMobile, 'Use a 10-digit Indian mobile number');
const optionalAadhaarSchema = optionalIdentifier(normalizeAadhaar, 'Check the 12-digit Aadhaar number');
const optionalAbhaSchema = optionalIdentifier(normalizeAbhaNumber, 'Use the 14-digit ABHA number');

/** A date of birth: not in the future, and not more than MAX_AGE_YEARS ago. */
const dateOfBirthSchema = isoDateSchema.refine((date) => {
  const today = istToday();
  const earliest = `${String(Number(today.slice(0, 4)) - MAX_AGE_YEARS)}${today.slice(4)}`;
  return date <= today && date >= earliest;
}, 'Use a date of birth that is not in the future');

const ageYearsSchema = z.number().int().min(0).max(MAX_AGE_YEARS);

const pincodeSchema = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional()
  .refine((value) => value == null || /^[1-9][0-9]{5}$/.test(value), 'Use a 6-digit PIN code');

/** Fields of a registration: what is required and what is optional is in docs/billing-rules.md. */
const patientFields = {
  fullName: nameSchema,
  sex: z.enum(SEXES),
  /** Either a date of birth or an age in years. */
  dateOfBirth: dateOfBirthSchema.optional(),
  ageYears: ageYearsSchema.optional(),
  phone: indianMobileSchema,
  addressLine: optionalTextSchema(200),
  city: optionalTextSchema(80),
  state: optionalTextSchema(80),
  pincode: pincodeSchema,
  guardianRelation: z.enum(GUARDIAN_RELATIONS).nullable().optional(),
  guardianName: optionalTextSchema(120),
  emergencyContactName: optionalTextSchema(120),
  emergencyContactPhone: optionalMobileSchema,
  aadhaar: optionalAadhaarSchema,
  abhaNumber: optionalAbhaSchema,
};

type BirthAndGuardian = {
  dateOfBirth?: string | undefined;
  ageYears?: number | undefined;
  guardianRelation?: GuardianRelation | null | undefined;
  guardianName?: string | null | undefined;
};

/**
 * Runs object-level rules even when another field is wrong, so a form shows every problem at once,
 * but only when the input is an object at all: a missing body must stay a plain validation error.
 */
const whenObject = (payload: { value: unknown }) => typeof payload.value === 'object' && payload.value !== null;

const notBothBirthFields = (value: BirthAndGuardian) => value.dateOfBirth === undefined || value.ageYears === undefined;
const guardianTogether = (value: BirthAndGuardian) => (value.guardianRelation == null) === (value.guardianName == null);

export const registerPatientSchema = z
  .object({
    ...patientFields,
    /** Possible duplicates staff have seen and decided to register past. Never Aadhaar or ABHA matches. */
    acknowledgedDuplicateIds: z.array(z.uuid()).max(20).optional(),
  })
  .refine((value) => value.dateOfBirth !== undefined || value.ageYears !== undefined, {
    message: 'Enter the age or the date of birth',
    path: ['ageYears'],
    when: whenObject,
  })
  .refine(notBothBirthFields, { message: 'Enter the age or the date of birth, not both', path: ['ageYears'], when: whenObject })
  .refine(guardianTogether, { message: 'Enter both the relation and the guardian name', path: ['guardianName'], when: whenObject });

export type RegisterPatient = z.infer<typeof registerPatientSchema>;

export const updatePatientSchema = z
  .object({
    fullName: patientFields.fullName.optional(),
    sex: patientFields.sex.optional(),
    dateOfBirth: patientFields.dateOfBirth,
    ageYears: patientFields.ageYears,
    phone: patientFields.phone.optional(),
    addressLine: patientFields.addressLine,
    city: patientFields.city,
    state: patientFields.state,
    pincode: patientFields.pincode,
    guardianRelation: patientFields.guardianRelation,
    guardianName: patientFields.guardianName,
    emergencyContactName: patientFields.emergencyContactName,
    emergencyContactPhone: patientFields.emergencyContactPhone,
    aadhaar: patientFields.aadhaar,
    abhaNumber: patientFields.abhaNumber,
  })
  .refine(atLeastOneField, 'Change at least one field')
  .refine(notBothBirthFields, { message: 'Enter the age or the date of birth, not both', path: ['ageYears'] });

export type UpdatePatient = z.infer<typeof updatePatientSchema>;

/** What a search result or a duplicate match shows. */
export const patientSummarySchema = z.object({
  id: z.uuid(),
  uhid: z.string(),
  fullName: z.string(),
  sex: z.enum([...SEXES, 'unknown']),
  dateOfBirth: isoDateSchema.nullable(),
  dateOfBirthEstimated: z.boolean(),
  phone: z.string().nullable(),
});

export type PatientSummary = z.infer<typeof patientSummarySchema>;

/** A patient record. Aadhaar and ABHA numbers are never returned: only their last 4 digits. */
export const patientSchema = patientSummarySchema.extend({
  addressLine: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  pincode: z.string().nullable(),
  guardianRelation: z.enum(GUARDIAN_RELATIONS).nullable(),
  guardianName: z.string().nullable(),
  emergencyContactName: z.string().nullable(),
  emergencyContactPhone: z.string().nullable(),
  aadhaarLast4: z.string().nullable(),
  abhaNumberLast4: z.string().nullable(),
  registeredAt: z.iso.datetime(),
  registeredByName: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});

export type Patient = z.infer<typeof patientSchema>;

/**
 * Search by UHID (or just its number), mobile, name, Aadhaar or ABHA number. Sent as a POST body:
 * names and phone numbers never go in a URL.
 */
export const patientSearchSchema = paginationQuerySchema.extend({ q: z.string().trim().min(1).max(60) });
export type PatientSearch = z.infer<typeof patientSearchSchema>;
export const patientSearchResponseSchema = listResponseSchema(patientSummarySchema);

export const DUPLICATE_REASONS = ['aadhaar', 'abha', 'phone', 'name_and_birth_year'] as const;
export type DuplicateReason = (typeof DUPLICATE_REASONS)[number];

export const duplicateCheckSchema = z
  .object({
    fullName: nameSchema,
    dateOfBirth: patientFields.dateOfBirth,
    ageYears: patientFields.ageYears,
    phone: indianMobileSchema.optional(),
    aadhaar: optionalAadhaarSchema,
    abhaNumber: optionalAbhaSchema,
  })
  .refine(notBothBirthFields, { message: 'Enter the age or the date of birth, not both', path: ['ageYears'] });

export type DuplicateCheck = z.infer<typeof duplicateCheckSchema>;

export const duplicateMatchSchema = patientSummarySchema.extend({ reasons: z.array(z.enum(DUPLICATE_REASONS)) });
export type DuplicateMatch = z.infer<typeof duplicateMatchSchema>;

/** `blocking`: the same Aadhaar or ABHA, refused. `possible`: same mobile or name and birth year, a warning. */
export const duplicateCheckResponseSchema = z.object({
  blocking: z.array(duplicateMatchSchema),
  possible: z.array(duplicateMatchSchema),
});

export type DuplicateCheckResponse = z.infer<typeof duplicateCheckResponseSchema>;
