import { z } from 'zod';
import { billedPatientSchema, invoiceSummarySchema, issuerSchema } from './billing.js';
import { isoDateSchema, listResponseSchema, uuidSchema } from './common.js';
import { admissionSummarySchema } from './ipd.js';
import { paginationQuerySchema } from './pagination.js';

// Discharge (docs/billing-rules.md, discharge and reports): the treating doctor marks the patient fit,
// billing prepares and issues the final bill, the account is settled, billing gives clearance (or the
// MD approves clearance with money still due), the doctor drafts the summary and the MD signs it off,
// then the ward completes the discharge and the bed goes to cleaning.

export const DISCHARGE_STATUSES = ['open', 'completed'] as const;
export type DischargeStatus = (typeof DISCHARGE_STATUSES)[number];
export const SUMMARY_STATUSES = ['none', 'draft', 'signed'] as const;
export type SummaryStatus = (typeof SUMMARY_STATUSES)[number];

export const markFitSchema = z.object({
  admissionId: uuidSchema,
  note: z.string().trim().min(3).max(500).optional(),
});
export type MarkFit = z.infer<typeof markFitSchema>;

/** Optional text: an empty value is stored as null. */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable();
}

export const dischargeSummaryInputSchema = z.object({
  diagnosis: z.string().trim().min(3).max(2000),
  courseInHospital: z.string().trim().min(3).max(4000),
  conditionAtDischarge: z.string().trim().min(3).max(1000),
  medications: optionalText(4000),
  advice: optionalText(2000),
  followUpDate: isoDateSchema.nullable(),
});
export type DischargeSummaryInput = z.infer<typeof dischargeSummaryInputSchema>;

/**
 * Where the patient's account stands. Clearance needs every amount at zero (money due may instead be
 * approved by the MD) and every night's room and nursing charge posted.
 */
export const dischargeBalanceSchema = z.object({
  /** Charges not on any bill yet, or only on a draft. */
  unbilledCount: z.number().int(),
  unbilledPaise: z.number().int(),
  /** Owed on issued bills. */
  duePaise: z.number().int(),
  /** Deposits not set against bills or refunded. */
  depositHeldPaise: z.number().int(),
  /** Overpaid on bills and not refunded. */
  refundablePaise: z.number().int(),
  /** Days whose room or nursing charge is not posted yet (no rate, or the night job has not run). */
  missingRoomCharges: z.array(isoDateSchema),
  settled: z.boolean(),
});
export type DischargeBalance = z.infer<typeof dischargeBalanceSchema>;

export const dischargeRowSchema = z.object({
  id: z.uuid(),
  admission: admissionSummarySchema,
  fitAt: z.iso.datetime(),
  fitByName: z.string().nullable(),
  /** The latest billing clearance; a newer charge or payment can make it out of date. */
  clearedAt: z.iso.datetime().nullable(),
  summaryStatus: z.enum(SUMMARY_STATUSES),
  completedAt: z.iso.datetime().nullable(),
});
export type DischargeRow = z.infer<typeof dischargeRowSchema>;
export const dischargeListSchema = listResponseSchema(dischargeRowSchema);

export const dischargeListQuerySchema = paginationQuerySchema.extend({ status: z.enum(DISCHARGE_STATUSES).optional() });
export type DischargeListQuery = z.infer<typeof dischargeListQuerySchema>;

export const dischargeSchema = dischargeRowSchema.extend({
  fitNote: z.string().nullable(),
  clearance: z
    .object({
      clearedAt: z.iso.datetime(),
      clearedByName: z.string().nullable(),
      /** Zero, or the amount still due that the MD approved. */
      duePaise: z.number().int(),
      approvalRequestId: z.uuid().nullable(),
    })
    .nullable(),
  /** A clearance with dues waiting for the MD. */
  pendingDuesRequestId: z.uuid().nullable(),
  summary: z
    .object({
      draftedByName: z.string().nullable(),
      draftedAt: z.iso.datetime(),
      signedByName: z.string().nullable(),
      signedAt: z.iso.datetime().nullable(),
    })
    .nullable(),
  /** Bills of the patient made since admission, newest first. */
  bills: z.array(invoiceSummarySchema),
  balance: dischargeBalanceSchema,
  completedByName: z.string().nullable(),
  /** The doctor of the admission is the signed-in user, so they may draft the summary. */
  isTreatingDoctor: z.boolean(),
});
export type Discharge = z.infer<typeof dischargeSchema>;

/** The discharge summary for its doctor, the MD and the ward, and for printing once signed. */
export const dischargeSummaryDocumentSchema = z.object({
  dischargeId: z.uuid(),
  admissionNumber: z.string(),
  issuer: issuerSchema,
  patient: billedPatientSchema,
  doctorName: z.string(),
  departmentName: z.string(),
  admittedAt: z.iso.datetime(),
  /** When the discharge was completed; null until then. */
  dischargedAt: z.iso.datetime().nullable(),
  wardName: z.string().nullable(),
  content: z
    .object({
      diagnosis: z.string(),
      courseInHospital: z.string(),
      conditionAtDischarge: z.string(),
      medications: z.string().nullable(),
      advice: z.string().nullable(),
      followUpDate: isoDateSchema.nullable(),
    })
    .nullable(),
  draftedByName: z.string().nullable(),
  draftedAt: z.iso.datetime().nullable(),
  signedByName: z.string().nullable(),
  signedAt: z.iso.datetime().nullable(),
});
export type DischargeSummaryDocument = z.infer<typeof dischargeSummaryDocumentSchema>;
