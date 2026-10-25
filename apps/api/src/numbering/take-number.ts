import type { NumberKind } from '../generated/prisma/client.js';
import type { Tx } from '../common/prisma/tx.js';

/**
 * Takes the next number of a series inside the caller's transaction. The counter row stays locked
 * until that transaction ends, so concurrent callers queue up, and a rolled-back transaction gives
 * its number back: the series has no gaps and no repeats. The first number of a period is 1.
 */
export async function takeNumber(tx: Tx, hospitalId: string, kind: NumberKind, period: string): Promise<number> {
  const rows = await tx.$queryRaw<{ last_value: number }[]>`
    INSERT INTO number_counters (hospital_id, kind, period, last_value, updated_at)
    VALUES (${hospitalId}::uuid, ${kind}::number_kind, ${period}, 1, now())
    ON CONFLICT (hospital_id, kind, period)
    DO UPDATE SET last_value = number_counters.last_value + 1, updated_at = now()
    RETURNING last_value`;
  const value = rows[0]?.last_value;
  if (value === undefined) throw new Error('The number counter returned no value');
  return value;
}

/** `DEMO-2026-000001`: hospital code, calendar year (IST), number padded to 6 digits (docs/billing-rules.md). */
export function formatUhid(hospitalCode: string, year: string, value: number): string {
  return `${hospitalCode}-${year}-${String(value).padStart(6, '0')}`;
}

/** The document types with their own number series, and the code each number carries. */
export const DOCUMENT_PREFIXES = { invoice: 'INV', receipt: 'RCT', credit_note: 'CN', refund: 'RF' } as const;
export type DocumentKind = keyof typeof DOCUMENT_PREFIXES;

/** `DEMO/INV/2026-27/000001`: hospital code, type, financial year, 6 digits (docs/billing-rules.md). */
export function formatDocumentNumber(hospitalCode: string, kind: DocumentKind, financialYear: string, value: number): string {
  return `${hospitalCode}/${DOCUMENT_PREFIXES[kind]}/${financialYear}/${String(value).padStart(6, '0')}`;
}
