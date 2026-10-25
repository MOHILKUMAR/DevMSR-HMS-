import { PAYMENT_MODES, type Issuer, type Receipt, type Shift } from '@devmsr/validation';
import { paise, toBilledPatient } from '../../billing/dto/billing.mapper.js';
import type { ReceiptRow, ShiftRow, ShiftTotalsRow } from '../payments.repository.js';

/** Cash in the drawer by now: the opening cash plus every cash receipt of the shift. */
export function expectedCash(row: ShiftRow, totals: readonly ShiftTotalsRow[]): bigint {
  return row.openingCashPaise + totals.filter((total) => total.mode === 'cash').reduce((sum, total) => sum + total.amountPaise, 0n);
}

export function toShift(row: ShiftRow, totals: readonly ShiftTotalsRow[], cashierName: string | null): Shift {
  const sumOf = (pick: (total: ShiftTotalsRow) => boolean) => totals.filter(pick).reduce((sum, total) => sum + total.amountPaise, 0n);
  return {
    id: row.id,
    cashierName,
    openedAt: row.openedAt.toISOString(),
    openingCashPaise: paise(row.openingCashPaise),
    closedAt: row.closedAt?.toISOString() ?? null,
    // A closed shift keeps what was expected when it closed; an open one shows the drawer now.
    expectedCashPaise: paise(row.expectedCashPaise ?? expectedCash(row, totals)),
    countedCashPaise: row.countedCashPaise === null ? null : paise(row.countedCashPaise),
    differencePaise: row.differencePaise === null ? null : paise(row.differencePaise),
    differenceReason: row.differenceReason,
    byMode: PAYMENT_MODES.map((mode) => {
      const ofMode = totals.filter((total) => total.mode === mode);
      return {
        mode,
        count: ofMode.reduce((sum, total) => sum + total.count, 0),
        amountPaise: paise(ofMode.reduce((sum, total) => sum + total.amountPaise, 0n)),
      };
    }).filter((entry) => entry.count > 0),
    depositsPaise: paise(sumOf((total) => total.purpose === 'deposit')),
    billPaymentsPaise: paise(sumOf((total) => total.purpose === 'bill_payment')),
  };
}

export function toReceipt(row: ReceiptRow, issuer: Issuer, receivedByName: string | null): Receipt {
  const allocated = row.allocations.reduce((sum, allocation) => sum + allocation.amountPaise, 0n);
  return {
    id: row.id,
    number: row.number,
    purpose: row.purpose,
    mode: row.mode,
    amountPaise: paise(row.amountPaise),
    reference: row.reference,
    cardLast4: row.cardLast4,
    bankName: row.bankName,
    patient: toBilledPatient(row.patient),
    issuer,
    receivedByName,
    createdAt: row.createdAt.toISOString(),
    allocations: row.allocations.map((allocation) => ({
      invoiceId: allocation.invoiceId,
      invoiceNumber: allocation.invoice.number ?? '',
      amountPaise: paise(allocation.amountPaise),
    })),
    heldPaise: row.purpose === 'deposit' ? paise(row.amountPaise - allocated) : 0,
  };
}
