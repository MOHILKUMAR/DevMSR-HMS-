import { Injectable } from '@nestjs/common';
import type { LoginRequest, LoginResponse, MeResponse } from '@devmsr/validation';
import { AuditService } from '../audit/audit.service.js';
import { Errors } from '../common/errors/app-error.js';
import type { RequestMeta } from '../common/http/app-request.js';
import { TransactionRunner } from '../common/prisma/transaction-runner.js';
import type { AuthContext } from './auth-context.js';
import { AuthRepository, type LoginEventInput } from './auth.repository.js';
import { CsrfService } from './csrf.service.js';
import { toMeResponse } from './dto/me-response.mapper.js';
import { dummyPasswordHash, verifyPassword } from './password.js';
import { SessionsService } from './sessions.service.js';

/** CLAUDE.md section 9: lock the account for 15 minutes after 5 failed attempts. */
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

export interface LoginResult {
  sessionToken: string;
  csrfToken: string;
  response: LoginResponse;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly sessions: SessionsService,
    private readonly csrf: CsrfService,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
  ) {}

  issueCsrfToken(sessionId: string | null): string {
    return this.csrf.issue(sessionId);
  }

  /**
   * Every failure returns the same LOGIN_FAILED error, so the response never reveals whether a
   * username exists, is locked or is inactive. Every attempt is recorded in login_events.
   */
  async login(input: LoginRequest, meta: RequestMeta, currentSessionToken?: string, now: Date = new Date()): Promise<LoginResult> {
    const user = await this.repository.findLoginCandidate(input.username);
    // One Argon2 verification on every path, so timing does not reveal whether the username exists.
    const passwordMatches = await verifyPassword(user?.passwordHash ?? (await dummyPasswordHash()), input.password);
    const event: Omit<LoginEventInput, 'outcome'> = {
      username: input.username,
      userId: user?.id ?? null,
      hospitalId: user?.hospitalId ?? null,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      createdAt: now,
    };

    if (user === null) {
      await this.repository.insertLoginEvent({ ...event, outcome: 'unknown_user' });
      throw Errors.loginFailed();
    }
    if (!user.isActive || user.hospital?.isActive === false) {
      await this.repository.insertLoginEvent({ ...event, outcome: 'inactive' });
      throw Errors.loginFailed();
    }
    if (user.lockedUntil !== null && user.lockedUntil > now) {
      await this.repository.insertLoginEvent({ ...event, outcome: 'locked' });
      throw Errors.loginFailed();
    }
    if (!passwordMatches) {
      const { locked } = await this.repository.recordFailure(user.id, now, MAX_FAILED_LOGINS, LOCKOUT_MS);
      await this.repository.insertLoginEvent({ ...event, outcome: 'wrong_password' });
      if (locked) {
        await this.audit.record({
          action: 'auth.account.locked',
          hospitalId: user.hospitalId,
          actorUserId: null,
          entityType: 'user',
          entityId: user.id,
          meta,
        });
      }
      throw Errors.loginFailed();
    }

    const session = await this.transactions.run(async (tx) => {
      // A new session ID at every login: any session the browser already had is ended.
      if (currentSessionToken !== undefined) {
        await this.sessions.endByToken(currentSessionToken, 'replaced', now, tx);
      }
      const started = await this.sessions.start(user, meta, now, tx);
      await this.repository.recordSuccess(user.id, now, tx);
      await this.repository.insertLoginEvent({ ...event, outcome: 'succeeded' }, tx);
      await this.audit.record(
        {
          action: 'auth.session.created',
          hospitalId: user.hospitalId,
          actorUserId: user.id,
          entityType: 'session',
          entityId: started.id,
          meta,
        },
        tx,
      );
      return started;
    });

    const permissions = await this.sessions.permissionCodes(user.id, user.hospitalId);
    const csrfToken = this.csrf.issue(session.id);
    return {
      sessionToken: session.token,
      csrfToken,
      response: { ...toMeResponse(user, permissions, session.expiresAt), csrfToken },
    };
  }

  async logout(auth: AuthContext, meta: RequestMeta, now: Date = new Date()): Promise<void> {
    await this.transactions.run(async (tx) => {
      await this.sessions.end(auth.sessionId, 'logout', now, tx);
      await this.audit.record(
        {
          action: 'auth.session.ended',
          hospitalId: auth.hospitalId,
          actorUserId: auth.userId,
          entityType: 'session',
          entityId: auth.sessionId,
          meta,
          details: { reason: 'logout' },
        },
        tx,
      );
    });
  }

  async me(auth: AuthContext): Promise<MeResponse> {
    const profile = await this.repository.findProfile(auth.userId, auth.hospitalId);
    if (profile === null) {
      throw Errors.unauthenticated();
    }
    return toMeResponse(profile, [...auth.permissions], auth.expiresAt);
  }
}
