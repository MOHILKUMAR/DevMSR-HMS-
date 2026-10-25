import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import { AppError } from '../common/errors/app-error.js';
import type { TransactionRunner } from '../common/prisma/transaction-runner.js';
import type { ServiceItemRow, TariffRateRow, TariffsRepository } from './tariffs.repository.js';
import { TariffsService } from './tariffs.service.js';

const META = { requestId: 'r', ipAddress: null, userAgent: null };
const FINANCE: AuthContext = { sessionId: 's', userId: 'f1', hospitalId: 'h1', kind: 'staff', permissions: new Set(), expiresAt: new Date(), userHospitalId: 'h1', breakGlass: null };
// 25 Oct 2026, 10:00 IST.
const NOW = new Date('2026-10-25T04:30:00Z');

const ITEM: ServiceItemRow = {
  id: 'i1',
  code: 'ECG',
  name: 'ECG',
  kind: 'investigation',
  doctorId: null,
  roomCategoryId: null,
  isActive: true,
  doctor: null,
  roomCategory: null,
  rates: [],
};

function rate(from: string, to: string | null = null, id = 'r1'): TariffRateRow {
  return {
    id,
    ratePaise: 30_000n,
    taxRateBp: 0,
    effectiveFrom: new Date(`${from}T00:00:00Z`),
    effectiveTo: to === null ? null : new Date(`${to}T00:00:00Z`),
    createdAt: NOW,
    cancelledAt: null,
    cancelReason: null,
  };
}

function setup(open: TariffRateRow | null) {
  const repo = {
    findServiceItem: vi.fn().mockResolvedValue(ITEM),
    lockServiceItem: vi.fn().mockResolvedValue(undefined),
    openRate: vi.fn().mockResolvedValue(open),
    closeRate: vi.fn().mockResolvedValue(undefined),
    findRate: vi.fn().mockResolvedValue(open),
    rateEndingOn: vi.fn().mockResolvedValue(null),
    cancelRate: vi.fn().mockImplementation((id: string, data: { cancelledAt: Date; cancelReason: string }) =>
      Promise.resolve({ ...rate('2026-12-01', null, id), cancelledAt: data.cancelledAt, cancelReason: data.cancelReason }),
    ),
    reopenRate: vi.fn().mockResolvedValue(undefined),
    insertRate: vi.fn().mockImplementation((data: { effectiveFrom: string; ratePaise: bigint }) =>
      Promise.resolve({ ...rate(data.effectiveFrom), ratePaise: data.ratePaise }),
    ),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const transactions = { run: vi.fn((work: (tx: unknown) => Promise<unknown>) => work({})) };
  const service = new TariffsService(repo as unknown as TariffsRepository, audit as unknown as AuditService, transactions as unknown as TransactionRunner);
  return { service, repo };
}

async function errorOf(promise: Promise<unknown>): Promise<AppError> {
  const error: unknown = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

describe('TariffsService.createRate', () => {
  it('starts the first rate of an item today', async () => {
    const { service, repo } = setup(null);
    const created = await service.createRate(FINANCE, 'i1', { ratePaise: 30_000, taxRateBp: 0, effectiveFrom: '2026-10-25' }, META, NOW);
    expect(created).toMatchObject({ ratePaise: 30_000, effectiveFrom: '2026-10-25', effectiveTo: null });
    expect(repo.closeRate).not.toHaveBeenCalled();
    expect(repo.lockServiceItem).toHaveBeenCalledWith('h1', 'i1', {});
  });

  it('closes the open rate the day before the new one starts, across a month end', async () => {
    const { service, repo } = setup(rate('2026-04-01'));
    await service.createRate(FINANCE, 'i1', { ratePaise: 35_000, taxRateBp: 0, effectiveFrom: '2026-11-01' }, META, NOW);
    expect(repo.closeRate).toHaveBeenCalledWith('r1', '2026-10-31', {});
  });

  it('refuses a start date in the past, judged in IST', async () => {
    const { service } = setup(null);
    const error = await errorOf(service.createRate(FINANCE, 'i1', { ratePaise: 1, taxRateBp: 0, effectiveFrom: '2026-10-24' }, META, NOW));
    expect(error.code).toBe('RATE_DATE_INVALID');
  });

  it('refuses a start on or before the latest rate, which would rewrite history', async () => {
    const { service, repo } = setup(rate('2026-12-01'));
    for (const effectiveFrom of ['2026-12-01', '2026-11-15']) {
      const error = await errorOf(service.createRate(FINANCE, 'i1', { ratePaise: 1, taxRateBp: 0, effectiveFrom }, META, NOW));
      expect(error.code).toBe('RATE_DATE_INVALID');
    }
    expect(repo.closeRate).not.toHaveBeenCalled();
  });

  it('refuses rates for a retired item', async () => {
    const { service, repo } = setup(null);
    repo.findServiceItem.mockResolvedValue({ ...ITEM, isActive: false });
    const error = await errorOf(service.createRate(FINANCE, 'i1', { ratePaise: 1, taxRateBp: 0, effectiveFrom: '2026-10-25' }, META, NOW));
    expect(error.code).toBe('REFERENCE_INVALID');
  });
});

describe('TariffsService.cancelRate', () => {
  const REASON = { reason: 'Entered the wrong amount' };

  it('cancels a rate that has not started, and the rate before it carries on', async () => {
    const { service, repo } = setup(rate('2026-12-01', null, 'r2'));
    repo.rateEndingOn.mockResolvedValue(rate('2026-04-01', '2026-11-30', 'r1'));
    const cancelled = await service.cancelRate(FINANCE, 'i1', 'r2', REASON, META, NOW);
    expect(cancelled).toMatchObject({ id: 'r2', cancelReason: 'Entered the wrong amount' });
    expect(repo.cancelRate).toHaveBeenCalledWith('r2', { cancelledAt: NOW, cancelledById: 'f1', cancelReason: 'Entered the wrong amount' }, {});
    expect(repo.rateEndingOn).toHaveBeenCalledWith('h1', 'i1', '2026-11-30', {});
    expect(repo.reopenRate).toHaveBeenCalledWith('r1', {});
    // The rate is cancelled before the earlier one reopens, or two rates would be open at once.
    expect(repo.cancelRate.mock.invocationCallOrder[0]).toBeLessThan(repo.reopenRate.mock.invocationCallOrder[0] ?? 0);
  });

  it('refuses a rate that has started, judged in IST', async () => {
    for (const from of ['2026-10-25', '2026-04-01']) {
      const { service, repo } = setup(rate(from));
      const error = await errorOf(service.cancelRate(FINANCE, 'i1', 'r1', REASON, META, NOW));
      expect(error.code).toBe('RATE_NOT_CANCELLABLE');
      expect(repo.cancelRate).not.toHaveBeenCalled();
    }
  });

  it('refuses a rate followed by a later one, and one already cancelled', async () => {
    const { service, repo } = setup(rate('2027-01-01', null, 'r3'));
    repo.findRate.mockResolvedValue(rate('2026-12-01', '2026-12-31', 'r2'));
    expect((await errorOf(service.cancelRate(FINANCE, 'i1', 'r2', REASON, META, NOW))).code).toBe('RATE_NOT_CANCELLABLE');
    repo.findRate.mockResolvedValue({ ...rate('2027-01-01', null, 'r3'), cancelledAt: NOW, cancelReason: 'Wrong' });
    expect((await errorOf(service.cancelRate(FINANCE, 'i1', 'r3', REASON, META, NOW))).code).toBe('RATE_NOT_CANCELLABLE');
    expect(repo.cancelRate).not.toHaveBeenCalled();
  });

  it('reports a rate of another item or hospital as 404', async () => {
    const { service, repo } = setup(null);
    repo.findRate.mockResolvedValue(null);
    expect((await errorOf(service.cancelRate(FINANCE, 'i1', 'r9', REASON, META, NOW))).code).toBe('NOT_FOUND');
  });
});
