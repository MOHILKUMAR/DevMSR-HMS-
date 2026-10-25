import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service.js';
import { AppError } from '../common/errors/app-error.js';
import type { TransactionRunner } from '../common/prisma/transaction-runner.js';
import type { AuthRepository, LoginCandidate } from './auth.repository.js';
import { AuthService, LOCKOUT_MS, MAX_FAILED_LOGINS } from './auth.service.js';
import type { CsrfService } from './csrf.service.js';
import { hashPassword } from './password.js';
import type { SessionsService } from './sessions.service.js';
import type { TwoFactorRepository } from './two-factor.repository.js';
import type { TwoFactorService } from './two-factor.service.js';

const NOW = new Date('2026-10-25T10:00:00.000Z');
const META = { requestId: 'r1', ipAddress: '10.0.0.5', userAgent: 'test' };
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hashPassword('right-password', { memoryCost: 1024, timeCost: 1, parallelism: 1 });
});

function candidate(overrides: Partial<LoginCandidate> = {}): LoginCandidate {
  return {
    id: 'u1',
    hospitalId: 'h1',
    kind: 'staff',
    username: 'reception1',
    displayName: 'Reception One',
    passwordHash,
    passwordChangedAt: new Date(NOW.getTime() - 86_400_000),
    mustChangePassword: false,
    totpSecretEncrypted: null,
    totpEnabledAt: null,
    totpLastTimeStep: null,
    lockedUntil: null,
    isActive: true,
    hospital: { id: 'h1', code: 'DEMO', name: 'Demo', isActive: true },
    ...overrides,
  };
}

function setup(user: LoginCandidate | null, failure = { locked: false }) {
  const repository = {
    findLoginCandidate: vi.fn().mockResolvedValue(user),
    recordFailure: vi.fn().mockResolvedValue(failure),
    recordSuccess: vi.fn().mockResolvedValue(undefined),
    insertLoginEvent: vi.fn().mockResolvedValue(undefined),
    resetFailures: vi.fn().mockResolvedValue(undefined),
    createChallenge: vi.fn().mockResolvedValue(undefined),
    findProfile: vi.fn(),
  };
  const sessions = {
    start: vi.fn().mockResolvedValue({ token: 'session-token', id: 's1', expiresAt: new Date(NOW.getTime() + 1000) }),
    endByToken: vi.fn().mockResolvedValue(undefined),
    permissionCodes: vi.fn().mockResolvedValue(['auth.session.manage-own']),
  };
  const csrf = { issue: vi.fn().mockReturnValue('csrf-token') };
  const twoFactor = { pendingSecret: vi.fn().mockResolvedValue('sealed') };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const transactions = { run: vi.fn((work: (tx: unknown) => Promise<unknown>) => work({})) };
  const service = new AuthService(
    repository as unknown as AuthRepository,
    sessions as unknown as SessionsService,
    csrf as unknown as CsrfService,
    audit as unknown as AuditService,
    transactions as unknown as TransactionRunner,
    twoFactor as unknown as TwoFactorService,
    {} as TwoFactorRepository,
  );
  return { service, repository, sessions, audit, twoFactor };
}

async function loginError(promise: Promise<unknown>): Promise<AppError> {
  const error: unknown = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

describe('AuthService.login', () => {
  it('signs in with the right password and records it', async () => {
    const { service, repository, sessions, audit } = setup(candidate());
    const result = await service.login({ username: 'reception1', password: 'right-password' }, META, undefined, NOW);
    expect(result).toMatchObject({ kind: 'signed_in', sessionToken: 'session-token', response: { status: 'signed_in', csrfToken: 'csrf-token' } });
    expect(sessions.endByToken).not.toHaveBeenCalled();
    expect(repository.recordSuccess).toHaveBeenCalledWith('u1', NOW, {});
    expect(repository.insertLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'succeeded' }), {});
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.session.created', entityId: 's1' }), {});
  });

  it('ends the session the browser already had', async () => {
    const { service, sessions } = setup(candidate());
    await service.login({ username: 'reception1', password: 'right-password' }, META, 'old-token', NOW);
    expect(sessions.endByToken).toHaveBeenCalledWith('old-token', 'replaced', NOW, {});
  });

  it('rejects an unknown username with LOGIN_FAILED and records it', async () => {
    const { service, repository } = setup(null);
    const error = await loginError(service.login({ username: 'ghost', password: 'x' }, META, undefined, NOW));
    expect(error.code).toBe('LOGIN_FAILED');
    expect(repository.insertLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'unknown_user', userId: null }));
  });

  it('counts a wrong password toward the lockout', async () => {
    const { service, repository, audit } = setup(candidate());
    const error = await loginError(service.login({ username: 'reception1', password: 'wrong' }, META, undefined, NOW));
    expect(error.code).toBe('LOGIN_FAILED');
    expect(repository.recordFailure).toHaveBeenCalledWith('u1', NOW, MAX_FAILED_LOGINS, LOCKOUT_MS);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('audits the attempt that locks the account', async () => {
    const { service, audit } = setup(candidate(), { locked: true });
    await loginError(service.login({ username: 'reception1', password: 'wrong' }, META, undefined, NOW));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'auth.account.locked', entityId: 'u1' }));
  });

  it('refuses a locked account even with the right password, without counting it', async () => {
    const { service, repository, sessions } = setup(candidate({ lockedUntil: new Date(NOW.getTime() + 60_000) }));
    const error = await loginError(service.login({ username: 'reception1', password: 'right-password' }, META, undefined, NOW));
    expect(error.code).toBe('LOGIN_FAILED');
    expect(repository.recordFailure).not.toHaveBeenCalled();
    expect(sessions.start).not.toHaveBeenCalled();
    expect(repository.insertLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'locked' }));
  });

  it('refuses inactive users and users of an inactive hospital', async () => {
    for (const user of [candidate({ isActive: false }), candidate({ hospital: { id: 'h1', code: 'D', name: 'D', isActive: false } })]) {
      const { service, repository } = setup(user);
      await loginError(service.login({ username: 'reception1', password: 'right-password' }, META, undefined, NOW));
      expect(repository.insertLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'inactive' }));
    }
  });

  it('asks for a new password instead of starting a session when an admin set the password', async () => {
    const { service, repository, sessions } = setup(candidate({ mustChangePassword: true }));
    const result = await service.login({ username: 'reception1', password: 'right-password' }, META, 'old-token', NOW);
    expect(result).toMatchObject({ kind: 'challenge', response: { status: 'challenge', step: 'change_password' } });
    expect(result.kind === 'challenge' ? result.challengeToken : '').toMatch(/^[\w-]{40,}$/);
    expect(sessions.start).not.toHaveBeenCalled();
    expect(sessions.endByToken).toHaveBeenCalledWith('old-token', 'replaced', NOW, {});
    expect(repository.resetFailures).toHaveBeenCalledWith('u1', {});
    expect(repository.createChallenge).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', step: 'change_password', expiresAt: new Date(NOW.getTime() + 10 * 60_000) }),
      {},
    );
    expect(repository.insertLoginEvent).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'challenge_started' }), {});
  });

  it('never starts a challenge for a wrong password', async () => {
    const { service, repository } = setup(candidate({ mustChangePassword: true }));
    await loginError(service.login({ username: 'reception1', password: 'wrong' }, META, undefined, NOW));
    expect(repository.createChallenge).not.toHaveBeenCalled();
  });

  it('asks a user whose permissions need two-factor to set it up, keeping one pending secret', async () => {
    const { service, sessions, twoFactor } = setup(candidate());
    sessions.permissionCodes.mockResolvedValue(['auth.session.manage-own', 'users.user.manage']);
    const result = await service.login({ username: 'reception1', password: 'right-password' }, META, undefined, NOW);
    expect(result).toMatchObject({ kind: 'challenge', response: { step: 'totp_setup' } });
    expect(twoFactor.pendingSecret).toHaveBeenCalledWith({ userId: 'u1', hospitalId: 'h1' }, expect.objectContaining({ id: 'u1' }), {});
    expect(sessions.start).not.toHaveBeenCalled();
  });

  it('asks for a code when two-factor is on, whatever the permissions', async () => {
    const { service, twoFactor } = setup(candidate({ totpEnabledAt: new Date(NOW.getTime() - 1000), totpSecretEncrypted: 'sealed' }));
    const result = await service.login({ username: 'reception1', password: 'right-password' }, META, undefined, NOW);
    expect(result).toMatchObject({ kind: 'challenge', response: { step: 'totp_verify' } });
    expect(twoFactor.pendingSecret).not.toHaveBeenCalled();
  });

  it('asks for the new password before two-factor', async () => {
    const { service } = setup(candidate({ mustChangePassword: true, totpEnabledAt: new Date(NOW.getTime() - 1000) }));
    const result = await service.login({ username: 'reception1', password: 'right-password' }, META, undefined, NOW);
    expect(result).toMatchObject({ response: { step: 'change_password' } });
  });
});
