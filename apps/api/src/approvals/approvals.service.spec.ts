import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import type { BillingRepository } from '../billing/billing.repository.js';
import { AppError } from '../common/errors/app-error.js';
import type { TransactionRunner } from '../common/prisma/transaction-runner.js';
import type { DischargeService } from '../discharge/discharge.service.js';
import type { NumberingService } from '../numbering/numbering.service.js';
import type { PaymentsRepository } from '../payments/payments.repository.js';
import type { ApprovalsRepository, RequestRow } from './approvals.repository.js';
import { ApprovalsService } from './approvals.service.js';

const META = { requestId: 'r', ipAddress: null, userAgent: null };
const NOW = new Date('2026-10-25T04:30:00Z');

function user(userId: string, permissions: string[]): AuthContext {
  return { sessionId: 's', userId, hospitalId: 'h1', kind: 'staff', permissions: new Set(permissions), expiresAt: NOW, userHospitalId: 'h1', breakGlass: null };
}
const FINANCE = user('finance', ['billing.discount.approve', 'billing.credit-note.approve', 'billing.void.approve']);
const MD = user('md', ['billing.discount.approve', 'billing.discount.approve-above-limit', 'billing.refund.approve']);
const CLERK = user('clerk', ['billing.discount.request']);
const CASHIER = user('cashier', ['payments.refund.pay']);

const LINE = { chargeId: 'c1', lineNo: 1, description: 'Room', serviceDate: NOW, quantity: 1, unitRatePaise: 300_000n, amountPaise: 300_000n, discountPaise: 0n, taxablePaise: 300_000n, taxRateBp: 0, cgstPaise: 0n, sgstPaise: 0n, totalPaise: 300_000n };
const DRAFT = { id: 'i1', patientId: 'p1', status: 'draft', totalPaise: 300_000n, lines: [LINE] };

function requestRow(overrides: Partial<RequestRow>): RequestRow {
  return {
    id: 'q1',
    kind: 'discount',
    status: 'pending',
    patientId: 'p1',
    invoiceId: 'i1',
    receiptId: null,
    dischargeId: null,
    amountPaise: 50_000n,
    reason: 'Staff family',
    details: { kind: 'discount', scope: 'lines', percentBp: null, lines: [{ lineNo: 1, description: 'Room', amountPaise: 300_000, discountPaise: 50_000 }] },
    requestedById: 'clerk',
    requestedAt: NOW,
    decidedById: null,
    decidedAt: null,
    decisionNote: null,
    resultInvoiceId: null,
    patient: { id: 'p1', uhid: 'DEMO-2026-000001', fullName: 'Test Patient' },
    invoice: { number: null },
    receipt: null,
    creditNote: null,
    refund: null,
    ...overrides,
  };
}

function setup(request: RequestRow) {
  const steps: string[] = [];
  const approvals = {
    lockRequest: vi.fn().mockResolvedValue(request),
    findRequest: vi.fn().mockResolvedValue(request),
    discountLimit: vi.fn().mockResolvedValue(100_000n),
    decide: vi.fn().mockImplementation((_id: string, data: object) => {
      steps.push('decide');
      return Promise.resolve({ ...request, ...data });
    }),
    createRequest: vi.fn().mockResolvedValue(request),
  };
  const billing = {
    findInvoice: vi.fn().mockResolvedValue(DRAFT),
    lockInvoice: vi.fn().mockResolvedValue(DRAFT),
    createDraft: vi.fn().mockImplementation(() => {
      steps.push('create');
      return Promise.resolve({ id: 'i2' });
    }),
    discard: vi.fn().mockImplementation(() => {
      steps.push('discard');
      return Promise.resolve({});
    }),
    releaseCharges: vi.fn().mockResolvedValue(undefined),
    attachCharges: vi.fn().mockResolvedValue(1),
    userNames: vi.fn().mockResolvedValue(new Map()),
  };
  const payments = { findOpenShift: vi.fn().mockResolvedValue(null), lockShift: vi.fn() };
  const numbering = { nextDocumentNumber: vi.fn() };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const transactions = { run: vi.fn((work: (tx: unknown) => Promise<unknown>) => work({})) };
  const service = new ApprovalsService(
    approvals as unknown as ApprovalsRepository,
    billing as unknown as BillingRepository,
    payments as unknown as PaymentsRepository,
    numbering as unknown as NumberingService,
    {} as DischargeService,
    audit as unknown as AuditService,
    transactions as unknown as TransactionRunner,
  );
  return { service, approvals, billing, steps };
}

async function errorCode(work: Promise<unknown>): Promise<string> {
  try {
    await work;
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
  throw new Error('Expected an AppError');
}

describe('ApprovalsService', () => {
  it('never lets the requester decide, and decides a request only once', async () => {
    expect(await errorCode(setup(requestRow({ requestedById: 'finance' })).service.approve(FINANCE, 'discount', 'q1', {}, META, NOW))).toBe('SELF_APPROVAL_NOT_ALLOWED');
    expect(await errorCode(setup(requestRow({ status: 'approved' })).service.approve(FINANCE, 'discount', 'q1', {}, META, NOW))).toBe('REQUEST_DECIDED');
    // A request of another kind, or another hospital's, is not found under this route.
    expect(await errorCode(setup(requestRow({ kind: 'refund' })).service.approve(FINANCE, 'discount', 'q1', {}, META, NOW))).toBe('NOT_FOUND');
  });

  it('keeps discounts above the hospital limit for holders of the above-limit permission', async () => {
    const above = requestRow({ amountPaise: 150_000n });
    expect(await errorCode(setup(above).service.approve(FINANCE, 'discount', 'q1', {}, META, NOW))).toBe('ABOVE_APPROVAL_LIMIT');
    const { service, billing } = setup(above);
    await service.approve(MD, 'discount', 'q1', {}, META, NOW);
    expect(billing.createDraft).toHaveBeenCalled();
  });

  it('records the decision before the old draft is discarded, then moves the charges to the new draft', async () => {
    const { service, billing, steps } = setup(requestRow({}));
    await service.approve(FINANCE, 'discount', 'q1', {}, META, NOW);
    expect(steps).toEqual(['create', 'decide', 'discard']);
    expect(billing.attachCharges).toHaveBeenCalledWith('h1', ['c1'], 'i2', {});
    const [, , , totals, lines] = billing.createDraft.mock.calls[0] as [string, string, string, { discountPaise: bigint; totalPaise: bigint }, { discountPaise: bigint }[]];
    expect(totals).toMatchObject({ discountPaise: 50_000n, totalPaise: 250_000n });
    expect(lines[0]?.discountPaise).toBe(50_000n);
  });

  it('refuses a discount on an issued bill, or more than a line', async () => {
    const { service, billing } = setup(requestRow({}));
    const ask = { invoiceId: 'i1', reason: 'Too much', discount: { scope: 'lines' as const, lines: [{ lineNo: 1, discountPaise: 300_001 }] } };
    expect(await errorCode(service.requestDiscount(CLERK, ask, META))).toBe('AMOUNT_TOO_LARGE');
    billing.findInvoice.mockResolvedValue({ ...DRAFT, status: 'issued' });
    expect(await errorCode(service.requestDiscount(CLERK, { ...ask, discount: { scope: 'bill_amount', amountPaise: 1_000 } }, META))).toBe('INVOICE_LOCKED');
  });

  it('pays a refund only once approved, with the details its mode needs', async () => {
    const refund = requestRow({ kind: 'refund', status: 'approved', invoiceId: null, receiptId: 'd1', details: { kind: 'refund', source: 'deposit', mode: 'upi' } });
    expect(await errorCode(setup({ ...refund, status: 'pending' }).service.payRefund(CASHIER, 'q1', { reference: '412345678901' }, META, NOW))).toBe('REFUND_NOT_READY');
    expect(await errorCode(setup(refund).service.payRefund(CASHIER, 'q1', {}, META, NOW))).toBe('VALIDATION_FAILED');
    expect(await errorCode(setup(refund).service.payRefund(CASHIER, 'q1', { reference: '412345678901' }, META, NOW))).toBe('SHIFT_REQUIRED');
  });
});
