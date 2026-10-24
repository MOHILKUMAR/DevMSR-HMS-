import { describe, expect, it, vi } from 'vitest';
import { sha256Hex } from '../common/crypto/tokens.js';
import type { ActiveSession, SessionsRepository } from './sessions.repository.js';
import { SESSION_IDLE_TIMEOUT_MS, SESSION_MAX_AGE_MS, SessionsService } from './sessions.service.js';

const NOW = new Date('2026-10-25T10:00:00.000Z');

function session(overrides: Partial<ActiveSession> = {}): ActiveSession {
  return {
    id: 's1',
    userId: 'u1',
    lastSeenAt: new Date(NOW.getTime() - 5 * 60 * 1000),
    expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
    user: { hospitalId: 'h1', kind: 'staff', isActive: true, hospital: { isActive: true } },
    ...overrides,
  };
}

function setup(found: ActiveSession | null) {
  const repo = {
    findActiveByTokenHash: vi.fn().mockResolvedValue(found),
    permissionCodes: vi.fn().mockResolvedValue(['auth.session.manage-own', 'patients.patient.read']),
    create: vi.fn().mockResolvedValue({ id: 's2', expiresAt: new Date(NOW.getTime() + SESSION_MAX_AGE_MS) }),
    touch: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
  };
  return { repo, service: new SessionsService(repo as unknown as SessionsRepository) };
}

describe('SessionsService.start', () => {
  it('stores only the token hash and sets a 12 hour expiry', async () => {
    const { repo, service } = setup(null);
    const started = await service.start({ id: 'u1', hospitalId: 'h1' }, { requestId: 'r', ipAddress: null, userAgent: null }, NOW);
    const data = repo.create.mock.calls[0]?.[0] as { tokenHash: string; expiresAt: Date };
    expect(data.tokenHash).toBe(sha256Hex(started.token));
    expect(data.tokenHash).not.toBe(started.token);
    expect(data.expiresAt.getTime() - NOW.getTime()).toBe(SESSION_MAX_AGE_MS);
  });
});

describe('SessionsService.check', () => {
  it('accepts an active session and loads permissions', async () => {
    const { service } = setup(session());
    const result = await service.check('token', NOW);
    expect(result.status).toBe('valid');
    if (result.status === 'valid') {
      expect(result.auth).toMatchObject({ sessionId: 's1', userId: 'u1', hospitalId: 'h1', kind: 'staff' });
      expect(result.auth.permissions.has('patients.patient.read')).toBe(true);
    }
  });

  it('rejects an unknown token', async () => {
    const { service } = setup(null);
    expect(await service.check('token', NOW)).toEqual({ status: 'invalid' });
  });

  it('ends a session idle for 15 minutes', async () => {
    const { repo, service } = setup(session({ lastSeenAt: new Date(NOW.getTime() - SESSION_IDLE_TIMEOUT_MS) }));
    expect(await service.check('token', NOW)).toEqual({ status: 'expired' });
    expect(repo.end).toHaveBeenCalledWith({ id: 's1' }, 'idle_timeout', NOW);
  });

  it('ends a session past its 12 hour maximum even if it was just used', async () => {
    const { repo, service } = setup(session({ lastSeenAt: NOW, expiresAt: NOW }));
    expect(await service.check('token', NOW)).toEqual({ status: 'expired' });
    expect(repo.end).toHaveBeenCalledWith({ id: 's1' }, 'max_age', NOW);
  });

  it('ends the session of a deactivated user or hospital', async () => {
    const inactiveUser = setup(session({ user: { hospitalId: 'h1', kind: 'staff', isActive: false, hospital: { isActive: true } } }));
    expect(await inactiveUser.service.check('token', NOW)).toEqual({ status: 'invalid' });
    expect(inactiveUser.repo.end).toHaveBeenCalledWith({ id: 's1' }, 'user_inactive', NOW);

    const inactiveHospital = setup(session({ user: { hospitalId: 'h1', kind: 'staff', isActive: true, hospital: { isActive: false } } }));
    expect(await inactiveHospital.service.check('token', NOW)).toEqual({ status: 'invalid' });
  });

  it('writes last_seen_at at most once a minute', async () => {
    const recent = setup(session({ lastSeenAt: new Date(NOW.getTime() - 30 * 1000) }));
    await recent.service.check('token', NOW);
    expect(recent.repo.touch).not.toHaveBeenCalled();

    const older = setup(session({ lastSeenAt: new Date(NOW.getTime() - 61 * 1000) }));
    await older.service.check('token', NOW);
    expect(older.repo.touch).toHaveBeenCalledWith('s1', NOW);
  });
});
