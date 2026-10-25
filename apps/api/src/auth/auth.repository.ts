import { Injectable } from '@nestjs/common';
import type { LoginOutcome, UserKind } from '../generated/prisma/client.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Tx } from '../common/prisma/tx.js';

export interface LoginCandidate {
  id: string;
  hospitalId: string | null;
  kind: UserKind;
  username: string;
  displayName: string;
  passwordHash: string;
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

const HOSPITAL_SUMMARY = { select: { id: true, code: true, name: true } } as const;

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Usernames are unique across the platform, so login finds the user before the hospital is known. */
  findLoginCandidate(username: string): Promise<LoginCandidate | null> {
    return this.prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        hospitalId: true,
        kind: true,
        username: true,
        displayName: true,
        passwordHash: true,
        lockedUntil: true,
        isActive: true,
        hospital: { select: { id: true, code: true, name: true, isActive: true } },
      },
    });
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

  async recordSuccess(userId: string, now: Date, tx?: Tx): Promise<void> {
    await (tx ?? this.prisma).user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
    });
  }

  async insertLoginEvent(data: LoginEventInput, tx?: Tx): Promise<void> {
    await (tx ?? this.prisma).loginEvent.create({ data, select: { id: true } });
  }
}
