import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import { AppError } from '../common/errors/app-error.js';
import type { TransactionRunner } from '../common/prisma/transaction-runner.js';
import type { ServiceItemRow, TariffRateRow, TariffsRepository } from './tariffs.repository.js';
import { TariffsService } from './tariffs.service.js';

const META = { requestId: 'r', ipAddress: null, userAgent: null };
const FINANCE: AuthContext = { sessionId: 's', userId: 'f1', hospitalId: 'h1', kind: 'staff', permissions: new Set(), expiresAt: new Date() };
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

function rate(from: string, to: string | null = null): TariffRateRow {
  return {
    id: 'r1',
    ratePaise: 30_000n,
    taxRateBp: 0,
    effectiveFrom: new Date(`${from}T00:00:00Z`),
    effectiveTo: to === null ? null : new Date(`${to}T00:00:00Z`),
    createdAt: NOW,
  };
}

function setup(open: TariffRateRow | null) {
  const repo = {
    findServiceItem: vi.fn().mockResolvedValue(ITEM),
    lockServiceItem: vi.fn().mockResolvedValue(undefined),
    openRate: vi.fn().mockResolvedValue(open),
    closeRate: vi.fn().mockResolvedValue(undefined),
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
