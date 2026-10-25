import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import type { BillingRepository } from '../billing/billing.repository.js';
import { AppError } from '../common/errors/app-error.js';
import type { TransactionRunner } from '../common/prisma/transaction-runner.js';
import type { NumberingService } from '../numbering/numbering.service.js';
import type { PaymentsRepository } from '../payments/payments.repository.js';
import type { OpdRepository, VisitRow } from './opd.repository.js';
import { OpdService } from './opd.service.js';

const META = { requestId: 'r', ipAddress: null, userAgent: null };
const NOW = new Date('2026-10-26T04:30:00Z');
const user = (userId: string): AuthContext => ({ sessionId: 's', userId, hospitalId: 'h1', kind: 'staff', permissions: new Set(), expiresAt: NOW, userHospitalId: 'h1', breakGlass: null });

function visit(overrides: Partial<VisitRow> = {}): VisitRow {
  return {
    id: 'v1',
    patientId: 'p1',
    doctorId: 'd1',
    serviceItemId: 's1',
    visitDate: new Date('2026-10-26T00:00:00Z'),
    tokenNumber: 7,
    status: 'waiting',
    quotedFeePaise: 50_000n,
    feeInvoiceId: 'i1',
    createdById: 'reception',
    createdAt: NOW,
    paidAt: NOW,
    calledAt: null,
    completedAt: null,
    cancelledAt: null,
    cancelReason: null,
    patient: { id: 'p1', uhid: 'DEMO-2026-000001', fullName: 'Test Patient', sex: 'female', dateOfBirth: null },
    doctor: { id: 'd1', fullName: 'Dr Test', userId: 'doctor', department: { name: 'General Medicine' } },
    feeInvoice: { number: 'DEMO/INV/2026-27/000001' },
    ...overrides,
  };
}

function setup(row: VisitRow | null) {
  const opd = {
    lockVisit: vi.fn().mockResolvedValue(row),
    findVisit: vi.fn().mockResolvedValue(row),
    findConsultation: vi.fn().mockResolvedValue(row === null ? null : { ...row, orders: [], complaints: null, findings: null, diagnosis: null, advice: null, followUpDate: null, admissionAdvised: false, notesUpdatedAt: null }),
    updateVisit: vi.fn().mockResolvedValue(row),
    doctorForToken: vi.fn(),
    hasOpenVisit: vi.fn().mockResolvedValue(0),
  };
  const billing = { findPatient: vi.fn().mockResolvedValue({ id: 'p1' }), userNames: vi.fn().mockResolvedValue(new Map()) };
  const payments = { findOpenShift: vi.fn().mockResolvedValue(null), lockShift: vi.fn() };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const transactions = { run: vi.fn((work: (tx: unknown) => Promise<unknown>) => work({})) };
  const service = new OpdService(
    opd as unknown as OpdRepository,
    billing as unknown as BillingRepository,
    payments as unknown as PaymentsRepository,
    {} as NumberingService,
    audit as unknown as AuditService,
    transactions as unknown as TransactionRunner,
  );
  return { service, opd };
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

describe('OpdService', () => {
  it('lets only the visit doctor call in, and only a paid, waiting visit', async () => {
    expect(await errorCode(setup(visit()).service.call(user('someone-else'), 'v1', META, NOW))).toBe('NOT_FOUND');
    expect(await errorCode(setup(visit({ status: 'awaiting_payment', feeInvoiceId: null, paidAt: null })).service.call(user('doctor'), 'v1', META, NOW))).toBe('VISIT_STATE');
    const { service, opd } = setup(visit());
    await service.call(user('doctor'), 'v1', META, NOW);
    expect(opd.updateVisit).toHaveBeenCalledWith('v1', { status: 'with_doctor', calledAt: NOW }, {});
  });

  it('saves notes and completes only while the patient is with the doctor', async () => {
    const notes = { complaints: 'Cough', findings: '', diagnosis: null, advice: null, followUpDate: null, admissionAdvised: false };
    expect(await errorCode(setup(visit()).service.saveNotes(user('doctor'), 'v1', notes, META, NOW))).toBe('VISIT_STATE');
    expect(await errorCode(setup(visit({ status: 'completed', calledAt: NOW, completedAt: NOW })).service.complete(user('doctor'), 'v1', META, NOW))).toBe('VISIT_STATE');
    const { service, opd } = setup(visit({ status: 'with_doctor', calledAt: NOW }));
    await service.saveNotes(user('doctor'), 'v1', notes, META, NOW);
    // An empty note is stored as nothing.
    expect(opd.updateVisit).toHaveBeenCalledWith('v1', expect.objectContaining({ complaints: 'Cough', findings: null }), {});
  });

  it('takes the fee only into the cashier open shift, and cancels only an unpaid token', async () => {
    expect(await errorCode(setup(visit({ status: 'awaiting_payment', feeInvoiceId: null, paidAt: null })).service.payFee(user('cashier'), 'v1', { mode: 'cash' }, META, NOW))).toBe('SHIFT_REQUIRED');
    expect(await errorCode(setup(visit()).service.cancel(user('reception'), 'v1', { reason: 'Left' }, META, NOW))).toBe('VISIT_STATE');
  });
});
