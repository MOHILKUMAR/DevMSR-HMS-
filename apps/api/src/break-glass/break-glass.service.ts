import { Injectable } from '@nestjs/common';
import type { Paginated } from '@devmsr/types';
import type { BreakGlassGrant, ListQuery, StartBreakGlass } from '@devmsr/validation';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import { Errors } from '../common/errors/app-error.js';
import type { RequestMeta } from '../common/http/app-request.js';
import { hospitalOf } from '../common/http/hospital-scope.js';
import { paged } from '../common/http/pagination.js';
import { TransactionRunner } from '../common/prisma/transaction-runner.js';
import { Prisma } from '../generated/prisma/client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { BreakGlassRepository, type GrantRow } from './break-glass.repository.js';

/** CLAUDE.md section 8: break-glass access expires after 1 hour. */
export const BREAK_GLASS_DURATION_MS = 60 * 60 * 1000;

function toGrant(row: GrantRow, now: Date): BreakGlassGrant {
  return {
    id: row.id,
    hospital: row.hospital,
    user: row.user,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    active: row.endedAt === null && row.expiresAt > now,
  };
}

/**
 * A DevMSR super admin's read-only look into one hospital: a written reason, one session, one hour,
 * audited, and the hospital's admins notified. What it allows is BREAK_GLASS_PERMISSIONS.
 */
@Injectable()
export class BreakGlassService {
  constructor(
    private readonly grants: BreakGlassRepository,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
  ) {}

  async hospitals(): Promise<{ data: { id: string; code: string; name: string }[] }> {
    return { data: await this.grants.activeHospitals() };
  }

  async start(auth: AuthContext, input: StartBreakGlass, meta: RequestMeta, now: Date = new Date()): Promise<BreakGlassGrant> {
    if (auth.breakGlass !== null) throw Errors.breakGlassActive();
    if (!(await this.grants.isActiveHospital(input.hospitalId))) throw Errors.notFound('hospital');
    try {
      return await this.transactions.run(async (tx) => {
        const row = await this.grants.create(
          {
            userId: auth.userId,
            sessionId: auth.sessionId,
            hospitalId: input.hospitalId,
            reason: input.reason,
            createdAt: now,
            expiresAt: new Date(now.getTime() + BREAK_GLASS_DURATION_MS),
          },
          tx,
        );
        // Recorded in the hospital's own audit log, where its admins look.
        await this.audit.record(
          {
            action: 'platform.break-glass.started',
            hospitalId: input.hospitalId,
            actorUserId: auth.userId,
            entityType: 'break_glass_grant',
            entityId: row.id,
            meta,
            details: { breakGlassId: row.id, expiresAt: row.expiresAt.toISOString() },
          },
          tx,
        );
        await this.notifications.notifyHolders(
          input.hospitalId,
          'users.user.manage',
          'break_glass_started',
          { grantId: row.id, byName: row.user.displayName, expiresAt: row.expiresAt.toISOString() },
          now,
          tx,
        );
        return toGrant(row, now);
      });
    } catch (error) {
      // Another request of the same session started one at the same moment.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw Errors.breakGlassActive();
      throw error;
    }
  }

  async end(auth: AuthContext, meta: RequestMeta, now: Date = new Date()): Promise<void> {
    const access = auth.breakGlass;
    if (access === null) throw Errors.notFound('break-glass access');
    await this.transactions.run(async (tx) => {
      if (!(await this.grants.endForSession(auth.sessionId, now, tx))) throw Errors.notFound('break-glass access');
      await this.audit.record(
        { action: 'platform.break-glass.ended', hospitalId: access.hospitalId, actorUserId: auth.userId, entityType: 'break_glass_grant', entityId: access.grantId, meta },
        tx,
      );
    });
  }

  /** The hospital's own break-glass history, with each reason, for its admins and the MD. */
  async history(auth: AuthContext, query: ListQuery, now: Date = new Date()): Promise<Paginated<BreakGlassGrant>> {
    const { rows, total } = await this.grants.listForHospital(hospitalOf(auth), query);
    return paged(
      rows.map((row) => toGrant(row, now)),
      total,
      query,
    );
  }
}
