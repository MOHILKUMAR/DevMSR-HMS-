import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Tx } from '../common/prisma/tx.js';

export interface UserRef {
  userId: string;
  hospitalId: string | null;
}

export interface TwoFactorState {
  totpSecretEncrypted: string | null;
  totpEnabledAt: Date | null;
  totpLastTimeStep: number | null;
}

/** A user's two-factor secret and recovery codes. Every query is limited to the user's own hospital. */
@Injectable()
export class TwoFactorRepository {
  constructor(private readonly prisma: PrismaService) {}

  find({ userId, hospitalId }: UserRef, tx?: Tx): Promise<TwoFactorState | null> {
    return (tx ?? this.prisma).user.findFirst({
      where: { id: userId, hospitalId },
      select: { totpSecretEncrypted: true, totpEnabledAt: true, totpLastTimeStep: true },
    });
  }

  /** A secret being set up. Never replaces one that is on. */
  async setPendingSecret({ userId, hospitalId }: UserRef, sealed: string, tx?: Tx): Promise<boolean> {
    const { count } = await (tx ?? this.prisma).user.updateMany({
      where: { id: userId, hospitalId, totpEnabledAt: null },
      data: { totpSecretEncrypted: sealed },
    });
    return count === 1;
  }

  async enable({ userId, hospitalId }: UserRef, timeStep: number, now: Date, tx: Tx): Promise<boolean> {
    const { count } = await tx.user.updateMany({
      where: { id: userId, hospitalId, totpEnabledAt: null, totpSecretEncrypted: { not: null } },
      data: { totpEnabledAt: now, totpLastTimeStep: timeStep },
    });
    return count === 1;
  }

  /** Records the step of an accepted code. False when that step or a later one was already used. */
  async useTimeStep({ userId, hospitalId }: UserRef, timeStep: number, tx: Tx): Promise<boolean> {
    const { count } = await tx.user.updateMany({
      where: { id: userId, hospitalId, totpEnabledAt: { not: null }, OR: [{ totpLastTimeStep: null }, { totpLastTimeStep: { lt: timeStep } }] },
      data: { totpLastTimeStep: timeStep },
    });
    return count === 1;
  }

  async disable({ userId, hospitalId }: UserRef, tx: Tx): Promise<void> {
    await tx.user.updateMany({
      where: { id: userId, hospitalId },
      data: { totpSecretEncrypted: null, totpEnabledAt: null, totpLastTimeStep: null },
    });
  }

  /** Revokes the unused codes and stores the new ones. */
  async replaceRecoveryCodes(user: UserRef, codeHashes: readonly string[], now: Date, tx: Tx): Promise<void> {
    await this.revokeRecoveryCodes(user, now, tx);
    await tx.recoveryCode.createMany({
      data: codeHashes.map((codeHash) => ({ userId: user.userId, hospitalId: user.hospitalId, codeHash, createdAt: now })),
    });
  }

  async revokeRecoveryCodes({ userId, hospitalId }: UserRef, now: Date, tx: Tx): Promise<void> {
    await tx.recoveryCode.updateMany({ where: { userId, hospitalId, usedAt: null, revokedAt: null }, data: { revokedAt: now } });
  }

  /** Marks a code used. False when it does not exist, was used or was revoked. */
  async useRecoveryCode({ userId, hospitalId }: UserRef, codeHash: string, now: Date, tx: Tx): Promise<boolean> {
    const { count } = await tx.recoveryCode.updateMany({
      where: { userId, hospitalId, codeHash, usedAt: null, revokedAt: null },
      data: { usedAt: now },
    });
    return count === 1;
  }

  countRecoveryCodesLeft({ userId, hospitalId }: UserRef, tx?: Tx): Promise<number> {
    return (tx ?? this.prisma).recoveryCode.count({ where: { userId, hospitalId, usedAt: null, revokedAt: null } });
  }
}
