import { PAYMENT_MODES, type PaymentMode } from '@devmsr/validation';

export interface ReceiptLine {
  cashierId: string;
  mode: PaymentMode;
  purpose: 'bill_payment' | 'deposit';
  amountPaise: bigint;
  voided: boolean;
}

export interface RefundLine {
  cashierId: string;
  mode: PaymentMode;
  amountPaise: bigint;
}

export interface MoneyCounts {
  paymentsPaise: bigint;
  depositsPaise: bigint;
  refundsPaise: bigint;
  netPaise: bigint;
  receipts: number;
  refunds: number;
}

export interface CollectionTotals {
  rows: { cashierId: string; mode: PaymentMode; counts: MoneyCounts }[];
  byMode: { mode: PaymentMode; counts: MoneyCounts }[];
  totals: MoneyCounts;
  voided: { count: number; amountPaise: bigint };
}

function empty(): MoneyCounts {
  return { paymentsPaise: 0n, depositsPaise: 0n, refundsPaise: 0n, netPaise: 0n, receipts: 0, refunds: 0 };
}

function addReceipt(counts: MoneyCounts, receipt: ReceiptLine): void {
  if (receipt.purpose === 'deposit') counts.depositsPaise += receipt.amountPaise;
  else counts.paymentsPaise += receipt.amountPaise;
  counts.netPaise += receipt.amountPaise;
  counts.receipts += 1;
}

function addRefund(counts: MoneyCounts, refund: RefundLine): void {
  counts.refundsPaise += refund.amountPaise;
  counts.netPaise -= refund.amountPaise;
  counts.refunds += 1;
}

const MODE_ORDER = new Map(PAYMENT_MODES.map((mode, index) => [mode, index]));

/**
 * The day-end collection (docs/billing-rules.md): receipts taken and refunds paid in the day, by the
 * cashier whose shift took them and by payment mode. Void receipts are left out of every figure and
 * counted on their own; refunds are taken off.
 */
export function collectionTotals(receipts: readonly ReceiptLine[], refunds: readonly RefundLine[]): CollectionTotals {
  const rows = new Map<string, { cashierId: string; mode: PaymentMode; counts: MoneyCounts }>();
  const modes = new Map<PaymentMode, MoneyCounts>();
  const totals = empty();
  const voided = { count: 0, amountPaise: 0n };
  const row = (cashierId: string, mode: PaymentMode) => {
    const key = `${cashierId}:${mode}`;
    const found = rows.get(key) ?? { cashierId, mode, counts: empty() };
    rows.set(key, found);
    return found.counts;
  };
  const byMode = (mode: PaymentMode) => {
    const found = modes.get(mode) ?? empty();
    modes.set(mode, found);
    return found;
  };
  for (const receipt of receipts) {
    if (receipt.voided) {
      voided.count += 1;
      voided.amountPaise += receipt.amountPaise;
      continue;
    }
    for (const counts of [row(receipt.cashierId, receipt.mode), byMode(receipt.mode), totals]) addReceipt(counts, receipt);
  }
  for (const refund of refunds) {
    for (const counts of [row(refund.cashierId, refund.mode), byMode(refund.mode), totals]) addRefund(counts, refund);
  }
  const modeRank = (mode: PaymentMode) => MODE_ORDER.get(mode) ?? 0;
  return {
    rows: [...rows.values()].sort((a, b) => a.cashierId.localeCompare(b.cashierId) || modeRank(a.mode) - modeRank(b.mode)),
    byMode: [...modes.entries()].sort(([a], [b]) => modeRank(a) - modeRank(b)).map(([mode, counts]) => ({ mode, counts })),
    totals,
    voided,
  };
}
