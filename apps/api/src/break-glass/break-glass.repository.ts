import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { pageArgs, type PageRequest } from '../common/http/pagination.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Tx } from '../common/prisma/tx.js';

const GRANT_SELECT = {
  id: true,
  reason: true,
  createdAt: true,
  expiresAt: true,
  endedAt: true,
  hospital: { select: { id: true, code: true, name: true } },
  user: { select: { id: true, username: true, displayName: true } },
} as const satisfies Prisma.BreakGlassGrantSelect;

export type GrantRow = Prisma.BreakGlassGrantGetPayload<{ select: typeof GRANT_SELECT }>;

export interface NewGrant {
  userId: string;
  sessionId: string;
  hospitalId: string;
  reason: string;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Break-glass grants. Starting one is platform work, so it looks hospitals up by ID across the
 * platform; the history a hospital admin reads is always filtered by their hospital_id.
 */
@Injectable()
export class BreakGlassRepository {
  constructor(private readonly prisma: PrismaService) {}

  activeHospitals(): Promise<{ id: string; code: string; name: string }[]> {
    return this.prisma.hospital.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } });
  }

  isActiveHospital(id: string): Promise<boolean> {
    return this.prisma.hospital.count({ where: { id, isActive: true } }).then((count) => count === 1);
  }

  create(data: NewGrant, tx: Tx): Promise<GrantRow> {
    return tx.breakGlassGrant.create({ data, select: GRANT_SELECT });
  }

  /** Ends the session's open grant. False when there is none. */
  async endForSession(sessionId: string, at: Date, tx: Tx): Promise<boolean> {
    const { count } = await tx.breakGlassGrant.updateMany({ where: { sessionId, endedAt: null }, data: { endedAt: at } });
    return count === 1;
  }

  async listForHospital(hospitalId: string, page: PageRequest): Promise<{ rows: GrantRow[]; total: number }> {
    const where: Prisma.BreakGlassGrantWhereInput = { hospitalId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.breakGlassGrant.findMany({ where, select: GRANT_SELECT, orderBy: { createdAt: 'desc' }, ...pageArgs(page) }),
      this.prisma.breakGlassGrant.count({ where }),
    ]);
    return { rows, total };
  }
}
