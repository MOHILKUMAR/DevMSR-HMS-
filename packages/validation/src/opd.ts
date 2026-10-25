import { z } from 'zod';
import { isoDateSchema, listResponseSchema, uuidSchema } from './common.js';
import { paginationQuerySchema } from './pagination.js';
import { SEXES } from './patients.js';

// Walk-in OPD: a daily token for the whole hospital, the consultation fee paid at the cash counter,
// then the doctor's queue (docs/billing-rules.md, CLAUDE.md section 12).

export const OPD_VISIT_STATUSES = ['awaiting_payment', 'waiting', 'with_doctor', 'completed', 'cancelled'] as const;
export type OpdVisitStatus = (typeof OPD_VISIT_STATUSES)[number];

/** Most of one test or procedure a doctor orders in one go. */
export const MAX_ORDER_QUANTITY = 99;
const NOTE_MAX = 2_000;

export const issueTokenSchema = z.object({ patientId: uuidSchema, doctorId: uuidSchema });
export type IssueToken = z.infer<typeof issueTokenSchema>;

export const cancelVisitSchema = z.object({ reason: z.string().trim().min(3).max(200) });
export type CancelVisit = z.infer<typeof cancelVisitSchema>;

export const opdVisitListQuerySchema = paginationQuerySchema.extend({
  /** A day in IST. Defaults to today. */
  date: isoDateSchema.optional(),
  status: z.enum(OPD_VISIT_STATUSES).optional(),
  doctorId: uuidSchema.optional(),
});
export type OpdVisitListQuery = z.infer<typeof opdVisitListQuerySchema>;

export const opdVisitSchema = z.object({
  id: z.uuid(),
  visitDate: isoDateSchema,
  tokenNumber: z.number().int(),
  status: z.enum(OPD_VISIT_STATUSES),
  patient: z.object({
    id: z.uuid(),
    uhid: z.string(),
    fullName: z.string(),
    sex: z.enum([...SEXES, 'unknown']),
    dateOfBirth: isoDateSchema.nullable(),
  }),
  doctor: z.object({ id: z.uuid(), fullName: z.string(), departmentName: z.string() }),
  /** The fee shown when the token was issued. */
  quotedFeePaise: z.number().int(),
  feeInvoiceId: z.uuid().nullable(),
  feeInvoiceNumber: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  paidAt: z.iso.datetime().nullable(),
  calledAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
  cancelReason: z.string().nullable(),
});
export type OpdVisit = z.infer<typeof opdVisitSchema>;
export const opdVisitListSchema = listResponseSchema(opdVisitSchema);

/** The signed-in doctor's queue for today: paid tokens waiting or with them, in token order. */
export const opdQueueSchema = z.object({
  /** Null when the signed-in user is not linked to a doctor in Settings. */
  doctor: z.object({ id: z.uuid(), fullName: z.string() }).nullable(),
  visits: z.array(opdVisitSchema),
  completedToday: z.number().int(),
});
export type OpdQueue = z.infer<typeof opdQueueSchema>;

const noteText = z.string().trim().max(NOTE_MAX).nullable();

/** The doctor's notes. Saved as often as needed while the patient is with the doctor. */
export const consultationNotesSchema = z.object({
  complaints: noteText,
  findings: noteText,
  diagnosis: noteText,
  advice: noteText,
  followUpDate: isoDateSchema.nullable(),
  admissionAdvised: z.boolean(),
});
export type ConsultationNotes = z.infer<typeof consultationNotesSchema>;

export const placeOrderSchema = z.object({
  serviceItemId: uuidSchema,
  quantity: z.number().int().min(1).max(MAX_ORDER_QUANTITY),
});
export type PlaceOrder = z.infer<typeof placeOrderSchema>;

export const opdOrderSchema = z.object({
  chargeId: z.uuid(),
  description: z.string(),
  quantity: z.number().int(),
  amountPaise: z.number().int(),
  orderedAt: z.iso.datetime(),
});
export type OpdOrder = z.infer<typeof opdOrderSchema>;

/** A visit as its doctor sees it: notes and orders included. Every view is audited. */
export const consultationSchema = z.object({
  visit: opdVisitSchema,
  notes: consultationNotesSchema,
  notesUpdatedAt: z.iso.datetime().nullable(),
  orders: z.array(opdOrderSchema),
});
export type Consultation = z.infer<typeof consultationSchema>;
