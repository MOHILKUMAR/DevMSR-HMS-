import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../auth/auth-context.js';
import { AppError } from '../common/errors/app-error.js';
import type { NotificationsRepository } from './notifications.repository.js';
import { NotificationsService } from './notifications.service.js';

const NOW = new Date('2026-10-25T10:00:00.000Z');
// A super admin during break-glass: requests reach hospital h2, but notifications stay their own.
const AUTH: AuthContext = {
  sessionId: 's',
  userId: 'u1',
  hospitalId: 'h2',
  userHospitalId: null,
  kind: 'platform',
  permissions: new Set(),
  expiresAt: NOW,
  breakGlass: { grantId: 'g1', hospitalId: 'h2', expiresAt: NOW },
};

function setup() {
  const repository = {
    list: vi.fn().mockResolvedValue({
      rows: [{ id: 'n1', kind: 'failed_logins', metadata: { failures: 21, nested: { no: 1 }, scope: 'platform' }, createdAt: NOW, readAt: null }],
      total: 1,
    }),
    markRead: vi.fn().mockResolvedValue(0),
    exists: vi.fn().mockResolvedValue(false),
  };
  return { service: new NotificationsService(repository as unknown as NotificationsRepository), repository };
}

describe('NotificationsService', () => {
  it("lists the user's own notifications, never by the hospital opened through break-glass", async () => {
    const { service, repository } = setup();
    const page = await service.list(AUTH, { page: 1, pageSize: 50 });
    expect(repository.list).toHaveBeenCalledWith({ userId: 'u1', hospitalId: null }, false, { page: 1, pageSize: 50 });
    // Only flat facts reach the screen.
    expect(page.data[0]?.details).toEqual({ failures: 21, scope: 'platform' });
  });

  it("answers 404 for a notification that is not the user's", async () => {
    const { service } = setup();
    const error: unknown = await service.markRead(AUTH, 'n9', NOW).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).status).toBe(404);
  });
});
