import { z } from 'zod';
import { PAYMENT_MODES } from './billing.js';
import { isoDateSchema } from './common.js';

// Reports (docs/billing-rules.md, discharge and reports). A report day is a calendar day, midnight to
// midnight IST.

/** `?date=YYYY-MM-DD`; today in IST when left out. */
export const reportDateQuerySchema = z.object({ date: isoDateSchema.optional() });
export type ReportDateQuery = z.infer<typeof reportDateQuerySchema>;

const moneyCounts = {
  /** Payments against bills, leaving out void receipts. */
  paymentsPaise: z.number().int(),
  /** Deposits taken, leaving out void receipts. */
  depositsPaise: z.number().int(),
  /** Refunds paid out. */
  refundsPaise: z.number().int(),
  /** Payments and deposits less refunds: what the drawer or account gained. */
  netPaise: z.number().int(),
  receipts: z.number().int(),
  refunds: z.number().int(),
};

/** The day-end collection report: money taken and paid back, by cashier and payment mode. */
export const collectionReportSchema = z.object({
  date: isoDateSchema,
  generatedAt: z.iso.datetime(),
  rows: z.array(
    z.object({
      cashierId: z.uuid(),
      cashierName: z.string().nullable(),
      mode: z.enum(PAYMENT_MODES),
      ...moneyCounts,
    }),
  ),
  byMode: z.array(z.object({ mode: z.enum(PAYMENT_MODES), ...moneyCounts })),
  totals: z.object(moneyCounts),
  /** Receipts of the day later voided: left out of every figure above, shown so they can be checked. */
  voided: z.object({ count: z.number().int(), amountPaise: z.number().int() }),
});
export type CollectionReport = z.infer<typeof collectionReportSchema>;

/** Basic counts for the MD: the day's OPD and admissions, and the beds as they are now. */
export const operationsReportSchema = z.object({
  date: isoDateSchema,
  generatedAt: z.iso.datetime(),
  opd: z.object({ tokens: z.number().int(), seen: z.number().int(), cancelled: z.number().int() }),
  admissions: z.number().int(),
  discharges: z.number().int(),
  /** Now, not on the report date: bed states have no history. */
  beds: z.object({
    total: z.number().int(),
    occupied: z.number().int(),
    free: z.number().int(),
    cleaning: z.number().int(),
    reserved: z.number().int(),
    blocked: z.number().int(),
  }),
  wards: z.array(z.object({ name: z.string(), total: z.number().int(), occupied: z.number().int() })),
});
export type OperationsReport = z.infer<typeof operationsReportSchema>;

/** The daily day book for Tally, as CSV text (docs/billing-rules.md). */
export const dayBookCsvSchema = z.string();
