import { Injectable } from '@nestjs/common';
import type { SessionEndReason, UserKind } from '../generated/prisma/client.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Tx } from '../common/prisma/tx.js';

export interface ActiveSession {
  id: string;
  userId: string;
  lastSeenAt: Date;
  expiresAt: Date;
  user: {
    hospitalId: string | null;
    kind: UserKind;
    isActive: boolean;
    hospital: { isActive: boolean } | null;
  };
}

export interface NewSession {
  tokenHash: string;
  userId: string;
  hospitalId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Sessions are looked up by token hash before the hospital is known, so these queries are the one
 * place that does not filter by hospital_id. The hospital comes from the session's own user row.
 */
@Injectable()
export class SessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveByTokenHash(tokenHash: string): Promise<ActiveSession | null> {
    return this.prisma.session.findFirst({
      where: { tokenHash, endedAt: null },
      select: {
        id: true,
        userId: true,
        lastSeenAt: true,
        expiresAt: true,
        user: { select: { hospitalId: true, kind: true, isActive: true, hospital: { select: { isActive: true } } } },
      },
    });
  }

  /** Codes from the user's roles, limited to roles of the user's own hospital (or platform roles). */
  async permissionCodes(userId: string, hospitalId: string | null, tx?: Tx): Promise<string[]> {
    const rows = await (tx ?? this.prisma).permission.findMany({
      where: { rolePermissions: { some: { role: { hospitalId, userRoles: { some: { userId } } } } } },
      select: { code: true },
      orderBy: { code: 'asc' },
    });
    return rows.map((row) => row.code);
  }

  async create(data: NewSession, tx?: Tx): Promise<{ id: string; expiresAt: Date }> {
    return (tx ?? this.prisma).session.create({
      data: { ...data, lastSeenAt: data.createdAt },
      select: { id: true, expiresAt: true },
    });
  }

  async touch(id: string, at: Date): Promise<void> {
    await this.prisma.session.updateMany({ where: { id, endedAt: null }, data: { lastSeenAt: at } });
  }

  async end(where: { id: string } | { tokenHash: string }, reason: SessionEndReason, at: Date, tx?: Tx): Promise<void> {
    await (tx ?? this.prisma).session.updateMany({
      where: { ...where, endedAt: null },
      data: { endedAt: at, endReason: reason },
    });
  }
}
