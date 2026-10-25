import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import type { BillingRepository } from '../billing/billing.repository.js';
import { AppError } from '../common/errors/app-error.js';
import type { TransactionRunner } from '../common/prisma/transaction-runner.js';
import type { NumberingService } from '../numbering/numbering.service.js';
import type { BedPlaceRow, IpdRepository } from './ipd.repository.js';
import { IpdService } from './ipd.service.js';

const META = { requestId: 'r', ipAddress: null, userAgent: null };
const AUTH: AuthContext = { sessionId: 's', userId: 'u1', hospitalId: 'h1', kind: 'staff', permissions: new Set(), expiresAt: new Date() };

function bed(overrides: Partial<BedPlaceRow> = {}): BedPlaceRow {
  return {
    id: 'b1',
    code: 'B1',
    status: 'free',
    isActive: true,
    ward: { name: 'General', isActive: true, roomCategory: { id: 'rc1', name: 'General', minimumAdvancePaise: 500_000n } },
    ...overrides,
  };
}

function setup(row: BedPlaceRow | null) {
  const ipd = {
    lockBed: vi.fn().mockResolvedValue(row),
    setBedStatus: vi.fn().mockResolvedValue(row),
    openAdmissionCount: vi.fn().mockResolvedValue(0),
    activeDoctor: vi.fn().mockResolvedValue({ id: 'd1' }),
  };
  const billing = { findPatient: vi.fn().mockResolvedValue({ id: 'p1' }) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const transactions = { run: vi.fn((work: (tx: unknown) => Promise<unknown>) => work({})) };
  const service = new IpdService(
    ipd as unknown as IpdRepository,
    billing as unknown as BillingRepository,
    {} as NumberingService,
    audit as unknown as AuditService,
    transactions as unknown as TransactionRunner,
  );
  return { service, ipd };
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

describe('IpdService', () => {
  const admit = { patientId: 'p1', doctorId: 'd1', bedId: 'b1' };

  it('admits only into a free, active bed in a ward with a room category', async () => {
    expect(await errorCode(setup(bed({ status: 'cleaning' })).service.admit(AUTH, admit, META))).toBe('BED_TAKEN');
    expect(await errorCode(setup(bed({ isActive: false })).service.admit(AUTH, admit, META))).toBe('BED_TAKEN');
    expect(await errorCode(setup(bed({ ward: { name: 'Day care', isActive: true, roomCategory: null } })).service.admit(AUTH, admit, META))).toBe('REFERENCE_INVALID');
    expect(await errorCode(setup(null).service.admit(AUTH, admit, META))).toBe('NOT_FOUND');
  });

  it('never sets an occupied bed by hand', async () => {
    const { service, ipd } = setup(bed({ status: 'occupied' }));
    expect(await errorCode(service.setBedStatus(AUTH, 'b1', { status: 'free' }, META))).toBe('BED_OCCUPIED');
    expect(ipd.setBedStatus).not.toHaveBeenCalled();
  });
});
