import { z } from 'zod';
import { billedPatientSchema, issuerSchema } from './billing.js';
import { isoDateSchema, listResponseSchema, paiseSchema, uuidSchema } from './common.js';
import { BED_STATUSES } from './masters.js';
import { paginationQuerySchema } from './pagination.js';
import { SEXES } from './patients.js';

// IPD: admissions, beds, transfers and the room and nursing charges posted each midnight
// (docs/billing-rules.md, CLAUDE.md section 12).

export const ADMISSION_STATUSES = ['admitted', 'discharged'] as const;
export type AdmissionStatus = (typeof ADMISSION_STATUSES)[number];
export const PAYER_TYPES = ['self_pay'] as const;

/** Bed states staff set by hand. Occupied comes only from an admission or transfer. */
export const SETTABLE_BED_STATUSES = ['free', 'cleaning', 'reserved', 'blocked'] as const;

export const admitSchema = z.object({
  patientId: uuidSchema,
  doctorId: uuidSchema,
  bedId: uuidSchema,
  reason: z.string().trim().min(3).max(500).optional(),
  /** The OPD visit in which the doctor advised admission, if any. */
  opdVisitId: uuidSchema.optional(),
});
export type Admit = z.infer<typeof admitSchema>;

export const transferSchema = z.object({ bedId: uuidSchema });
export type Transfer = z.infer<typeof transferSchema>;

export const setBedStatusSchema = z.object({ status: z.enum(SETTABLE_BED_STATUSES) });
export type SetBedStatus = z.infer<typeof setBedStatusSchema>;

export const minimumAdvanceSchema = z.object({ minimumAdvancePaise: paiseSchema });
export type MinimumAdvance = z.infer<typeof minimumAdvanceSchema>;

export const roomCategoryAdvanceSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  minimumAdvancePaise: z.number().int(),
});
export type RoomCategoryAdvance = z.infer<typeof roomCategoryAdvanceSchema>;
export const roomCategoryAdvanceListSchema = z.object({ data: z.array(roomCategoryAdvanceSchema) });

const bedPlaceSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  wardName: z.string(),
  roomCategoryName: z.string().nullable(),
});

export const admissionSummarySchema = z.object({
  id: z.uuid(),
  number: z.string(),
  status: z.enum(ADMISSION_STATUSES),
  patient: z.object({ id: z.uuid(), uhid: z.string(), fullName: z.string(), sex: z.enum([...SEXES, 'unknown']), dateOfBirth: isoDateSchema.nullable() }),
  doctor: z.object({ id: z.uuid(), fullName: z.string() }),
  /** The bed held now; null once discharged. */
  bed: bedPlaceSchema.nullable(),
  admittedAt: z.iso.datetime(),
  dischargedAt: z.iso.datetime().nullable(),
  /** The room category's minimum advance and the deposit held, as they were at admission. */
  minimumAdvancePaise: z.number().int(),
  depositHeldPaise: z.number().int(),
  advanceShort: z.boolean(),
});
export type AdmissionSummary = z.infer<typeof admissionSummarySchema>;
export const admissionListSchema = listResponseSchema(admissionSummarySchema);

export const admissionListQuerySchema = paginationQuerySchema.extend({ status: z.enum(ADMISSION_STATUSES).optional() });
export type AdmissionListQuery = z.infer<typeof admissionListQuerySchema>;

export const admissionSchema = admissionSummarySchema.extend({
  payerType: z.enum(PAYER_TYPES),
  reason: z.string().nullable(),
  opdVisitId: z.uuid().nullable(),
  admittedByName: z.string().nullable(),
  /** Set once the doctor has marked the patient fit for discharge. */
  dischargeId: z.uuid().nullable(),
  beds: z.array(
    bedPlaceSchema.extend({
      startedAt: z.iso.datetime(),
      endedAt: z.iso.datetime().nullable(),
      endReason: z.enum(['transfer', 'discharge']).nullable(),
    }),
  ),
  /** Room and nursing charges posted for each midnight in a bed. */
  dailyCharges: z.array(
    z.object({
      chargeDate: isoDateSchema,
      kind: z.enum(['room', 'nursing']),
      description: z.string(),
      amountPaise: z.number().int(),
      bedCode: z.string(),
    }),
  ),
});
export type Admission = z.infer<typeof admissionSchema>;

/** An interim bill: what the stay has come to so far, before the final bill. It has no number. */
export const interimBillSchema = z.object({
  admissionId: z.uuid(),
  admissionNumber: z.string(),
  issuer: issuerSchema,
  patient: billedPatientSchema,
  admittedAt: z.iso.datetime(),
  generatedAt: z.iso.datetime(),
  lines: z.array(
    z.object({
      description: z.string(),
      serviceDate: isoDateSchema,
      quantity: z.number().int(),
      unitRatePaise: z.number().int(),
      taxRateBp: z.number().int(),
      amountPaise: z.number().int(),
      totalPaise: z.number().int(),
    }),
  ),
  subtotalPaise: z.number().int(),
  cgstPaise: z.number().int(),
  sgstPaise: z.number().int(),
  roundOffPaise: z.number().int(),
  totalPaise: z.number().int(),
  /** Held for the patient now, to be set against the final bill. */
  depositHeldPaise: z.number().int(),
});
export type InterimBill = z.infer<typeof interimBillSchema>;

export const bedBoardSchema = z.object({
  wards: z.array(
    z.object({
      id: z.uuid(),
      code: z.string(),
      name: z.string(),
      roomCategory: z.object({ id: z.uuid(), name: z.string(), minimumAdvancePaise: z.number().int() }).nullable(),
      beds: z.array(
        z.object({
          id: z.uuid(),
          code: z.string(),
          status: z.enum(BED_STATUSES),
          occupant: z.object({ admissionId: z.uuid(), admissionNumber: z.string(), patientName: z.string(), uhid: z.string() }).nullable(),
        }),
      ),
    }),
  ),
});
export type BedBoard = z.infer<typeof bedBoardSchema>;

/** OPD visits of the last 7 days where the doctor advised admission and none followed yet. */
export const admissionAdvisedListSchema = z.object({
  data: z.array(
    z.object({
      visitId: z.uuid(),
      visitDate: isoDateSchema,
      patient: z.object({ id: z.uuid(), uhid: z.string(), fullName: z.string() }),
      doctor: z.object({ id: z.uuid(), fullName: z.string() }),
      diagnosis: z.string().nullable(),
    }),
  ),
});
export type AdmissionAdvisedList = z.infer<typeof admissionAdvisedListSchema>;
