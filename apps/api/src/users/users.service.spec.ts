import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import type { SessionsService } from '../auth/sessions.service.js';
import type { TwoFactorRepository } from '../auth/two-factor.repository.js';
import { AppError } from '../common/errors/app-error.js';
import type { TransactionRunner } from '../common/prisma/transaction-runner.js';
import type { StaffUserRow, UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';

const META = { requestId: 'r', ipAddress: null, userAgent: null };
const ADMIN: AuthContext = { sessionId: 's', userId: 'admin-1', hospitalId: 'h1', kind: 'staff', permissions: new Set(), expiresAt: new Date(), userHospitalId: 'h1', breakGlass: null };

const ROW: StaffUserRow = {
  id: 'u1',
  username: 'nurse1',
  displayName: 'Nurse One',
  isActive: true,
  lockedUntil: null,
  mustChangePassword: true,
  totpEnabledAt: null,
  lastLoginAt: null,
  createdAt: new Date('2026-10-25T00:00:00Z'),
  userRoles: [{ role: { code: 'nurse', name: 'Nurse' } }],
};

function setup(rolesFound: { id: string; code: string }[] = [{ id: 'r1', code: 'nurse' }]) {
  const repo = {
    findById: vi.fn().mockResolvedValue(ROW),
    rolesByCodes: vi.fn().mockResolvedValue(rolesFound),
    update: vi.fn().mockResolvedValue(undefined),
    replaceRoles: vi.fn().mockResolvedValue(undefined),
    setPassword: vi.fn().mockResolvedValue(undefined),
  };
  const sessions = { endAllForUser: vi.fn().mockResolvedValue(undefined) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const transactions = { run: vi.fn((work: (tx: unknown) => Promise<unknown>) => work({})) };
  const service = new UsersService(
    repo as unknown as UsersRepository,
    sessions as unknown as SessionsService,
    {} as TwoFactorRepository,
    audit as unknown as AuditService,
    transactions as unknown as TransactionRunner,
  );
  return { service, repo, sessions };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error: unknown = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppError);
  return (error as AppError).code;
}

describe('UsersService', () => {
  it('refuses an admin changing their own roles or status, but allows a rename', async () => {
    const { service } = setup();
    expect(await codeOf(service.update(ADMIN, 'admin-1', { roleCodes: ['md'] }, META))).toBe('SELF_CHANGE_NOT_ALLOWED');
    expect(await codeOf(service.update(ADMIN, 'admin-1', { isActive: false }, META))).toBe('SELF_CHANGE_NOT_ALLOWED');
    await expect(service.update(ADMIN, 'admin-1', { displayName: 'New Name' }, META)).resolves.toBeDefined();
  });

  it('refuses an admin setting their own password here', async () => {
    const { service } = setup();
    expect(await codeOf(service.setPassword(ADMIN, 'admin-1', { password: 'long-enough-1' }, META))).toBe('SELF_CHANGE_NOT_ALLOWED');
  });

  it('refuses role codes that are not roles of this hospital', async () => {
    const { service } = setup([]);
    expect(await codeOf(service.update(ADMIN, 'u1', { roleCodes: ['super_admin'] }, META))).toBe('ROLE_NOT_ASSIGNABLE');
  });

  it('ends every session of a deactivated user, in the same transaction', async () => {
    const { service, sessions } = setup();
    await service.update(ADMIN, 'u1', { isActive: false }, META);
    expect(sessions.endAllForUser).toHaveBeenCalledWith('u1', 'user_inactive', expect.any(Date), {});
  });

  it('a new password also ends every session of that user', async () => {
    const { service, sessions, repo } = setup();
    await service.setPassword(ADMIN, 'u1', { password: 'long-enough-1' }, META);
    expect(repo.setPassword).toHaveBeenCalled();
    expect(sessions.endAllForUser).toHaveBeenCalledWith('u1', 'credentials_changed', expect.any(Date), {});
  });

  it('reports a missing user as 404', async () => {
    const { service, repo } = setup();
    repo.findById.mockResolvedValue(null);
    expect(await codeOf(service.update(ADMIN, 'u9', { displayName: 'X Y' }, META))).toBe('NOT_FOUND');
  });

  it('refuses platform users, who have no hospital', async () => {
    const { service } = setup();
    expect(await codeOf(service.update({ ...ADMIN, hospitalId: null }, 'u1', { displayName: 'X Y' }, META))).toBe('PERMISSION_DENIED');
  });
});
