import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service.js';
import type { Env } from '../common/config/env.js';
import type { TransactionRunner } from '../common/prisma/transaction-runner.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import { FailedLoginAlerts } from './failed-login-alerts.js';
import type { SecurityAlertsRepository } from './security-alerts.repository.js';

const NOW = new Date('2026-10-25T10:00:00.000Z');

function setup(counts: { platform: number; hospital: number }, alreadyRaised = false) {
  const repository = {
    countFailedLogins: vi.fn((_since: Date, hospitalId: string | null) => Promise.resolve(hospitalId === null ? counts.platform : counts.hospital)),
    lock: vi.fn().mockResolvedValue(undefined),
    raisedSince: vi.fn().mockResolvedValue(alreadyRaised),
    record: vi.fn().mockResolvedValue(undefined),
  };
  const notifications = { notifyHolders: vi.fn().mockResolvedValue(1) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const logger = { error: vi.fn() };
  const alerts = new FailedLoginAlerts(
    repository as unknown as SecurityAlertsRepository,
    notifications as unknown as NotificationsService,
    audit as unknown as AuditService,
    { run: vi.fn((work: (tx: unknown) => Promise<unknown>) => work({})) } as unknown as TransactionRunner,
    { ALERT_FAILED_LOGINS_THRESHOLD: 20, ALERT_FAILED_LOGINS_WINDOW_MINUTES: 10 } as Env,
    logger as unknown as PinoLogger,
  );
  return { alerts, repository, notifications, audit, logger };
}

describe('FailedLoginAlerts', () => {
  it('stays quiet at 20 failures: the rule is more than 20', async () => {
    const { alerts, repository, logger } = setup({ platform: 20, hospital: 20 });
    await alerts.afterFailure('h1', NOW);
    expect(repository.record).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
    expect(repository.countFailedLogins).toHaveBeenCalledWith(new Date(NOW.getTime() - 10 * 60_000), null);
  });

  it('alerts the super admins for the platform and the hospital admins for their hospital', async () => {
    const { alerts, repository, notifications, audit, logger } = setup({ platform: 30, hospital: 21 });
    await alerts.afterFailure('h1', NOW);
    expect(repository.record).toHaveBeenCalledWith(null, 30, NOW, {});
    expect(repository.record).toHaveBeenCalledWith('h1', 21, NOW, {});
    expect(notifications.notifyHolders).toHaveBeenCalledWith(null, 'platform.hospital.manage', 'failed_logins', expect.objectContaining({ scope: 'platform' }), NOW, {});
    expect(notifications.notifyHolders).toHaveBeenCalledWith('h1', 'users.user.manage', 'failed_logins', expect.objectContaining({ failures: 21 }), NOW, {});
    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ alert: 'auth.failed-logins', hospitalId: 'h1', failures: 21 }), expect.any(String));
  });

  it('checks only the platform for an unknown username', async () => {
    const { alerts, repository } = setup({ platform: 25, hospital: 25 });
    await alerts.afterFailure(null, NOW);
    expect(repository.countFailedLogins).toHaveBeenCalledTimes(1);
  });

  it('raises one alert per window', async () => {
    const { alerts, repository, notifications } = setup({ platform: 50, hospital: 50 }, true);
    await alerts.afterFailure('h1', NOW);
    expect(repository.record).not.toHaveBeenCalled();
    expect(notifications.notifyHolders).not.toHaveBeenCalled();
  });

  it('never makes a sign-in fail because the alert could not be checked', async () => {
    const { alerts, repository, logger } = setup({ platform: 0, hospital: 0 });
    repository.countFailedLogins.mockRejectedValueOnce(new Error('database down'));
    await expect(alerts.afterFailure('h1', NOW)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});
