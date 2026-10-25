import { Injectable } from '@nestjs/common';
import type { ChangeOwnPassword, EndOtherSessionsResponse, OwnSession } from '@devmsr/validation';
import { AuditService } from '../audit/audit.service.js';
import { Errors } from '../common/errors/app-error.js';
import type { RequestMeta } from '../common/http/app-request.js';
import { TransactionRunner } from '../common/prisma/transaction-runner.js';
import type { Tx } from '../common/prisma/tx.js';
import type { AuthContext } from './auth-context.js';
import { AuthRepository } from './auth.repository.js';
import { hashPassword, verifyPassword } from './password.js';
import { SESSION_IDLE_TIMEOUT_MS } from './sessions.service.js';
import { SessionsRepository } from './sessions.repository.js';

/** What a signed-in user can do with their own account: change the password, see and end sessions. */
@Injectable()
export class AccountService {
  constructor(
    private readonly auth: AuthRepository,
    private readonly sessions: SessionsRepository,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
  ) {}

  /** Needs the current password, so a session left open on a counter cannot be taken over. Other sessions end. */
  async changePassword(auth: AuthContext, input: ChangeOwnPassword, meta: RequestMeta, now: Date = new Date()): Promise<void> {
    const user = await this.auth.findCandidateById(auth.userId, auth.hospitalId);
    if (user === null) throw Errors.unauthenticated();
    if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
      await this.audit.record({
        action: 'auth.password.change-refused',
        hospitalId: auth.hospitalId,
        actorUserId: auth.userId,
        entityType: 'user',
        entityId: auth.userId,
        meta,
      });
      throw Errors.currentPasswordWrong();
    }
    if (input.newPassword === input.currentPassword) throw Errors.passwordReused();
    const passwordHash = await hashPassword(input.newPassword);

    await this.transactions.run(async (tx) => {
      await this.auth.setOwnPassword(auth.userId, auth.hospitalId, passwordHash, now, tx);
      const ended = await this.sessions.endOwn(this.owner(auth), { exceptId: auth.sessionId }, 'credentials_changed', now, tx);
      await this.audit.record(
        {
          action: 'auth.password.changed',
          hospitalId: auth.hospitalId,
          actorUserId: auth.userId,
          entityType: 'user',
          entityId: auth.userId,
          meta,
          details: { via: 'account', otherSessionsEnded: ended.length },
        },
        tx,
      );
    });
  }

  async listSessions(auth: AuthContext, now: Date = new Date()): Promise<{ data: OwnSession[] }> {
    const rows = await this.sessions.listOpen(this.owner(auth), now, new Date(now.getTime() - SESSION_IDLE_TIMEOUT_MS));
    return {
      data: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        current: row.id === auth.sessionId,
      })),
    };
  }

  /** Another user's session, or one that has already ended, is a 404 so its existence is not revealed. */
  async endSession(auth: AuthContext, sessionId: string, meta: RequestMeta, now: Date = new Date()): Promise<void> {
    if (sessionId === auth.sessionId) throw Errors.currentSession();
    await this.transactions.run(async (tx) => {
      const ended = await this.sessions.endOwn(this.owner(auth), { ids: [sessionId] }, 'ended_by_user', now, tx);
      if (ended.length === 0) throw Errors.notFound('session');
      await this.recordEnded(auth, ended, meta, tx);
    });
  }

  async endOtherSessions(auth: AuthContext, meta: RequestMeta, now: Date = new Date()): Promise<EndOtherSessionsResponse> {
    return this.transactions.run(async (tx) => {
      const ended = await this.sessions.endOwn(this.owner(auth), { exceptId: auth.sessionId }, 'ended_by_user', now, tx);
      await this.recordEnded(auth, ended, meta, tx);
      return { ended: ended.length };
    });
  }

  private owner(auth: AuthContext): { userId: string; hospitalId: string | null } {
    return { userId: auth.userId, hospitalId: auth.hospitalId };
  }

  private async recordEnded(auth: AuthContext, sessionIds: readonly string[], meta: RequestMeta, tx: Tx): Promise<void> {
    for (const id of sessionIds) {
      await this.audit.record(
        {
          action: 'auth.session.ended',
          hospitalId: auth.hospitalId,
          actorUserId: auth.userId,
          entityType: 'session',
          entityId: id,
          meta,
          details: { reason: 'ended_by_user' },
        },
        tx,
      );
    }
  }
}
