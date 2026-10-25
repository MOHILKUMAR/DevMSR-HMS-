import { z } from 'zod';
import { billedPatientSchema, issuerSchema, PAYMENT_MODES, RECEIPT_PURPOSES, referenceSchema } from './billing.js';
import { listResponseSchema, paiseSchema, uuidSchema } from './common.js';
import { paginationQuerySchema } from './pagination.js';

// Discounts, credit notes, refunds, receipt voids and billing clearance with money still due: asked
// for by one user, decided by another (maker-checker). The rules are in docs/billing-rules.md.

export const APPROVAL_KINDS = ['discount', 'credit_note', 'refund', 'receipt_void', 'clearance_dues'] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];
export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
/** Refunds can be paid in these modes; never back to a card (docs/billing-rules.md). */
export const REFUND_MODES = ['cash', 'upi', 'bank_transfer', 'cheque'] as const;
export type RefundMode = (typeof REFUND_MODES)[number];

const reasonSchema = z.string().trim().min(3).max(500);
const positivePaise = paiseSchema.refine((value) => value > 0, 'More than nothing');
const lineNoSchema = z.number().int().min(1).max(500);

function distinctLines(lines: readonly { lineNo: number }[]): boolean {
  return new Set(lines.map((line) => line.lineNo)).size === lines.length;
}

// Requests.

/** On a draft bill: an amount or a percentage off the whole bill, or an amount off chosen lines. */
export const requestDiscountSchema = z.object({
  invoiceId: uuidSchema,
  reason: reasonSchema,
  discount: z.discriminatedUnion('scope', [
    z.object({ scope: z.literal('bill_amount'), amountPaise: positivePaise }),
    z.object({ scope: z.literal('bill_percent'), percentBp: z.number().int().min(1).max(10_000) }),
    z.object({
      scope: z.literal('lines'),
      lines: z
        .array(z.object({ lineNo: lineNoSchema, discountPaise: positivePaise }))
        .min(1)
        .max(500)
        .refine(distinctLines, 'Each line once'),
    }),
  ]),
});
export type RequestDiscount = z.infer<typeof requestDiscountSchema>;

/** On an issued bill: the whole bill (a bill void), or chosen lines by units or by taxable amount. */
export const creditAskSchema = z.union([
  z.object({ lineNo: lineNoSchema, quantity: z.number().int().min(1).max(999) }).strict(),
  z.object({ lineNo: lineNoSchema, amountPaise: positivePaise }).strict(),
]);
export type CreditAsk = z.infer<typeof creditAskSchema>;

export const requestCreditNoteSchema = z.object({
  invoiceId: uuidSchema,
  reason: reasonSchema,
  credit: z.discriminatedUnion('scope', [
    z.object({ scope: z.literal('whole_bill') }),
    z.object({ scope: z.literal('lines'), lines: z.array(creditAskSchema).min(1).max(500).refine(distinctLines, 'Each line once') }),
  ]),
});
export type RequestCreditNote = z.infer<typeof requestCreditNoteSchema>;

/** Excess deposit left on a deposit receipt, or what was overpaid on a bill. */
export const requestRefundSchema = z.object({
  reason: reasonSchema,
  amountPaise: positivePaise,
  mode: z.enum(REFUND_MODES),
  source: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('deposit'), receiptId: uuidSchema }),
    z.object({ kind: z.literal('bill'), invoiceId: uuidSchema }),
  ]),
});
export type RequestRefund = z.infer<typeof requestRefundSchema>;

/** Paying out an approved refund: the details its mode needs (cash needs none). */
export const payRefundSchema = z.object({
  reference: referenceSchema,
  bankName: z.string().trim().min(2).max(80).optional(),
});
export type PayRefund = z.infer<typeof payRefundSchema>;

export const requestReceiptVoidSchema = z.object({ receiptId: uuidSchema, reason: reasonSchema });
export type RequestReceiptVoid = z.infer<typeof requestReceiptVoidSchema>;

/** Billing clearance for a discharge while the patient still owes money: the amount due now, for the MD. */
export const requestClearanceDuesSchema = z.object({ dischargeId: uuidSchema, reason: reasonSchema });
export type RequestClearanceDues = z.infer<typeof requestClearanceDuesSchema>;

export const approveRequestSchema = z.object({ note: z.string().trim().min(3).max(500).optional() });
export type ApproveRequest = z.infer<typeof approveRequestSchema>;

/** A rejection always says why. */
export const rejectRequestSchema = z.object({ note: z.string().trim().min(3).max(500) });
export type RejectRequest = z.infer<typeof rejectRequestSchema>;

// What a request asked for, worked out when it was made. Stored with the request.

export const approvalDetailsSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('discount'),
    scope: z.enum(['bill_amount', 'bill_percent', 'lines']),
    percentBp: z.number().int().nullable(),
    lines: z.array(z.object({ lineNo: z.number().int(), description: z.string(), amountPaise: z.number().int(), discountPaise: z.number().int() })),
  }),
  z.object({
    kind: z.literal('credit_note'),
    wholeBill: z.boolean(),
    lines: z.array(
      z.object({
        lineNo: z.number().int(),
        description: z.string(),
        quantity: z.number().int().nullable(),
        amountPaise: z.number().int().nullable(),
        taxablePaise: z.number().int(),
        cgstPaise: z.number().int(),
        sgstPaise: z.number().int(),
        totalPaise: z.number().int(),
      }),
    ),
  }),
  z.object({ kind: z.literal('refund'), source: z.enum(['deposit', 'bill']), mode: z.enum(REFUND_MODES) }),
  z.object({ kind: z.literal('receipt_void'), purpose: z.enum(RECEIPT_PURPOSES), mode: z.enum(PAYMENT_MODES) }),
  z.object({ kind: z.literal('clearance_dues'), admissionId: z.uuid(), admissionNumber: z.string() }),
]);
export type ApprovalDetails = z.infer<typeof approvalDetailsSchema>;

export const approvalRequestSchema = z.object({
  id: z.uuid(),
  kind: z.enum(APPROVAL_KINDS),
  status: z.enum(APPROVAL_STATUSES),
  patient: z.object({ id: z.uuid(), uhid: z.string(), fullName: z.string() }),
  invoiceId: z.uuid().nullable(),
  /** Null for a draft bill, which has no number yet. */
  invoiceNumber: z.string().nullable(),
  receiptId: z.uuid().nullable(),
  receiptNumber: z.string().nullable(),
  /** For a clearance with dues: the discharge it clears. */
  dischargeId: z.uuid().nullable(),
  amountPaise: z.number().int(),
  reason: z.string(),
  details: approvalDetailsSchema,
  requestedById: z.uuid(),
  requestedByName: z.string().nullable(),
  requestedAt: z.iso.datetime(),
  decidedByName: z.string().nullable(),
  decidedAt: z.iso.datetime().nullable(),
  decisionNote: z.string().nullable(),
  /** For an approved discount: the new draft that carries it. */
  resultInvoiceId: z.uuid().nullable(),
  creditNote: z.object({ id: z.uuid(), number: z.string(), totalPaise: z.number().int() }).nullable(),
  refund: z.object({ id: z.uuid(), number: z.string(), createdAt: z.iso.datetime() }).nullable(),
  /** A discount above the hospital's finance limit: only the MD can approve it. */
  aboveLimit: z.boolean(),
});
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;
export const approvalListSchema = listResponseSchema(approvalRequestSchema);

export const approvalListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(APPROVAL_STATUSES).optional(),
  kind: z.enum(APPROVAL_KINDS).optional(),
  patientId: uuidSchema.optional(),
  invoiceId: uuidSchema.optional(),
});
export type ApprovalListQuery = z.infer<typeof approvalListQuerySchema>;

// Documents, as printed.

export const creditNoteSchema = z.object({
  id: z.uuid(),
  requestId: z.uuid(),
  number: z.string(),
  invoiceId: z.uuid(),
  invoiceNumber: z.string(),
  wholeBill: z.boolean(),
  issuer: issuerSchema,
  patient: billedPatientSchema,
  lines: z.array(
    z.object({
      lineNo: z.number().int(),
      description: z.string(),
      quantity: z.number().int().nullable(),
      taxablePaise: z.number().int(),
      cgstPaise: z.number().int(),
      sgstPaise: z.number().int(),
      totalPaise: z.number().int(),
    }),
  ),
  taxablePaise: z.number().int(),
  cgstPaise: z.number().int(),
  sgstPaise: z.number().int(),
  roundOffPaise: z.number().int(),
  totalPaise: z.number().int(),
  reason: z.string(),
  requestedByName: z.string().nullable(),
  approvedByName: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type CreditNote = z.infer<typeof creditNoteSchema>;

export const refundSchema = z.object({
  id: z.uuid(),
  requestId: z.uuid(),
  number: z.string(),
  mode: z.enum(PAYMENT_MODES),
  amountPaise: z.number().int(),
  reference: z.string().nullable(),
  bankName: z.string().nullable(),
  source: z.enum(['deposit', 'bill']),
  /** The deposit receipt or bill the money came back from. */
  sourceNumber: z.string(),
  issuer: issuerSchema,
  patient: billedPatientSchema,
  reason: z.string(),
  paidByName: z.string().nullable(),
  approvedByName: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type Refund = z.infer<typeof refundSchema>;
