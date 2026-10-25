import { Injectable } from '@nestjs/common';
import type { LoginOutcome, LoginStep, UserKind } from '../generated/prisma/client.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Tx } from '../common/prisma/tx.js';

export interface LoginCandidate {
  id: string;
  hospitalId: string | null;
  kind: UserKind;
  username: string;
  displayName: string;
  passwordHash: string;
  passwordChangedAt: Date;
  mustChangePassword: boolean;
  totpSecretEncrypted: string | null;
  totpEnabledAt: Date | null;
  totpLastTimeStep: number | null;
  lockedUntil: Date | null;
  isActive: boolean;
  hospital: { id: string; code: string; name: string; isActive: boolean } | null;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  kind: UserKind;
  hospital: { id: string; code: string; name: string } | null;
}

export interface LoginEventInput {
  username: string;
  userId: string | null;
  hospitalId: string | null;
  outcome: LoginOutcome;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface NewLoginChallenge {
  tokenHash: string;
  userId: string;
  hospitalId: string | null;
  step: LoginStep;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface OpenLoginChallenge {
  id: string;
  step: LoginStep;
  createdAt: Date;
  expiresAt: Date;
  user: LoginCandidate;
}

const HOSPITAL_SUMMARY = { select: { id: true, code: true, name: true } } as const;

const LOGIN_CANDIDATE_SELECT = {
  id: true,
  hospitalId: true,
  kind: true,
  username: true,
  displayName: true,
  passwordHash: true,
  passwordChangedAt: true,
  mustChangePassword: true,
  totpSecretEncrypted: true,
  totpEnabledAt: true,
  totpLastTimeStep: true,
  lockedUntil: true,
  isActive: true,
  hospital: { select: { id: true, code: true, name: true, isActive: true } },
} as const;

/**
 * Sign-in runs before the hospital is known, so login lookups find the user by username or by a
 * challenge token hash. Everything after that is filtered by the user's own id and hospital.
 */
@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Usernames are unique across the platform, so login finds the user before the hospital is known. */
  findLoginCandidate(username: string): Promise<LoginCandidate | null> {
    return this.prisma.user.findUnique({ where: { username }, select: LOGIN_CANDIDATE_SELECT });
  }

  findCandidateById(userId: string, hospitalId: string | null, tx?: Tx): Promise<LoginCandidate | null> {
    return (tx ?? this.prisma).user.findFirst({ where: { id: userId, hospitalId }, select: LOGIN_CANDIDATE_SELECT });
  }

  findProfile(userId: string, hospitalId: string | null): Promise<UserProfile | null> {
    return this.prisma.user.findFirst({
      where: { id: userId, hospitalId },
      select: { id: true, username: true, displayName: true, kind: true, hospital: HOSPITAL_SUMMARY },
    });
  }

  /** Counts a failed attempt atomically. The attempt that reaches the limit locks the account and resets the count. */
  async recordFailure(userId: string, now: Date, maxAttempts: number, lockMs: number): Promise<{ locked: boolean }> {
    const { failedLoginCount } = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    if (failedLoginCount < maxAttempts) {
      return { locked: false };
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + lockMs) },
    });
    return { locked: true };
  }

  /** The password was right: failed attempts no longer count, whether or not a session starts yet. */
  async resetFailures(userId: string, tx: Tx): Promise<void> {
    await tx.user.update({ where: { id: userId }, data: { failedLoginCount: 0, lockedUntil: null } });
  }

  async recordSuccess(userId: string, now: Date, tx?: Tx): Promise<void> {
    await (tx ?? this.prisma).user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
    });
  }

  async insertLoginEvent(data: LoginEventInput, tx?: Tx): Promise<void> {
    await (tx ?? this.prisma).loginEvent.create({ data, select: { id: true } });
  }

  async createChallenge(data: NewLoginChallenge, tx: Tx): Promise<void> {
    await tx.loginChallenge.create({ data, select: { id: true } });
  }

  /** The unused challenge behind a cookie token, if it waits for this step. */
  findOpenChallenge(tokenHash: string, step: LoginStep): Promise<OpenLoginChallenge | null> {
    return this.prisma.loginChallenge.findFirst({
      where: { tokenHash, step, completedAt: null },
      select: { id: true, step: true, createdAt: true, expiresAt: true, user: { select: LOGIN_CANDIDATE_SELECT } },
    });
  }

  /** Marks the challenge used. False when another request finished it first. */
  async completeChallenge(id: string, now: Date, tx: Tx): Promise<boolean> {
    const { count } = await tx.loginChallenge.updateMany({ where: { id, completedAt: null }, data: { completedAt: now } });
    return count === 1;
  }

  /** The user's own new password: it replaces one an admin set, so the change requirement ends. */
  async setOwnPassword(userId: string, hospitalId: string | null, passwordHash: string, now: Date, tx: Tx): Promise<void> {
    await tx.user.updateMany({
      where: { id: userId, hospitalId },
      data: { passwordHash, passwordChangedAt: now, mustChangePassword: false },
    });
  }
}
