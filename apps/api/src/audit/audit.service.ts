import { Injectable } from '@nestjs/common';
import type { RequestMeta } from '../common/http/app-request.js';
import type { Tx } from '../common/prisma/tx.js';
import { AuditRepository } from './audit.repository.js';

/** Flat IDs, codes and amounts only. Never patient names, phone numbers, Aadhaar or ABHA numbers. */
export type AuditDetails = Record<string, string | number | boolean | null>;

export interface AuditEntry {
  /** module.resource.verb, for example auth.session.created. */
  action: string;
  hospitalId: string | null;
  actorUserId: string | null;
  entityType?: string;
  entityId?: string;
  meta?: RequestMeta;
  details?: AuditDetails;
}

const ACTION_FORMAT = /^[a-z]+\.[a-z-]+\.[a-z-]+$/;

@Injectable()
export class AuditService {
  constructor(private readonly repository: AuditRepository) {}

  /** Pass the transaction of the change being audited, so the audit row commits or rolls back with it. */
  async record(entry: AuditEntry, tx?: Tx): Promise<void> {
    if (!ACTION_FORMAT.test(entry.action)) {
      throw new Error(`Audit action must be module.resource.verb: ${entry.action}`);
    }
    await this.repository.insert(
      {
        action: entry.action,
        hospitalId: entry.hospitalId,
        actorUserId: entry.actorUserId,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        requestId: entry.meta?.requestId ?? null,
        ipAddress: entry.meta?.ipAddress ?? null,
        // Everything done during break-glass carries the grant, so the hospital admin can trace it.
        metadata: entry.meta?.breakGlassId === undefined ? (entry.details ?? {}) : { ...entry.details, breakGlassId: entry.meta.breakGlassId },
      },
      tx,
    );
  }
}
