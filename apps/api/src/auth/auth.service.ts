import { Injectable } from '@nestjs/common';
import type { LoginPasswordChange, LoginRequest, LoginResponse, LoginTotp, MeResponse, TotpCodeBody, TotpSetupResponse } from '@devmsr/validation';
import type { LoginStep } from '../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { randomToken, sha256Hex } from '../common/crypto/tokens.js';
import { AppError, Errors } from '../common/errors/app-error.js';
import type { RequestMeta } from '../common/http/app-request.js';
import { TransactionRunner } from '../common/prisma/transaction-runner.js';
import type { AuthContext } from './auth-context.js';
import { LOGIN_CHALLENGE_TTL_MS } from './auth-cookies.js';
import { AuthRepository, type LoginCandidate, type LoginEventInput, type OpenLoginChallenge } from './auth.repository.js';
import { CsrfService } from './csrf.service.js';
import { toMeResponse } from './dto/me-response.mapper.js';
import { dummyPasswordHash, hashPassword, verifyPassword } from './password.js';
import { requiresTwoFactor } from './permission-matrix.js';
import { SessionsService } from './sessions.service.js';
import { TwoFactorRepository } from './two-factor.repository.js';
import { totpAccountLabel, TwoFactorService } from './two-factor.service.js';

/** CLAUDE.md section 9: lock the account for 15 minutes after 5 failed attempts. */
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

/** Either a session (cookie token and CSRF token) or a challenge whose token goes in its own cookie. */
export type LoginResult =
  | { kind: 'signed_in'; sessionToken: string; csrfToken: string; response: LoginResponse }
  | { kind: 'challenge'; challengeToken: string; response: LoginResponse };

function eventFor(user: LoginCandidate, meta: RequestMeta, now: Date): Omit<LoginEventInput, 'outcome'> {
  return {
    username: user.username,
    userId: user.id,
    hospitalId: user.hospitalId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    createdAt: now,
  };
}

/**
 * Sign-in: the password, then whatever steps the user still owes, one challenge per step, in this
 * order: a new password if an admin set it, then two-factor (set it up if required and not on yet,
 * else a code if it is on). A session starts only after the last step.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly sessions: SessionsService,
    private readonly csrf: CsrfService,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
    private readonly twoFactor: TwoFactorService,
    private readonly twoFactorRepository: TwoFactorRepository,
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
      await this.countFailure(user, 'wrong_password', meta, now);
      throw Errors.loginFailed();
    }
    return this.proceed(user, meta, now, { currentSessionToken });
  }

  /**
   * The `change_password` step. The new password must differ from the one the admin set. Then the
   * next step, or a session.
   */
  async completePasswordChange(
    challengeToken: string | undefined,
    input: LoginPasswordChange,
    meta: RequestMeta,
    now: Date = new Date(),
  ): Promise<LoginResult> {
    const { challenge, user } = await this.openChallenge(challengeToken, 'change_password', now);
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
    return this.proceed(changed, meta, now);
  }

  /** What the authenticator app needs during the `totp_setup` step. Asking again shows the same secret. */
  async totpSetupDetails(challengeToken: string | undefined, now: Date = new Date()): Promise<TotpSetupResponse> {
    const { user } = await this.openChallenge(challengeToken, 'totp_setup', now);
    if (user.totpSecretEncrypted === null) throw Errors.loginChallengeInvalid();
    return this.twoFactor.setup(user.totpSecretEncrypted, totpAccountLabel(user));
  }

  /**
   * The `totp_setup` step: a code from the app proves it holds the secret, which switches two-factor
   * on. The session response carries the recovery codes, the only time they are shown.
   */
  async completeTotpSetup(challengeToken: string | undefined, input: TotpCodeBody, meta: RequestMeta, now: Date = new Date()): Promise<LoginResult> {
    const { challenge, user } = await this.openChallenge(challengeToken, 'totp_setup', now);
    const timeStep = await this.twoFactor.check({ ...user, totpLastTimeStep: null }, input.code, now);
    if (timeStep === null) return this.refuseCode(user, meta, now);

    const ref = { userId: user.id, hospitalId: user.hospitalId };
    const recoveryCodes = await this.transactions.run(async (tx) => {
      if (!(await this.repository.completeChallenge(challenge.id, now, tx)) || !(await this.twoFactorRepository.enable(ref, timeStep, now, tx))) {
        throw Errors.loginChallengeInvalid();
      }
      const codes = await this.twoFactor.issueRecoveryCodes(ref, now, tx);
      await this.audit.record(
        { action: 'auth.two-factor.enabled', hospitalId: user.hospitalId, actorUserId: user.id, entityType: 'user', entityId: user.id, meta, details: { via: 'sign-in' } },
        tx,
      );
      return codes;
    });
    const enabled = await this.repository.findCandidateById(user.id, user.hospitalId);
    if (enabled === null) throw Errors.loginChallengeInvalid();
    return this.withRecoveryCodes(await this.proceed(enabled, meta, now, { twoFactorDone: true }), recoveryCodes);
  }

  /** The `totp_verify` step: a code from the app, used once, or one of the recovery codes. */
  async completeTotpVerify(challengeToken: string | undefined, input: LoginTotp, meta: RequestMeta, now: Date = new Date()): Promise<LoginResult> {
    const { challenge, user } = await this.openChallenge(challengeToken, 'totp_verify', now);
    const ref = { userId: user.id, hospitalId: user.hospitalId };

    if (input.code !== undefined) {
      const timeStep = await this.twoFactor.check(user, input.code, now);
      if (timeStep === null) return this.refuseCode(user, meta, now);
      await this.transactions.run(async (tx) => {
        if (!(await this.repository.completeChallenge(challenge.id, now, tx))) throw Errors.loginChallengeInvalid();
        // Another request may have used the same code a moment ago.
        if (!(await this.twoFactorRepository.useTimeStep(ref, timeStep, tx))) throw Errors.totpInvalid();
      });
    } else {
      const used = await this.transactions.run(async (tx) => {
        // A wrong code changes nothing, so the challenge stays open for another try.
        if (!(await this.twoFactorRepository.useRecoveryCode(ref, this.twoFactor.hashRecoveryCode(input.recoveryCode ?? ''), now, tx))) {
          return false;
        }
        if (!(await this.repository.completeChallenge(challenge.id, now, tx))) throw Errors.loginChallengeInvalid();
        const left = await this.twoFactorRepository.countRecoveryCodesLeft(ref, tx);
        await this.audit.record(
          { action: 'auth.recovery-code.used', hospitalId: user.hospitalId, actorUserId: user.id, entityType: 'user', entityId: user.id, meta, details: { left } },
          tx,
        );
        return true;
      });
      if (!used) return this.refuseCode(user, meta, now);
    }
    return this.proceed(user, meta, now, { twoFactorDone: true });
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

  /** The step a user still owes after a correct password, or null when a session can start. */
  private async nextStep(user: LoginCandidate, twoFactorDone: boolean): Promise<LoginStep | null> {
    if (user.mustChangePassword) return 'change_password';
    if (twoFactorDone) return null;
    if (user.totpEnabledAt !== null) return 'totp_verify';
    return requiresTwoFactor(await this.sessions.permissionCodes(user.id, user.hospitalId)) ? 'totp_setup' : null;
  }

  private async proceed(
    user: LoginCandidate,
    meta: RequestMeta,
    now: Date,
    { currentSessionToken, twoFactorDone = false }: { currentSessionToken?: string | undefined; twoFactorDone?: boolean } = {},
  ): Promise<LoginResult> {
    const step = await this.nextStep(user, twoFactorDone);
    return step === null ? this.startSession(user, meta, now, currentSessionToken) : this.startChallenge(user, step, meta, now, currentSessionToken);
  }

  private async startChallenge(user: LoginCandidate, step: LoginStep, meta: RequestMeta, now: Date, currentSessionToken?: string): Promise<LoginResult> {
    const challengeToken = randomToken();
    const expiresAt = new Date(now.getTime() + LOGIN_CHALLENGE_TTL_MS);
    await this.transactions.run(async (tx) => {
      // Whatever session the browser had ends now, as at any login.
      if (currentSessionToken !== undefined) {
        await this.sessions.endByToken(currentSessionToken, 'replaced', now, tx);
      }
      await this.repository.resetFailures(user.id, tx);
      if (step === 'totp_setup') {
        await this.twoFactor.pendingSecret({ userId: user.id, hospitalId: user.hospitalId }, user, tx);
      }
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
      await this.repository.insertLoginEvent({ ...eventFor(user, meta, now), outcome: 'challenge_started' }, tx);
    });
    return { kind: 'challenge', challengeToken, response: { status: 'challenge', step, expiresAt: expiresAt.toISOString() } };
  }

  /**
   * The unused challenge behind the cookie, if it waits for this step and its user may still sign
   * in. A challenge older than the account's last password change (an admin set another password
   * meanwhile) is refused.
   */
  private async openChallenge(
    challengeToken: string | undefined,
    step: LoginStep,
    now: Date,
  ): Promise<{ challenge: OpenLoginChallenge; user: LoginCandidate }> {
    const challenge = challengeToken === undefined ? null : await this.repository.findOpenChallenge(sha256Hex(challengeToken), step);
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
    return { challenge, user };
  }

  /** A wrong two-factor or recovery code counts toward the same lockout as a wrong password. */
  private async refuseCode(user: LoginCandidate, meta: RequestMeta, now: Date): Promise<never> {
    await this.countFailure(user, 'wrong_totp', meta, now);
    throw Errors.totpInvalid();
  }

  private async countFailure(user: LoginCandidate, outcome: 'wrong_password' | 'wrong_totp', meta: RequestMeta, now: Date): Promise<void> {
    const { locked } = await this.repository.recordFailure(user.id, now, MAX_FAILED_LOGINS, LOCKOUT_MS);
    await this.repository.insertLoginEvent({ ...eventFor(user, meta, now), outcome });
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
  }

  private withRecoveryCodes(result: LoginResult, recoveryCodes: string[]): LoginResult {
    if (result.kind !== 'signed_in' || result.response.status !== 'signed_in') {
      // Two-factor is the last step, so a session always follows it.
      throw new AppError(500, 'INTERNAL_ERROR', 'Expected a session after two-factor setup');
    }
    return { ...result, response: { ...result.response, recoveryCodes } };
  }

  private async startSession(user: LoginCandidate, meta: RequestMeta, now: Date, currentSessionToken?: string): Promise<LoginResult> {
    const session = await this.transactions.run(async (tx) => {
      // A new session ID at every login: any session the browser already had is ended.
      if (currentSessionToken !== undefined) {
        await this.sessions.endByToken(currentSessionToken, 'replaced', now, tx);
      }
      const started = await this.sessions.start(user, meta, now, tx);
      await this.repository.recordSuccess(user.id, now, tx);
      await this.repository.insertLoginEvent({ ...eventFor(user, meta, now), outcome: 'succeeded' }, tx);
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
