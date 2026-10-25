import { z } from 'zod';
import { isoDateSchema, itemsResponseSchema, listResponseSchema, paiseSchema, uuidSchema } from './common.js';
import { paginationQuerySchema } from './pagination.js';
import { SEXES } from './patients.js';

// Charges, bills, receipts, deposits and cash shifts. The rules are in docs/billing-rules.md.

export const PAYMENT_MODES = ['cash', 'upi', 'card', 'bank_transfer', 'cheque'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];
export const RECEIPT_PURPOSES = ['bill_payment', 'deposit'] as const;
export const INVOICE_STATUSES = ['draft', 'issued', 'discarded'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** Most of one service in one go: 999 units. */
export const MAX_CHARGE_QUANTITY = 999;

// Charges.

export const postChargeSchema = z.object({
  serviceItemId: uuidSchema,
  quantity: z.number().int().min(1).max(MAX_CHARGE_QUANTITY),
  /** The day the service was given, in IST. Defaults to today; never in the future. */
  serviceDate: isoDateSchema.optional(),
});
export type PostCharge = z.infer<typeof postChargeSchema>;

export const chargeSchema = z.object({
  id: z.uuid(),
  serviceItemId: z.uuid(),
  description: z.string(),
  serviceDate: isoDateSchema,
  quantity: z.number().int(),
  unitRatePaise: z.number().int(),
  taxRateBp: z.number().int(),
  amountPaise: z.number().int(),
  status: z.enum(['pending', 'billed']),
  /** The bill holding it: a draft while pending, the issued bill once billed. */
  invoiceId: z.uuid().nullable(),
  postedAt: z.iso.datetime(),
});
export type Charge = z.infer<typeof chargeSchema>;
export const chargeListSchema = itemsResponseSchema(chargeSchema);

// Bills.

export const createInvoiceSchema = z.object({
  patientId: uuidSchema,
  chargeIds: z.array(uuidSchema).min(1).max(500),
});
export type CreateInvoice = z.infer<typeof createInvoiceSchema>;

export const invoiceLineSchema = z.object({
  lineNo: z.number().int(),
  description: z.string(),
  serviceDate: isoDateSchema,
  quantity: z.number().int(),
  unitRatePaise: z.number().int(),
  amountPaise: z.number().int(),
  discountPaise: z.number().int(),
  taxablePaise: z.number().int(),
  taxRateBp: z.number().int(),
  cgstPaise: z.number().int(),
  sgstPaise: z.number().int(),
  totalPaise: z.number().int(),
});
export type InvoiceLine = z.infer<typeof invoiceLineSchema>;

/** The hospital as printed on a bill or receipt. */
export const issuerSchema = z.object({
  name: z.string(),
  addressLine: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  pincode: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  gstin: z.string().nullable(),
});
export type Issuer = z.infer<typeof issuerSchema>;

/** The patient as printed on a bill: as they were when it was issued. */
export const billedPatientSchema = z.object({
  id: z.uuid(),
  uhid: z.string(),
  fullName: z.string(),
  sex: z.enum([...SEXES, 'unknown']),
  dateOfBirth: isoDateSchema.nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
});
export type BilledPatient = z.infer<typeof billedPatientSchema>;

const invoiceTotals = {
  subtotalPaise: z.number().int(),
  discountPaise: z.number().int(),
  taxablePaise: z.number().int(),
  cgstPaise: z.number().int(),
  sgstPaise: z.number().int(),
  roundOffPaise: z.number().int(),
  totalPaise: z.number().int(),
  /** Paid so far: payments and deposits set against this bill. */
  paidPaise: z.number().int(),
  duePaise: z.number().int(),
};

export const invoiceSummarySchema = z.object({
  id: z.uuid(),
  status: z.enum(INVOICE_STATUSES),
  number: z.string().nullable(),
  patientId: z.uuid(),
  patientUhid: z.string(),
  patientName: z.string(),
  totalPaise: z.number().int(),
  paidPaise: z.number().int(),
  duePaise: z.number().int(),
  issuedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type InvoiceSummary = z.infer<typeof invoiceSummarySchema>;
export const invoiceListSchema = listResponseSchema(invoiceSummarySchema);

export const invoiceListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(INVOICE_STATUSES).optional(),
  patientId: uuidSchema.optional(),
});
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;

export const invoiceSchema = z.object({
  id: z.uuid(),
  status: z.enum(INVOICE_STATUSES),
  number: z.string().nullable(),
  financialYear: z.string().nullable(),
  ...invoiceTotals,
  issuer: issuerSchema,
  patient: billedPatientSchema,
  lines: z.array(invoiceLineSchema),
  createdAt: z.iso.datetime(),
  createdByName: z.string().nullable(),
  issuedAt: z.iso.datetime().nullable(),
  issuedByName: z.string().nullable(),
});
export type Invoice = z.infer<typeof invoiceSchema>;

// Payments. What has to be noted depends on how the money came in (docs/billing-rules.md).

const referenceSchema = z.string().trim().min(4).max(40).optional();
const paymentDetails = {
  mode: z.enum(PAYMENT_MODES),
  amountPaise: paiseSchema.refine((value) => value > 0, 'More than nothing'),
  /** UPI UTR, card approval code, transfer reference or cheque number. */
  reference: referenceSchema,
  cardLast4: z
    .string()
    .trim()
    .regex(/^\d{4}$/)
    .optional(),
  bankName: z.string().trim().min(2).max(80).optional(),
};

type PaymentFields = { mode: PaymentMode; reference?: string | undefined; cardLast4?: string | undefined; bankName?: string | undefined };

/** Cash needs nothing more; UPI needs its UTR; card the approval code and last 4 digits; a transfer or cheque its number and bank. */
function detailsComplete(value: PaymentFields): boolean {
  switch (value.mode) {
    case 'cash':
      return value.reference === undefined && value.cardLast4 === undefined && value.bankName === undefined;
    case 'upi':
      return value.reference !== undefined && value.cardLast4 === undefined && value.bankName === undefined;
    case 'card':
      return value.reference !== undefined && value.cardLast4 !== undefined && value.bankName === undefined;
    case 'bank_transfer':
    case 'cheque':
      return value.reference !== undefined && value.bankName !== undefined && value.cardLast4 === undefined;
  }
}

const detailsMessage = { message: 'Enter the details this payment mode needs, and only those', path: ['reference'] };

export const takePaymentSchema = z.object({ invoiceId: uuidSchema, ...paymentDetails }).refine(detailsComplete, detailsMessage);
export type TakePayment = z.infer<typeof takePaymentSchema>;

export const takeDepositSchema = z.object({ patientId: uuidSchema, ...paymentDetails }).refine(detailsComplete, detailsMessage);
export type TakeDeposit = z.infer<typeof takeDepositSchema>;

/** Sets held deposit against a bill, oldest deposit first. */
export const applyDepositSchema = z.object({ amountPaise: paiseSchema.refine((value) => value > 0, 'More than nothing') });
export type ApplyDeposit = z.infer<typeof applyDepositSchema>;

export const receiptSchema = z.object({
  id: z.uuid(),
  number: z.string(),
  purpose: z.enum(RECEIPT_PURPOSES),
  mode: z.enum(PAYMENT_MODES),
  amountPaise: z.number().int(),
  reference: z.string().nullable(),
  cardLast4: z.string().nullable(),
  bankName: z.string().nullable(),
  patient: billedPatientSchema,
  issuer: issuerSchema,
  receivedByName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  /** Bills this money is set against. Whatever is left of a deposit is still held for the patient. */
  allocations: z.array(z.object({ invoiceId: z.uuid(), invoiceNumber: z.string(), amountPaise: z.number().int() })),
  heldPaise: z.number().int(),
});
export type Receipt = z.infer<typeof receiptSchema>;

/** A patient's money at a glance: what is waiting to be billed, owed on bills, and held as deposit. */
export const patientAccountSchema = z.object({
  patientId: z.uuid(),
  /** As printed on bills, so billing staff need no access to the full patient record. */
  patient: billedPatientSchema,
  pendingCharges: z.object({ count: z.number().int(), amountPaise: z.number().int() }),
  invoices: z.array(invoiceSummarySchema),
  receipts: z.array(
    z.object({
      id: z.uuid(),
      number: z.string(),
      purpose: z.enum(RECEIPT_PURPOSES),
      mode: z.enum(PAYMENT_MODES),
      amountPaise: z.number().int(),
      heldPaise: z.number().int(),
      createdAt: z.iso.datetime(),
    }),
  ),
  depositHeldPaise: z.number().int(),
  totalDuePaise: z.number().int(),
});
export type PatientAccount = z.infer<typeof patientAccountSchema>;

// Cash shifts.

export const openShiftSchema = z.object({ openingCashPaise: paiseSchema });
export type OpenShift = z.infer<typeof openShiftSchema>;

export const closeShiftSchema = z.object({
  countedCashPaise: paiseSchema,
  /** Needed when the count differs from what the system expects. */
  differenceReason: z.string().trim().min(3).max(200).optional(),
});
export type CloseShift = z.infer<typeof closeShiftSchema>;

export const shiftSchema = z.object({
  id: z.uuid(),
  cashierName: z.string().nullable(),
  openedAt: z.iso.datetime(),
  openingCashPaise: z.number().int(),
  closedAt: z.iso.datetime().nullable(),
  /** For an open shift, what the drawer should hold now. */
  expectedCashPaise: z.number().int(),
  countedCashPaise: z.number().int().nullable(),
  differencePaise: z.number().int().nullable(),
  differenceReason: z.string().nullable(),
  /** Money taken in this shift, by payment mode. */
  byMode: z.array(z.object({ mode: z.enum(PAYMENT_MODES), count: z.number().int(), amountPaise: z.number().int() })),
  depositsPaise: z.number().int(),
  billPaymentsPaise: z.number().int(),
});
export type Shift = z.infer<typeof shiftSchema>;
export const currentShiftSchema = z.object({ shift: shiftSchema.nullable() });
export const shiftListSchema = listResponseSchema(shiftSchema);

export const chargeListQuerySchema = z.object({ status: z.enum(['pending', 'billed']).optional() });
export type ChargeListQuery = z.infer<typeof chargeListQuerySchema>;
