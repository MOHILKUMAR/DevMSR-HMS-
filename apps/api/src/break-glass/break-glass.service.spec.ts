import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import { AppError } from '../common/errors/app-error.js';
import type { TransactionRunner } from '../common/prisma/transaction-runner.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import type { BreakGlassRepository } from './break-glass.repository.js';
import { BREAK_GLASS_DURATION_MS, BreakGlassService } from './break-glass.service.js';

const NOW = new Date('2026-10-25T10:00:00.000Z');
const SUPER_ADMIN: AuthContext = {
  sessionId: 's1',
  userId: 'u1',
  hospitalId: null,
  userHospitalId: null,
  kind: 'platform',
  permissions: new Set(['platform.break-glass.use']),
  expiresAt: NOW,
  breakGlass: null,
};
const META = { requestId: 'r1', ipAddress: null, userAgent: null };
const REASON = 'Hospital asked for help with a bill that does not total.';

function setup() {
  const grants = {
    isActiveHospital: vi.fn().mockResolvedValue(true),
    create: vi.fn((data: { expiresAt: Date; createdAt: Date; reason: string }) =>
      Promise.resolve({
        id: 'g1',
        reason: data.reason,
        createdAt: data.createdAt,
        expiresAt: data.expiresAt,
        endedAt: null,
        hospital: { id: 'h1', code: 'DEMO', name: 'Demo' },
        user: { id: 'u1', username: 'superadmin', displayName: 'Super Admin' },
      }),
    ),
  };
  const notifications = { notifyHolders: vi.fn().mockResolvedValue(2) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const service = new BreakGlassService(
    grants as unknown as BreakGlassRepository,
    notifications as unknown as NotificationsService,
    audit as unknown as AuditService,
    { run: vi.fn((work: (tx: unknown) => Promise<unknown>) => work({})) } as unknown as TransactionRunner,
  );
  return { service, grants, notifications, audit };
}

describe('BreakGlassService.start', () => {
  it('opens the hospital for exactly one hour, audits it there and notifies its admins', async () => {
    const { service, grants, notifications, audit } = setup();
    const grant = await service.start(SUPER_ADMIN, { hospitalId: 'h1', reason: REASON }, META, NOW);
    expect(grants.create).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 's1', hospitalId: 'h1', expiresAt: new Date(NOW.getTime() + BREAK_GLASS_DURATION_MS) }),
      {},
    );
    expect(BREAK_GLASS_DURATION_MS).toBe(60 * 60 * 1000);
    expect(grant.active).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'platform.break-glass.started', hospitalId: 'h1' }), {});
    expect(notifications.notifyHolders).toHaveBeenCalledWith('h1', 'users.user.manage', 'break_glass_started', expect.objectContaining({ grantId: 'g1' }), NOW, {});
  });

  it('refuses a second grant in the same session', async () => {
    const { service } = setup();
    const open = { ...SUPER_ADMIN, breakGlass: { grantId: 'g0', hospitalId: 'h1', expiresAt: NOW } };
    const error: unknown = await service.start(open, { hospitalId: 'h1', reason: REASON }, META, NOW).catch((e: unknown) => e);
    expect((error as AppError).code).toBe('BREAK_GLASS_ACTIVE');
  });

  it('refuses an inactive or unknown hospital with 404', async () => {
    const { service, grants } = setup();
    grants.isActiveHospital.mockResolvedValue(false);
    const error: unknown = await service.start(SUPER_ADMIN, { hospitalId: 'h9', reason: REASON }, META, NOW).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).status).toBe(404);
  });
});
