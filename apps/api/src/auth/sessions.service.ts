import { Injectable } from '@nestjs/common';
import type { SessionEndReason } from '../generated/prisma/client.js';
import { randomToken, sha256Hex } from '../common/crypto/tokens.js';
import type { RequestMeta } from '../common/http/app-request.js';
import type { Tx } from '../common/prisma/tx.js';
import type { AuthContext } from './auth-context.js';
import { BREAK_GLASS_PERMISSIONS } from './permission-matrix.js';
import { SessionsRepository } from './sessions.repository.js';

/** CLAUDE.md section 9: 15 minute idle timeout, 12 hour maximum. */
export const SESSION_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** last_seen_at is written at most once a minute, so a busy screen does not write on every request. */
const TOUCH_INTERVAL_MS = 60 * 1000;

export type SessionCheck = { status: 'valid'; auth: AuthContext } | { status: 'expired' } | { status: 'invalid' };

@Injectable()
export class SessionsService {
  constructor(private readonly sessions: SessionsRepository) {}

  /** Starts a session. Only the SHA-256 of the token is stored; the token itself goes in the cookie. */
  async start(
    user: { id: string; hospitalId: string | null },
    meta: RequestMeta,
    now: Date,
    tx?: Tx,
  ): Promise<{ token: string; id: string; expiresAt: Date }> {
    const token = randomToken();
    const session = await this.sessions.create(
      {
        tokenHash: sha256Hex(token),
        userId: user.id,
        hospitalId: user.hospitalId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        createdAt: now,
        expiresAt: new Date(now.getTime() + SESSION_MAX_AGE_MS),
      },
      tx,
    );
    return { token, ...session };
  }

  async check(token: string, now: Date = new Date()): Promise<SessionCheck> {
    const session = await this.sessions.findActiveByTokenHash(sha256Hex(token));
    if (session === null) {
      return { status: 'invalid' };
    }
    if (now >= session.expiresAt) {
      await this.sessions.end({ id: session.id }, 'max_age', now);
      return { status: 'expired' };
    }
    if (now.getTime() - session.lastSeenAt.getTime() >= SESSION_IDLE_TIMEOUT_MS) {
      await this.sessions.end({ id: session.id }, 'idle_timeout', now);
      return { status: 'expired' };
    }
    if (!session.user.isActive || session.user.hospital?.isActive === false) {
      await this.sessions.end({ id: session.id }, 'user_inactive', now);
      return { status: 'invalid' };
    }

    const permissions = new Set(await this.sessions.permissionCodes(session.userId, session.user.hospitalId));
    if (now.getTime() - session.lastSeenAt.getTime() >= TOUCH_INTERVAL_MS) {
      await this.sessions.touch(session.id, now);
    }
    // Break-glass gives a platform user one hospital, read only, for this session until it expires.
    const grant = session.user.kind === 'platform' ? await this.sessions.findActiveBreakGlass(session.id, now) : null;
    if (grant !== null) {
      for (const code of BREAK_GLASS_PERMISSIONS) permissions.add(code);
    }
    return {
      status: 'valid',
      auth: {
        sessionId: session.id,
        userId: session.userId,
        hospitalId: grant?.hospitalId ?? session.user.hospitalId,
        userHospitalId: session.user.hospitalId,
        kind: session.user.kind,
        permissions,
        expiresAt: session.expiresAt,
        breakGlass: grant === null ? null : { grantId: grant.id, hospitalId: grant.hospitalId, expiresAt: grant.expiresAt },
      },
    };
  }

  permissionCodes(userId: string, hospitalId: string | null, tx?: Tx): Promise<string[]> {
    return this.sessions.permissionCodes(userId, hospitalId, tx);
  }

  /** Ends a session and any break-glass access tied to it. */
  async end(sessionId: string, reason: SessionEndReason, now: Date, tx: Tx): Promise<void> {
    await this.sessions.end({ id: sessionId }, reason, now, tx);
    await this.sessions.endBreakGlass(sessionId, now, tx);
  }

  /** Ends every open session of a user, for example when an admin deactivates them or sets a new password. */
  async endAllForUser(userId: string, reason: SessionEndReason, now: Date, tx?: Tx): Promise<void> {
    await this.sessions.end({ userId }, reason, now, tx);
  }

  /** Ends the session behind a cookie token, if any. Used at login so each login gets a new session ID. */
  async endByToken(token: string, reason: SessionEndReason, now: Date, tx?: Tx): Promise<void> {
    await this.sessions.end({ tokenHash: sha256Hex(token) }, reason, now, tx);
  }
}
