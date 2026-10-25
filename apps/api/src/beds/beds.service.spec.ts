import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import { AppError } from '../common/errors/app-error.js';
import type { TransactionRunner } from '../common/prisma/transaction-runner.js';
import type { BedsRepository, WardRow } from './beds.repository.js';
import { BedsService } from './beds.service.js';

const META = { requestId: 'r', ipAddress: null, userAgent: null };
const ADMIN: AuthContext = { sessionId: 's', userId: 'a1', hospitalId: 'h1', kind: 'staff', permissions: new Set(), expiresAt: new Date() };
const WARD: WardRow = {
  id: 'w1',
  code: 'ICU',
  name: 'ICU',
  roomCategoryId: null,
  isActive: true,
  roomCategory: null,
  _count: { beds: 0 },
};

function setup() {
  const repo = {
    findRoomCategory: vi.fn().mockResolvedValue({ id: 'rc1', code: 'ICU', name: 'ICU', isActive: true }),
    defaultBranchId: vi.fn().mockResolvedValue('b1'),
    createWard: vi.fn().mockResolvedValue(WARD),
    findWard: vi.fn().mockResolvedValue(WARD),
    createBed: vi.fn().mockResolvedValue({ id: 'bed1', wardId: 'w1', code: 'ICU-01', status: 'free', isActive: true }),
    findBed: vi.fn(),
    updateBed: vi.fn(),
    updateWard: vi.fn().mockResolvedValue(WARD),
    countOccupiedBeds: vi.fn().mockResolvedValue(0),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const transactions = { run: vi.fn((work: (tx: unknown) => Promise<unknown>) => work({})) };
  const service = new BedsService(repo as unknown as BedsRepository, audit as unknown as AuditService, transactions as unknown as TransactionRunner);
  return { service, repo };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error: unknown = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppError);
  return (error as AppError).code;
}

describe('BedsService', () => {
  it('puts a new ward in the hospital branch', async () => {
    const { service, repo } = setup();
    await service.createWard(ADMIN, { code: 'ICU', name: 'ICU', roomCategoryId: 'rc1' }, META);
    expect(repo.createWard).toHaveBeenCalledWith('h1', { branchId: 'b1', code: 'ICU', name: 'ICU', roomCategoryId: 'rc1' }, {});
  });

  it('refuses a retired room category', async () => {
    const { service, repo } = setup();
    repo.findRoomCategory.mockResolvedValue({ id: 'rc1', code: 'ICU', name: 'ICU', isActive: false });
    expect(await codeOf(service.createWard(ADMIN, { code: 'ICU', name: 'ICU', roomCategoryId: 'rc1' }, META))).toBe('REFERENCE_INVALID');
  });

  it('refuses a ward when the hospital has no branch', async () => {
    const { service, repo } = setup();
    repo.defaultBranchId.mockResolvedValue(null);
    expect(await codeOf(service.createWard(ADMIN, { code: 'ICU', name: 'ICU' }, META))).toBe('REFERENCE_INVALID');
  });

  it('refuses to retire an occupied bed', async () => {
    const { service, repo } = setup();
    repo.findBed.mockResolvedValue({ id: 'bed1', wardId: 'w1', code: 'ICU-01', status: 'occupied', isActive: true });
    repo.updateBed.mockResolvedValue(null);
    expect(await codeOf(service.updateBed(ADMIN, 'bed1', { isActive: false }, META))).toBe('BED_OCCUPIED');
  });

  it('refuses to retire a ward with a patient in it', async () => {
    const { service, repo } = setup();
    repo.countOccupiedBeds.mockResolvedValue(1);
    expect(await codeOf(service.updateWard(ADMIN, 'w1', { isActive: false }, META))).toBe('BED_OCCUPIED');
    expect(repo.updateWard).not.toHaveBeenCalled();
  });

  it('adds beds only to an active ward of this hospital', async () => {
    const { service, repo } = setup();
    repo.findWard.mockResolvedValue({ ...WARD, isActive: false });
    expect(await codeOf(service.createBed(ADMIN, 'w1', { code: 'ICU-02' }, META))).toBe('REFERENCE_INVALID');
    repo.findWard.mockResolvedValue(null);
    expect(await codeOf(service.createBed(ADMIN, 'w9', { code: 'ICU-02' }, META))).toBe('NOT_FOUND');
  });
});
