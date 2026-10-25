import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import { NO_MONEY, type BillingRepository } from '../billing/billing.repository.js';
import type { BillingService } from '../billing/billing.service.js';
import { AppError } from '../common/errors/app-error.js';
import type { TransactionRunner } from '../common/prisma/transaction-runner.js';
import type { IpdChargesService } from '../ipd/ipd-charges.service.js';
import type { IpdRepository } from '../ipd/ipd.repository.js';
import { accountState, isSettled, onlyDueLeft } from './discharge-balance.js';
import type { DischargeRepository, DischargeRow } from './discharge.repository.js';
import { DischargeService } from './discharge.service.js';

const META = { requestId: 'r', ipAddress: null, userAgent: null };
function user(userId: string): AuthContext {
  return { sessionId: 's', userId, hospitalId: 'h1', kind: 'staff', permissions: new Set(), expiresAt: new Date(), userHospitalId: 'h1', breakGlass: null };
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

const settled = { unbilledCount: 0, unbilledPaise: 0n, bills: [], depositHeldPaise: 0n, missingRoomCharges: [] };

describe('accountState', () => {
  it('adds what is owed on each bill as due, and what was overpaid as refundable, without netting them', () => {
    const state = accountState({
      ...settled,
      bills: [
        { totalPaise: 100_000n, balance: { ...NO_MONEY, paid: 40_000n } },
        { totalPaise: 50_000n, balance: { ...NO_MONEY, paid: 60_000n } },
        { totalPaise: 30_000n, balance: { paid: 20_000n, credited: 10_000n, refunded: 0n } },
      ],
    });
    expect(state.duePaise).toBe(60_000n);
    expect(state.refundablePaise).toBe(10_000n);
  });
});

describe('isSettled', () => {
  it('needs everything at zero, or only the amount the MD approved still due', () => {
    expect(isSettled(accountState(settled), 0n)).toBe(true);
    const due = accountState({ ...settled, bills: [{ totalPaise: 100_000n, balance: NO_MONEY }] });
    expect(isSettled(due, 0n)).toBe(false);
    expect(isSettled(due, 100_000n)).toBe(true);
    expect(isSettled(due, 99_900n)).toBe(false);
  });

  it('never clears with charges unbilled, a deposit held or a night not charged', () => {
    expect(isSettled(accountState({ ...settled, unbilledCount: 1, unbilledPaise: 500n }), 0n)).toBe(false);
    expect(isSettled(accountState({ ...settled, depositHeldPaise: 100n }), 0n)).toBe(false);
    expect(isSettled(accountState({ ...settled, missingRoomCharges: ['2026-10-26'] }), 0n)).toBe(false);
  });

  it('lets the MD be asked only when money due is all that is left', () => {
    const due = { ...settled, bills: [{ totalPaise: 100_000n, balance: NO_MONEY }] };
    expect(onlyDueLeft(accountState(due))).toBe(true);
    expect(onlyDueLeft(accountState({ ...due, depositHeldPaise: 5_000n }))).toBe(false);
    expect(onlyDueLeft(accountState(settled))).toBe(false);
  });
});

function dischargeRow(overrides: Partial<DischargeRow> = {}): DischargeRow {
  return {
    id: 'x1',
    admissionId: 'a1',
    fitAt: new Date(),
    fitById: 'doctor-user',
    fitNote: null,
    completedAt: null,
    completedById: null,
    admission: { doctor: { id: 'd1', fullName: 'Dr One' }, patientId: 'p1', admittedAt: new Date() } as DischargeRow['admission'],
    clearances: [],
    summary: null,
    approvalRequests: [],
    ...overrides,
  };
}

function setup(row: DischargeRow, doctorOfUser: { id: string } | null) {
  const discharges = {
    lock: vi.fn().mockResolvedValue(row),
    find: vi.fn().mockResolvedValue(row),
    doctorOfUser: vi.fn().mockResolvedValue(doctorOfUser),
    saveSummary: vi.fn(),
    signSummary: vi.fn(),
  };
  const ipd = { findAdmission: vi.fn().mockResolvedValue({ id: 'a1', status: 'admitted', doctor: { id: 'd1' } }) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const transactions = { run: vi.fn((work: (tx: unknown) => Promise<unknown>) => work({})) };
  const service = new DischargeService(
    discharges as unknown as DischargeRepository,
    ipd as unknown as IpdRepository,
    {} as IpdChargesService,
    {} as BillingRepository,
    {} as BillingService,
    audit as unknown as AuditService,
    transactions as unknown as TransactionRunner,
  );
  return { service, discharges };
}

const SUMMARY = { diagnosis: 'Pneumonia', courseInHospital: 'IV antibiotics for five days', conditionAtDischarge: 'Stable', medications: null, advice: null, followUpDate: null };

describe('DischargeService', () => {
  it('lets only the treating doctor mark fit or write the summary', async () => {
    const other = setup(dischargeRow(), { id: 'd2' });
    expect(await errorCode(other.service.markFit(user('doctor-2'), { admissionId: 'a1' }, META))).toBe('NOT_TREATING_DOCTOR');
    expect(await errorCode(other.service.saveSummary(user('doctor-2'), 'x1', SUMMARY, META))).toBe('NOT_TREATING_DOCTOR');
    expect(other.discharges.saveSummary).not.toHaveBeenCalled();
    const unlinked = setup(dischargeRow(), null);
    expect(await errorCode(unlinked.service.markFit(user('nurse'), { admissionId: 'a1' }, META))).toBe('NOT_TREATING_DOCTOR');
  });

  it('never lets whoever wrote the summary sign it, and never changes it once signed', async () => {
    const drafted = dischargeRow({ summary: { draftedById: 'md-user', draftedAt: new Date(), signedById: null, signedAt: null } });
    const own = setup(drafted, { id: 'd1' });
    expect(await errorCode(own.service.signSummary(user('md-user'), 'x1', META))).toBe('SELF_APPROVAL_NOT_ALLOWED');
    expect(own.discharges.signSummary).not.toHaveBeenCalled();

    const signed = dischargeRow({ summary: { draftedById: 'doctor-user', draftedAt: new Date(), signedById: 'md-user', signedAt: new Date() } });
    expect(await errorCode(setup(signed, { id: 'd1' }).service.saveSummary(user('doctor-user'), 'x1', SUMMARY, META))).toBe('DISCHARGE_STEP');
    expect(await errorCode(setup(signed, { id: 'd1' }).service.signSummary(user('md-2'), 'x1', META))).toBe('DISCHARGE_STEP');
  });

  it('refuses every step once the patient has left', async () => {
    const done = setup(dischargeRow({ completedAt: new Date(), completedById: 'nurse' }), { id: 'd1' });
    expect(await errorCode(done.service.clear(user('clerk'), 'x1', META))).toBe('DISCHARGE_STEP');
    expect(await errorCode(done.service.complete(user('nurse'), 'x1', META))).toBe('DISCHARGE_STEP');
    expect(await errorCode(done.service.prepareFinalBill(user('clerk'), 'x1', META))).toBe('DISCHARGE_STEP');
  });
});
