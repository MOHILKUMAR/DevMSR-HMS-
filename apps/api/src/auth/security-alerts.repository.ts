import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Tx } from '../common/prisma/tx.js';
import type { LoginOutcome } from '../generated/prisma/client.js';

const FAILED: LoginOutcome[] = ['wrong_password', 'unknown_user', 'locked', 'inactive', 'wrong_totp'];
export const FAILED_LOGINS_ALERT = 'failed_logins';

/** Counts of failed sign-ins and the alerts raised for them. */
@Injectable()
export class SecurityAlertsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Failed sign-ins since a time, on the whole platform (null) or for one hospital. */
  countFailedLogins(since: Date, hospitalId: string | null): Promise<number> {
    return this.prisma.loginEvent.count({
      where: { createdAt: { gte: since }, outcome: { in: FAILED }, ...(hospitalId === null ? {} : { hospitalId }) },
    });
  }

  /** Serialises alert decisions for one scope, so a burst raises one alert. */
  async lock(scope: string, tx: Tx): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`alert:${FAILED_LOGINS_ALERT}:${scope}`}))`;
  }

  async raisedSince(hospitalId: string | null, since: Date, tx: Tx): Promise<boolean> {
    return (await tx.securityAlert.count({ where: { kind: FAILED_LOGINS_ALERT, hospitalId, createdAt: { gte: since } } })) > 0;
  }

  async record(hospitalId: string | null, count: number, at: Date, tx: Tx): Promise<void> {
    await tx.securityAlert.create({ data: { kind: FAILED_LOGINS_ALERT, hospitalId, count, createdAt: at } });
  }
}
