import { Injectable } from '@nestjs/common';
import type { Paginated } from '@devmsr/types';
import type {
  Bed,
  CreateBed,
  CreateRoomCategory,
  CreateWard,
  ListQuery,
  RoomCategory,
  UpdateBed,
  UpdateRoomCategory,
  UpdateWard,
  Ward,
} from '@devmsr/validation';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import { Errors } from '../common/errors/app-error.js';
import type { RequestMeta } from '../common/http/app-request.js';
import { hospitalOf } from '../common/http/hospital-scope.js';
import { paged } from '../common/http/pagination.js';
import { TransactionRunner } from '../common/prisma/transaction-runner.js';
import type { Tx } from '../common/prisma/tx.js';
import { Prisma } from '../generated/prisma/client.js';
import { BedsRepository } from './beds.repository.js';
import { toBed, toRoomCategory, toWard } from './dto/beds.mapper.js';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function changedFields(input: Record<string, unknown>): string {
  return Object.keys(input)
    .filter((key) => input[key] !== undefined)
    .sort()
    .join(',');
}

@Injectable()
export class BedsService {
  constructor(
    private readonly beds: BedsRepository,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
  ) {}

  async listRoomCategories(auth: AuthContext, query: ListQuery): Promise<Paginated<RoomCategory>> {
    const { rows, total } = await this.beds.listRoomCategories(hospitalOf(auth), query, query);
    return paged(rows.map(toRoomCategory), total, query);
  }

  async createRoomCategory(auth: AuthContext, input: CreateRoomCategory, meta: RequestMeta): Promise<RoomCategory> {
    const hospitalId = hospitalOf(auth);
    return this.unique('A room category with this code already exists.', () =>
      this.transactions.run(async (tx) => {
        const row = await this.beds.createRoomCategory(hospitalId, input, tx);
        await this.record(auth, 'masters.room-category.created', 'room_category', row.id, meta, tx, { code: row.code });
        return toRoomCategory(row);
      }),
    );
  }

  async updateRoomCategory(auth: AuthContext, id: string, input: UpdateRoomCategory, meta: RequestMeta): Promise<RoomCategory> {
    const hospitalId = hospitalOf(auth);
    if ((await this.beds.findRoomCategory(hospitalId, id)) === null) throw Errors.notFound('room category');
    return this.transactions.run(async (tx) => {
      const row = await this.beds.updateRoomCategory(hospitalId, id, input, tx);
      await this.record(auth, 'masters.room-category.updated', 'room_category', id, meta, tx, { fields: changedFields(input) });
      return toRoomCategory(row);
    });
  }

  async listWards(auth: AuthContext, query: ListQuery): Promise<Paginated<Ward>> {
    const { rows, total } = await this.beds.listWards(hospitalOf(auth), query, query);
    return paged(rows.map(toWard), total, query);
  }

  async createWard(auth: AuthContext, input: CreateWard, meta: RequestMeta): Promise<Ward> {
    const hospitalId = hospitalOf(auth);
    if (input.roomCategoryId != null) await this.checkRoomCategory(hospitalId, input.roomCategoryId);
    const branchId = await this.beds.defaultBranchId(hospitalId);
    if (branchId === null) throw Errors.referenceInvalid('branch');
    return this.unique('A ward with this code already exists.', () =>
      this.transactions.run(async (tx) => {
        const row = await this.beds.createWard(
          hospitalId,
          { branchId, code: input.code, name: input.name, roomCategoryId: input.roomCategoryId ?? null },
          tx,
        );
        await this.record(auth, 'masters.ward.created', 'ward', row.id, meta, tx, { code: row.code });
        return toWard(row);
      }),
    );
  }

  async updateWard(auth: AuthContext, id: string, input: UpdateWard, meta: RequestMeta): Promise<Ward> {
    const hospitalId = hospitalOf(auth);
    if ((await this.beds.findWard(hospitalId, id)) === null) throw Errors.notFound('ward');
    if (input.roomCategoryId != null) await this.checkRoomCategory(hospitalId, input.roomCategoryId);
    return this.transactions.run(async (tx) => {
      if (input.isActive === false && (await this.beds.lockBedsAndCountOccupied(hospitalId, id, tx)) > 0) throw Errors.bedOccupied();
      const row = await this.beds.updateWard(hospitalId, id, input, tx);
      await this.record(auth, 'masters.ward.updated', 'ward', id, meta, tx, { fields: changedFields(input) });
      return toWard(row);
    });
  }

  async listBeds(auth: AuthContext, wardId: string): Promise<Bed[]> {
    const hospitalId = hospitalOf(auth);
    if ((await this.beds.findWard(hospitalId, wardId)) === null) throw Errors.notFound('ward');
    return (await this.beds.listBeds(hospitalId, wardId)).map(toBed);
  }

  async createBed(auth: AuthContext, wardId: string, input: CreateBed, meta: RequestMeta): Promise<Bed> {
    const hospitalId = hospitalOf(auth);
    const ward = await this.beds.findWard(hospitalId, wardId);
    if (ward === null) throw Errors.notFound('ward');
    if (!ward.isActive) throw Errors.referenceInvalid('ward');
    return this.unique('This ward already has a bed with this code.', () =>
      this.transactions.run(async (tx) => {
        const row = await this.beds.createBed(hospitalId, wardId, input.code, tx);
        await this.record(auth, 'masters.bed.created', 'bed', row.id, meta, tx, { code: row.code });
        return toBed(row);
      }),
    );
  }

  async updateBed(auth: AuthContext, id: string, input: UpdateBed, meta: RequestMeta): Promise<Bed> {
    const hospitalId = hospitalOf(auth);
    if ((await this.beds.findBed(hospitalId, id)) === null) throw Errors.notFound('bed');
    return this.transactions.run(async (tx) => {
      const row = await this.beds.updateBed(hospitalId, id, input, tx);
      if (row === null) throw Errors.bedOccupied();
      await this.record(auth, 'masters.bed.updated', 'bed', id, meta, tx, { isActive: input.isActive });
      return toBed(row);
    });
  }

  private async checkRoomCategory(hospitalId: string, id: string): Promise<void> {
    const category = await this.beds.findRoomCategory(hospitalId, id);
    if (category === null || !category.isActive) throw Errors.referenceInvalid('room category');
  }

  private async unique<T>(message: string, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (isUniqueViolation(error)) throw Errors.conflict(message);
      throw error;
    }
  }

  private record(
    auth: AuthContext,
    action: string,
    entityType: string,
    entityId: string,
    meta: RequestMeta,
    tx: Tx,
    details: Record<string, string | boolean>,
  ): Promise<void> {
    return this.audit.record({ action, hospitalId: auth.hospitalId, actorUserId: auth.userId, entityType, entityId, meta, details }, tx);
  }
}
