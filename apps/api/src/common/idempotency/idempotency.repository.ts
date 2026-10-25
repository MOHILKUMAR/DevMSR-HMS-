import { Injectable } from '@nestjs/common';
import { Prisma, type IdempotencyStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface IdempotencyClaimInput {
  hospitalId: string | null;
  userId: string;
  key: string;
  method: string;
  path: string;
  requestHash: string;
  expiresAt: Date;
}

export interface IdempotencyRecord {
  requestHash: string;
  status: IdempotencyStatus;
  responseStatus: number | null;
  responseBody: Prisma.JsonValue;
}

export type IdempotencyClaim = { claimed: true; id: string } | { claimed: false; record: IdempotencyRecord };

/** Keys are scoped to the user who sent them, and a user belongs to one hospital. */
@Injectable()
export class IdempotencyRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Claims the key for this request, or returns the record when this user already used the key. */
  async claim(input: IdempotencyClaimInput): Promise<IdempotencyClaim> {
    try {
      const row = await this.prisma.idempotencyKey.create({
        data: { ...input, status: 'in_progress' },
        select: { id: true },
      });
      return { claimed: true, id: row.id };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const record = await this.prisma.idempotencyKey.findUniqueOrThrow({
          where: { userId_key: { userId: input.userId, key: input.key } },
          select: { requestHash: true, status: true, responseStatus: true, responseBody: true },
        });
        return { claimed: false, record };
      }
      throw error;
    }
  }

  async complete(id: string, responseStatus: number, responseBody: unknown): Promise<void> {
    await this.prisma.idempotencyKey.update({
      where: { id },
      data: {
        status: 'completed',
        responseStatus,
        responseBody: responseBody === undefined || responseBody === null ? Prisma.DbNull : (responseBody as Prisma.InputJsonValue),
        completedAt: new Date(),
      },
    });
  }

  /** The handler failed, so nothing was saved: free the key so the client can retry. */
  async release(id: string): Promise<void> {
    await this.prisma.idempotencyKey.delete({ where: { id } });
  }
}
