import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import { AppError } from '../common/errors/app-error.js';
import type { TransactionRunner } from '../common/prisma/transaction-runner.js';
import type { SettingsRepository } from './settings.repository.js';
import { SettingsService } from './settings.service.js';

const META = { requestId: 'r', ipAddress: null, userAgent: null };
const ADMIN: AuthContext = { sessionId: 's', userId: 'a1', hospitalId: 'h1', kind: 'staff', permissions: new Set(), expiresAt: new Date() };
const DEPARTMENT = { id: 'd1', code: 'GENMED', name: 'General Medicine', isActive: true };

function setup() {
  const repo = {
    findDepartment: vi.fn().mockResolvedValue(DEPARTMENT),
    isDoctorLogin: vi.fn().mockResolvedValue(true),
    createDoctor: vi.fn().mockResolvedValue({
      id: 'doc1',
      fullName: 'Dr A',
      qualification: null,
      registrationNumber: null,
      departmentId: 'd1',
      userId: null,
      isVisiting: false,
      isActive: true,
      department: { name: 'General Medicine' },
      user: null,
    }),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const transactions = { run: vi.fn((work: (tx: unknown) => Promise<unknown>) => work({})) };
  const service = new SettingsService(repo as unknown as SettingsRepository, audit as unknown as AuditService, transactions as unknown as TransactionRunner);
  return { service, repo, audit };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error: unknown = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppError);
  return (error as AppError).code;
}

describe('SettingsService doctors', () => {
  it('adds a doctor and audits it', async () => {
    const { service, audit } = setup();
    const doctor = await service.createDoctor(ADMIN, { fullName: 'Dr A', departmentId: 'd1' }, META);
    expect(doctor).toMatchObject({ fullName: 'Dr A', departmentName: 'General Medicine', isVisiting: false });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'masters.doctor.created', entityId: 'doc1' }), {});
  });

  it('refuses a retired or missing department', async () => {
    const { service, repo } = setup();
    repo.findDepartment.mockResolvedValue({ ...DEPARTMENT, isActive: false });
    expect(await codeOf(service.createDoctor(ADMIN, { fullName: 'Dr A', departmentId: 'd1' }, META))).toBe('REFERENCE_INVALID');
    repo.findDepartment.mockResolvedValue(null);
    expect(await codeOf(service.createDoctor(ADMIN, { fullName: 'Dr A', departmentId: 'd9' }, META))).toBe('REFERENCE_INVALID');
  });

  it('refuses a login that is not a doctor login of this hospital', async () => {
    const { service, repo } = setup();
    repo.isDoctorLogin.mockResolvedValue(false);
    expect(await codeOf(service.createDoctor(ADMIN, { fullName: 'Dr A', departmentId: 'd1', userId: 'u1' }, META))).toBe('DOCTOR_LOGIN_INVALID');
    expect(repo.createDoctor).not.toHaveBeenCalled();
  });
});
