import { Injectable } from '@nestjs/common';
import type { LoginPasswordChange, LoginRequest, LoginResponse, MeResponse } from '@devmsr/validation';
import type { LoginStep } from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { randomToken, sha256Hex } from '../common/crypto/tokens.js';
import { Errors } from '../common/errors/app-error.js';
import type { RequestMeta } from '../common/http/app-request.js';
import { TransactionRunner } from '../common/prisma/transaction-runner.js';
import type { Tx } from '../common/prisma/tx.js';
import type { AuthContext } from './auth-context.js';
import { LOGIN_CHALLENGE_TTL_MS } from './auth-cookies.js';
import { AuthRepository, type LoginCandidate, type LoginEventInput } from './auth.repository.js';
import { CsrfService } from './csrf.service.js';
import { toMeResponse } from './dto/me-response.mapper.js';
import { dummyPasswordHash, hashPassword, verifyPassword } from './password.js';
import { SessionsService } from './sessions.service.js';

/** CLAUDE.md section 9: lock the account for 15 minutes after 5 failed attempts. */
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

/** Either a session (cookie token and CSRF token) or a challenge whose token goes in its own cookie. */
export type LoginResult =
  | { kind: 'signed_in'; sessionToken: string; csrfToken: string; response: LoginResponse }
  | { kind: 'challenge'; challengeToken: string; response: LoginResponse };

/** The step a user still owes after a correct password, or null when a session can start. */
function nextStep(user: Pick<LoginCandidate, 'mustChangePassword'>): LoginStep | null {
  return user.mustChangePassword ? 'change_password' : null;
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
   * username exists, is locked or is inactive. Every attempt is recorded in login_events. A correct
   * password starts a session, or a challenge when the user still owes a step (a new password).
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

    const step = nextStep(user);
    if (step === null) {
      return this.startSession(user, meta, now, currentSessionToken);
    }
    const challengeToken = randomToken();
    const expiresAt = new Date(now.getTime() + LOGIN_CHALLENGE_TTL_MS);
    await this.transactions.run(async (tx) => {
      // Whatever session the browser had ends now, as at any login.
      if (currentSessionToken !== undefined) {
        await this.sessions.endByToken(currentSessionToken, 'replaced', now, tx);
      }
      await this.repository.resetFailures(user.id, tx);
      await this.repository.createChallenge(
        {
          tokenHash: sha256Hex(challengeToken),
          userId: user.id,
          hospitalId: user.hospitalId,
          step,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          createdAt: now,
          expiresAt,
        },
        tx,
      );
      await this.repository.insertLoginEvent({ ...event, outcome: 'challenge_started' }, tx);
    });
    return { kind: 'challenge', challengeToken, response: { status: 'challenge', step, expiresAt: expiresAt.toISOString() } };
  }

  /**
   * The `change_password` step. The new password must differ from the one the admin set. The
   * challenge is used once, and a challenge older than the account's last password change (an admin
   * set another one meanwhile) is refused.
   */
  async completePasswordChange(
    challengeToken: string | undefined,
    input: LoginPasswordChange,
    meta: RequestMeta,
    now: Date = new Date(),
  ): Promise<LoginResult> {
    const challenge = challengeToken === undefined ? null : await this.repository.findOpenChallenge(sha256Hex(challengeToken), 'change_password');
    const user = challenge?.user;
    if (
      challenge === null ||
      user === undefined ||
      challenge.expiresAt <= now ||
      challenge.createdAt < user.passwordChangedAt ||
      !user.isActive ||
      user.hospital?.isActive === false ||
      (user.lockedUntil !== null && user.lockedUntil > now)
    ) {
      throw Errors.loginChallengeInvalid();
    }
    if (await verifyPassword(user.passwordHash, input.newPassword)) {
      throw Errors.passwordReused();
    }
    const passwordHash = await hashPassword(input.newPassword);

    const changed = await this.transactions.run(async (tx) => {
      if (!(await this.repository.completeChallenge(challenge.id, now, tx))) {
        throw Errors.loginChallengeInvalid();
      }
      await this.repository.setOwnPassword(user.id, user.hospitalId, passwordHash, now, tx);
      await this.audit.record(
        {
          action: 'auth.password.changed',
          hospitalId: user.hospitalId,
          actorUserId: user.id,
          entityType: 'user',
          entityId: user.id,
          meta,
          details: { via: 'sign-in' },
        },
        tx,
      );
      return this.repository.findCandidateById(user.id, user.hospitalId, tx);
    });
    if (changed === null) throw Errors.loginChallengeInvalid();
    // No session cookie exists during a challenge: login already ended any the browser had.
    return this.startSession(changed, meta, now);
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

  private async startSession(user: LoginCandidate, meta: RequestMeta, now: Date, currentSessionToken?: string): Promise<LoginResult> {
    const session = await this.transactions.run(async (tx: Tx) => {
      // A new session ID at every login: any session the browser already had is ended.
      if (currentSessionToken !== undefined) {
        await this.sessions.endByToken(currentSessionToken, 'replaced', now, tx);
      }
      const started = await this.sessions.start(user, meta, now, tx);
      await this.repository.recordSuccess(user.id, now, tx);
      await this.repository.insertLoginEvent(
        {
          username: user.username,
          userId: user.id,
          hospitalId: user.hospitalId,
          outcome: 'succeeded',
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          createdAt: now,
        },
        tx,
      );
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
      kind: 'signed_in',
      sessionToken: session.token,
      csrfToken,
      response: { status: 'signed_in', ...toMeResponse(user, permissions, session.expiresAt), csrfToken },
    };
  }
}
