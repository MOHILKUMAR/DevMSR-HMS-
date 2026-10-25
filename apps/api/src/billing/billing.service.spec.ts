import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import { AppError } from '../common/errors/app-error.js';
import type { TransactionRunner } from '../common/prisma/transaction-runner.js';
import type { NumberingService } from '../numbering/numbering.service.js';
import type { BillingRepository, ChargeRow } from './billing.repository.js';
import { BillingService } from './billing.service.js';

const META = { requestId: 'r', ipAddress: null, userAgent: null };
const CLERK: AuthContext = { sessionId: 's', userId: 'u1', hospitalId: 'h1', kind: 'staff', permissions: new Set(), expiresAt: new Date() };
// 25 Oct 2026, 10:00 IST.
const NOW = new Date('2026-10-25T04:30:00Z');
const PATIENT = { id: 'p1', uhid: 'DEMO-2026-000001', fullName: 'Ravi Kumar', sex: 'male', dateOfBirth: null, phone: null, addressLine: null, city: null, state: null, pincode: null };

function charge(overrides: Partial<ChargeRow> = {}): ChargeRow {
  return {
    id: 'c1',
    patientId: 'p1',
    serviceItemId: 's1',
    description: 'ECG',
    serviceDate: new Date('2026-10-25T00:00:00Z'),
    quantity: 1,
    unitRatePaise: 30_000n,
    taxRateBp: 0,
    amountPaise: 30_000n,
    status: 'pending',
    invoiceId: null,
    createdAt: NOW,
    ...overrides,
  };
}

function setup() {
  const repo = {
    findPatient: vi.fn().mockResolvedValue(PATIENT),
    findItemAndRate: vi.fn().mockResolvedValue({ id: 's1', name: 'ECG', isActive: true, rates: [{ id: 'r1', ratePaise: 30_000n, taxRateBp: 0 }] }),
    createCharge: vi.fn().mockImplementation((data: { quantity: number; amountPaise: bigint }) => Promise.resolve(charge(data))),
    lockCharges: vi.fn().mockResolvedValue([charge()]),
    lockInvoice: vi.fn(),
  };
  const numbering = { nextDocumentNumber: vi.fn() };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const transactions = { run: vi.fn((work: (tx: unknown) => Promise<unknown>) => work({})) };
  const service = new BillingService(
    repo as unknown as BillingRepository,
    numbering as unknown as NumberingService,
    audit as unknown as AuditService,
    transactions as unknown as TransactionRunner,
  );
  return { service, repo, numbering };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error: unknown = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppError);
  return (error as AppError).code;
}

describe('BillingService.postCharge', () => {
  it('copies the rate onto the charge and works out the amount', async () => {
    const { service, repo } = setup();
    const posted = await service.postCharge(CLERK, 'p1', { serviceItemId: 's1', quantity: 3 }, META, NOW);
    expect(posted).toMatchObject({ quantity: 3, amountPaise: 90_000 });
    expect(repo.createCharge).toHaveBeenCalledWith(expect.objectContaining({ tariffRateId: 'r1', unitRatePaise: 30_000n, amountPaise: 90_000n }), {});
    expect(repo.findItemAndRate).toHaveBeenCalledWith('h1', 's1', '2026-10-25');
  });

  it('refuses a future service date, a service without a rate, and a retired service', async () => {
    const { service, repo } = setup();
    expect(await codeOf(service.postCharge(CLERK, 'p1', { serviceItemId: 's1', quantity: 1, serviceDate: '2026-10-26' }, META, NOW))).toBe('VALIDATION_FAILED');
    repo.findItemAndRate.mockResolvedValue({ id: 's1', name: 'ECG', isActive: true, rates: [] });
    expect(await codeOf(service.postCharge(CLERK, 'p1', { serviceItemId: 's1', quantity: 1 }, META, NOW))).toBe('RATE_MISSING');
    repo.findItemAndRate.mockResolvedValue({ id: 's1', name: 'ECG', isActive: false, rates: [] });
    expect(await codeOf(service.postCharge(CLERK, 'p1', { serviceItemId: 's1', quantity: 1 }, META, NOW))).toBe('REFERENCE_INVALID');
  });
});

describe('BillingService bills', () => {
  it('refuses charges already on a bill, billed, or of another patient', async () => {
    const { service, repo } = setup();
    for (const taken of [charge({ invoiceId: 'i0' }), charge({ status: 'billed', invoiceId: 'i0' }), charge({ patientId: 'p2' })]) {
      repo.lockCharges.mockResolvedValue([taken]);
      expect(await codeOf(service.createDraft(CLERK, { patientId: 'p1', chargeIds: ['c1'] }, META))).toBe('CHARGE_UNAVAILABLE');
    }
    repo.lockCharges.mockResolvedValue([]);
    expect(await codeOf(service.createDraft(CLERK, { patientId: 'p1', chargeIds: ['c1'] }, META))).toBe('CHARGE_UNAVAILABLE');
  });

  it('never issues or discards a bill that is not a draft', async () => {
    const { service, repo, numbering } = setup();
    repo.lockInvoice.mockResolvedValue({ id: 'i1', status: 'issued' });
    expect(await codeOf(service.issue(CLERK, 'i1', META, NOW))).toBe('INVOICE_LOCKED');
    expect(await codeOf(service.discard(CLERK, 'i1', META, NOW))).toBe('INVOICE_LOCKED');
    expect(numbering.nextDocumentNumber).not.toHaveBeenCalled();
    repo.lockInvoice.mockResolvedValue(null);
    expect(await codeOf(service.issue(CLERK, 'i9', META, NOW))).toBe('NOT_FOUND');
  });
});
