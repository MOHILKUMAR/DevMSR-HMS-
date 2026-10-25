import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import type { BillingRepository } from '../billing/billing.repository.js';
import type { BillingService } from '../billing/billing.service.js';
import { AppError } from '../common/errors/app-error.js';
import type { TransactionRunner } from '../common/prisma/transaction-runner.js';
import type { NumberingService } from '../numbering/numbering.service.js';
import type { PaymentsRepository, ShiftRow } from './payments.repository.js';
import { PaymentsService } from './payments.service.js';

const META = { requestId: 'r', ipAddress: null, userAgent: null };
const CASHIER: AuthContext = { sessionId: 's', userId: 'u1', hospitalId: 'h1', kind: 'staff', permissions: new Set(), expiresAt: new Date() };
const NOW = new Date('2026-10-25T04:30:00Z');
const SHIFT: ShiftRow = {
  id: 'sh1',
  cashierId: 'u1',
  openedAt: NOW,
  openingCashPaise: 100_000n,
  closedAt: null,
  countedCashPaise: null,
  expectedCashPaise: null,
  differencePaise: null,
  differenceReason: null,
};
const BILL = { id: 'i1', patientId: 'p1', status: 'issued', totalPaise: 50_000n };

function setup() {
  const payments = {
    findOpenShift: vi.fn().mockResolvedValue(SHIFT),
    lockShift: vi.fn().mockResolvedValue(SHIFT),
    // Rs 300 cash and Rs 200 by UPI taken so far.
    shiftTotals: vi.fn().mockResolvedValue(
      new Map([
        [
          'sh1',
          [
            { mode: 'cash', purpose: 'bill_payment', count: 1, amountPaise: 30_000n },
            { mode: 'upi', purpose: 'deposit', count: 1, amountPaise: 20_000n },
          ],
        ],
      ]),
    ),
    closeShift: vi.fn().mockImplementation((_id: string, data: object) => Promise.resolve({ ...SHIFT, ...data })),
    lockHeldDeposits: vi.fn().mockResolvedValue([
      { id: 'd1', heldPaise: 10_000n },
      { id: 'd2', heldPaise: 50_000n },
    ]),
    allocate: vi.fn().mockResolvedValue(undefined),
    createReceipt: vi.fn(),
  };
  const billing = {
    lockInvoice: vi.fn().mockResolvedValue(BILL),
    balances: vi.fn().mockResolvedValue(new Map([['i1', { paid: 20_000n, credited: 0n, refunded: 0n }]])),
    userNames: vi.fn().mockResolvedValue(new Map()),
  };
  const bills = { getInvoice: vi.fn().mockResolvedValue({ id: 'i1' }) };
  const numbering = { nextDocumentNumber: vi.fn() };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const transactions = { run: vi.fn((work: (tx: unknown) => Promise<unknown>) => work({})) };
  const service = new PaymentsService(
    payments as unknown as PaymentsRepository,
    billing as unknown as BillingRepository,
    bills as unknown as BillingService,
    numbering as unknown as NumberingService,
    audit as unknown as AuditService,
    transactions as unknown as TransactionRunner,
  );
  return { service, payments, billing, numbering };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error: unknown = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppError);
  return (error as AppError).code;
}

describe('PaymentsService shifts', () => {
  it('expects the opening cash plus cash taken, and records the difference with its reason', async () => {
    const { service, payments } = setup();
    // Expected 1,000 + 300 = Rs 1,300; counted Rs 1,290.
    const closed = await service.closeShift(CASHIER, 'sh1', { countedCashPaise: 129_000, differenceReason: 'Change given twice' }, META, NOW);
    expect(payments.closeShift).toHaveBeenCalledWith(
      'sh1',
      expect.objectContaining({ expectedCashPaise: 130_000n, differencePaise: -1_000n, differenceReason: 'Change given twice' }),
      {},
    );
    expect(closed.byMode).toEqual([
      { mode: 'cash', count: 1, amountPaise: 30_000 },
      { mode: 'upi', count: 1, amountPaise: 20_000 },
    ]);
  });

  it('needs a reason only when the count differs', async () => {
    const { service } = setup();
    expect(await codeOf(service.closeShift(CASHIER, 'sh1', { countedCashPaise: 129_000 }, META, NOW))).toBe('VALIDATION_FAILED');
    await expect(service.closeShift(CASHIER, 'sh1', { countedCashPaise: 130_000 }, META, NOW)).resolves.toBeDefined();
  });

  it("treats another cashier's shift as not found, and a closed shift as closed", async () => {
    const { service, payments } = setup();
    payments.lockShift.mockResolvedValue({ ...SHIFT, cashierId: 'u2' });
    expect(await codeOf(service.closeShift(CASHIER, 'sh1', { countedCashPaise: 0 }, META, NOW))).toBe('NOT_FOUND');
    payments.lockShift.mockResolvedValue({ ...SHIFT, closedAt: NOW });
    expect(await codeOf(service.closeShift(CASHIER, 'sh1', { countedCashPaise: 0 }, META, NOW))).toBe('SHIFT_CLOSED');
  });
});

describe('PaymentsService money in', () => {
  it('takes money only into an open shift, and never more than is due', async () => {
    const { service, payments, numbering } = setup();
    payments.findOpenShift.mockResolvedValue(null);
    expect(await codeOf(service.takePayment(CASHIER, { invoiceId: 'i1', mode: 'cash', amountPaise: 1_000 }, META, NOW))).toBe('SHIFT_REQUIRED');
    payments.findOpenShift.mockResolvedValue(SHIFT);
    // Rs 500 bill, Rs 200 paid: Rs 300 due.
    expect(await codeOf(service.takePayment(CASHIER, { invoiceId: 'i1', mode: 'cash', amountPaise: 30_001 }, META, NOW))).toBe('AMOUNT_EXCEEDS_DUE');
    expect(numbering.nextDocumentNumber).not.toHaveBeenCalled();
  });

  it('refuses payment against a draft bill', async () => {
    const { service, billing } = setup();
    billing.lockInvoice.mockResolvedValue({ ...BILL, status: 'draft' });
    expect(await codeOf(service.takePayment(CASHIER, { invoiceId: 'i1', mode: 'cash', amountPaise: 100 }, META, NOW))).toBe('BILL_NOT_ISSUED');
  });

  it('sets deposits against a bill oldest first', async () => {
    const { service, payments } = setup();
    await service.applyDeposit(CASHIER, 'i1', { amountPaise: 25_000 }, META);
    expect(payments.allocate).toHaveBeenNthCalledWith(1, 'h1', expect.objectContaining({ receiptId: 'd1', amountPaise: 10_000n }), {});
    expect(payments.allocate).toHaveBeenNthCalledWith(2, 'h1', expect.objectContaining({ receiptId: 'd2', amountPaise: 15_000n }), {});
  });

  it('refuses to apply more deposit than is held or due', async () => {
    const { service, payments } = setup();
    expect(await codeOf(service.applyDeposit(CASHIER, 'i1', { amountPaise: 30_001 }, META))).toBe('AMOUNT_EXCEEDS_DUE');
    payments.lockHeldDeposits.mockResolvedValue([{ id: 'd1', heldPaise: 5_000n }]);
    expect(await codeOf(service.applyDeposit(CASHIER, 'i1', { amountPaise: 10_000 }, META))).toBe('NO_DEPOSIT_HELD');
  });
});
