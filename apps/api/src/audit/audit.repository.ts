import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Tx } from '../common/prisma/tx.js';

/** Insert only. The database rejects UPDATE, DELETE and TRUNCATE on audit_events. */
@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insert(data: Prisma.AuditEventUncheckedCreateInput, tx?: Tx): Promise<void> {
    await (tx ?? this.prisma).auditEvent.create({ data, select: { id: true } });
  }
}
