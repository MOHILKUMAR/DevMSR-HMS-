import { Injectable } from '@nestjs/common';
import type {
  ChangeOwnPassword,
  EndOtherSessionsResponse,
  OwnSession,
  RecoveryCodesResponse,
  TotpCodeBody,
  TotpSetupResponse,
  TwoFactorStatus,
} from '@devmsr/validation';
import { AuditService, type AuditDetails } from '../audit/audit.service.js';
import { Errors } from '../common/errors/app-error.js';
import type { RequestMeta } from '../common/http/app-request.js';
import { TransactionRunner } from '../common/prisma/transaction-runner.js';
import type { Tx } from '../common/prisma/tx.js';
import type { AuthContext } from './auth-context.js';
import { AuthRepository } from './auth.repository.js';
import { hashPassword, verifyPassword } from './password.js';
import { requiresTwoFactor } from './permission-matrix.js';
import { SESSION_IDLE_TIMEOUT_MS } from './sessions.service.js';
import { SessionsRepository } from './sessions.repository.js';
import { TwoFactorRepository, type TwoFactorState } from './two-factor.repository.js';
import { totpAccountLabel, TwoFactorService } from './two-factor.service.js';

/** What a signed-in user can do with their own account: password, sessions and two-factor sign-in. */
@Injectable()
export class AccountService {
  constructor(
    private readonly auth: AuthRepository,
    private readonly sessions: SessionsRepository,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
    private readonly twoFactor: TwoFactorService,
    private readonly twoFactorRepository: TwoFactorRepository,
  ) {}

  /** Needs the current password, so a session left open on a counter cannot be taken over. Other sessions end. */
  async changePassword(auth: AuthContext, input: ChangeOwnPassword, meta: RequestMeta, now: Date = new Date()): Promise<void> {
    const user = await this.auth.findCandidateById(auth.userId, auth.userHospitalId);
    if (user === null) throw Errors.unauthenticated();
    if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
      await this.audit.record({
        action: 'auth.password.change-refused',
        hospitalId: auth.userHospitalId,
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
      await this.auth.setOwnPassword(auth.userId, auth.userHospitalId, passwordHash, now, tx);
      const ended = await this.sessions.endOwn(this.owner(auth), { exceptId: auth.sessionId }, 'credentials_changed', now, tx);
      await this.audit.record(
        {
          action: 'auth.password.changed',
          hospitalId: auth.userHospitalId,
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

  async twoFactorStatus(auth: AuthContext): Promise<TwoFactorStatus> {
    const state = await this.twoFactorState(auth);
    return {
      enabled: state.totpEnabledAt !== null,
      required: requiresTwoFactor(auth.permissions),
      recoveryCodesLeft: state.totpEnabledAt === null ? 0 : await this.twoFactorRepository.countRecoveryCodesLeft(this.owner(auth)),
    };
  }

  /** A fresh secret to scan. Nothing changes for sign-in until a code confirms it. */
  async startTwoFactorSetup(auth: AuthContext): Promise<TotpSetupResponse> {
    const state = await this.twoFactorState(auth);
    if (state.totpEnabledAt !== null) throw Errors.twoFactorState('Two-factor sign-in is already on. Reload the page.');
    const user = await this.auth.findCandidateById(auth.userId, auth.userHospitalId);
    if (user === null) throw Errors.unauthenticated();
    return this.twoFactor.setup(await this.twoFactor.freshPendingSecret(this.owner(auth)), totpAccountLabel(user));
  }

  async enableTwoFactor(auth: AuthContext, input: TotpCodeBody, meta: RequestMeta, now: Date = new Date()): Promise<RecoveryCodesResponse> {
    const state = await this.twoFactorState(auth);
    if (state.totpEnabledAt !== null || state.totpSecretEncrypted === null) {
      throw Errors.twoFactorState('Start the setup again: scan the new QR code, then type its code.');
    }
    const timeStep = await this.twoFactor.check({ ...state, totpLastTimeStep: null }, input.code, now);
    if (timeStep === null) return this.refuseCode(auth, meta);
    return this.transactions.run(async (tx) => {
      if (!(await this.twoFactorRepository.enable(this.owner(auth), timeStep, now, tx))) {
        throw Errors.twoFactorState('Two-factor sign-in is already on. Reload the page.');
      }
      const recoveryCodes = await this.twoFactor.issueRecoveryCodes(this.owner(auth), now, tx);
      await this.recordTwoFactor(auth, 'auth.two-factor.enabled', meta, tx, { via: 'account' });
      return { recoveryCodes };
    });
  }

  /** New recovery codes replace the unused ones. Needs a current code, so a borrowed session cannot get them. */
  async newRecoveryCodes(auth: AuthContext, input: TotpCodeBody, meta: RequestMeta, now: Date = new Date()): Promise<RecoveryCodesResponse> {
    const state = await this.enabledState(auth);
    const timeStep = await this.twoFactor.check(state, input.code, now);
    if (timeStep === null) return this.refuseCode(auth, meta);
    return this.transactions.run(async (tx) => {
      if (!(await this.twoFactorRepository.useTimeStep(this.owner(auth), timeStep, tx))) throw Errors.totpInvalid();
      const recoveryCodes = await this.twoFactor.issueRecoveryCodes(this.owner(auth), now, tx);
      await this.recordTwoFactor(auth, 'auth.recovery-code.replaced', meta, tx);
      return { recoveryCodes };
    });
  }

  /** Only for users whose permissions do not make two-factor compulsory. */
  async disableTwoFactor(auth: AuthContext, input: TotpCodeBody, meta: RequestMeta, now: Date = new Date()): Promise<void> {
    if (requiresTwoFactor(auth.permissions)) throw Errors.twoFactorRequired();
    const state = await this.enabledState(auth);
    const timeStep = await this.twoFactor.check(state, input.code, now);
    if (timeStep === null) return this.refuseCode(auth, meta);
    await this.transactions.run(async (tx) => {
      if (!(await this.twoFactorRepository.useTimeStep(this.owner(auth), timeStep, tx))) throw Errors.totpInvalid();
      await this.twoFactorRepository.disable(this.owner(auth), tx);
      await this.twoFactorRepository.revokeRecoveryCodes(this.owner(auth), now, tx);
      await this.recordTwoFactor(auth, 'auth.two-factor.disabled', meta, tx);
    });
  }

  private async twoFactorState(auth: AuthContext): Promise<TwoFactorState> {
    const state = await this.twoFactorRepository.find(this.owner(auth));
    if (state === null) throw Errors.unauthenticated();
    return state;
  }

  private async enabledState(auth: AuthContext): Promise<TwoFactorState> {
    const state = await this.twoFactorState(auth);
    if (state.totpEnabledAt === null) throw Errors.twoFactorState('Two-factor sign-in is not on. Reload the page.');
    return state;
  }

  /** Wrong codes are audited; the login limit (5 a minute per session) stops guessing. */
  private async refuseCode(auth: AuthContext, meta: RequestMeta): Promise<never> {
    await this.recordTwoFactor(auth, 'auth.two-factor.code-refused', meta);
    throw Errors.totpInvalid();
  }

  private async recordTwoFactor(auth: AuthContext, action: string, meta: RequestMeta, tx?: Tx, details?: AuditDetails): Promise<void> {
    await this.audit.record(
      { action, hospitalId: auth.userHospitalId, actorUserId: auth.userId, entityType: 'user', entityId: auth.userId, meta, ...(details === undefined ? {} : { details }) },
      tx,
    );
  }

  private owner(auth: AuthContext): { userId: string; hospitalId: string | null } {
    return { userId: auth.userId, hospitalId: auth.userHospitalId };
  }

  private async recordEnded(auth: AuthContext, sessionIds: readonly string[], meta: RequestMeta, tx: Tx): Promise<void> {
    for (const id of sessionIds) {
      await this.audit.record(
        {
          action: 'auth.session.ended',
          hospitalId: auth.userHospitalId,
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
