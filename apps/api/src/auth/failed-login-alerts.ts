import { Inject, Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AuditService } from '../audit/audit.service.js';
import { ENV, type Env } from '../common/config/env.js';
import { TransactionRunner } from '../common/prisma/transaction-runner.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SecurityAlertsRepository } from './security-alerts.repository.js';

/**
 * CLAUDE.md section 9: an alert when there are more than ALERT_FAILED_LOGINS_THRESHOLD (20) failed
 * sign-ins in ALERT_FAILED_LOGINS_WINDOW_MINUTES (10), counted on the whole platform and per
 * hospital. At most one alert per scope and window. The alert is an error-level log line with
 * `alert: "auth.failed-logins"` (for log monitoring and, later, Sentry), an audit event, and a
 * notification to the super admins or to the hospital's admins.
 */
@Injectable()
export class FailedLoginAlerts {
  constructor(
    private readonly repository: SecurityAlertsRepository,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
    @Inject(ENV) private readonly env: Env,
    @InjectPinoLogger(FailedLoginAlerts.name) private readonly logger: PinoLogger,
  ) {}

  /** Called after every failed sign-in. Never throws: an alerting problem must not change the sign-in answer. */
  async afterFailure(hospitalId: string | null, now: Date = new Date()): Promise<void> {
    try {
      await this.check(null, now);
      if (hospitalId !== null) await this.check(hospitalId, now);
    } catch (error) {
      this.logger.error({ err: error }, 'Could not check failed sign-ins for an alert');
    }
  }

  private async check(hospitalId: string | null, now: Date): Promise<void> {
    const windowMinutes = this.env.ALERT_FAILED_LOGINS_WINDOW_MINUTES;
    const since = new Date(now.getTime() - windowMinutes * 60_000);
    const failures = await this.repository.countFailedLogins(since, hospitalId);
    if (failures <= this.env.ALERT_FAILED_LOGINS_THRESHOLD) return;

    const raised = await this.transactions.run(async (tx) => {
      await this.repository.lock(hospitalId ?? 'platform', tx);
      if (await this.repository.raisedSince(hospitalId, since, tx)) return false;
      await this.repository.record(hospitalId, failures, now, tx);
      await this.audit.record(
        { action: 'security.failed-logins.alerted', hospitalId, actorUserId: null, details: { failures, windowMinutes } },
        tx,
      );
      // Super admins hear about the platform; each hospital's admins hear about their hospital.
      await this.notifications.notifyHolders(
        hospitalId,
        hospitalId === null ? 'platform.hospital.manage' : 'users.user.manage',
        'failed_logins',
        { failures, windowMinutes, scope: hospitalId === null ? 'platform' : 'hospital' },
        now,
        tx,
      );
      return true;
    });
    if (raised) {
      this.logger.error(
        { alert: 'auth.failed-logins', hospitalId, failures, windowMinutes },
        `More than ${this.env.ALERT_FAILED_LOGINS_THRESHOLD} failed sign-ins in ${windowMinutes} minutes`,
      );
    }
  }
}
