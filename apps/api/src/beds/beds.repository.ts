import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { pageArgs, type PageRequest } from '../common/http/pagination.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Tx } from '../common/prisma/tx.js';

const ROOM_CATEGORY_SELECT = { id: true, code: true, name: true, isActive: true } as const satisfies Prisma.RoomCategorySelect;
export type RoomCategoryRow = Prisma.RoomCategoryGetPayload<{ select: typeof ROOM_CATEGORY_SELECT }>;

const WARD_SELECT = {
  id: true,
  code: true,
  name: true,
  roomCategoryId: true,
  isActive: true,
  roomCategory: { select: { name: true } },
  _count: { select: { beds: { where: { isActive: true } } } },
} as const satisfies Prisma.WardSelect;
export type WardRow = Prisma.WardGetPayload<{ select: typeof WARD_SELECT }>;

const BED_SELECT = { id: true, wardId: true, code: true, status: true, isActive: true } as const satisfies Prisma.BedSelect;
export type BedRow = Prisma.BedGetPayload<{ select: typeof BED_SELECT }>;

export interface MasterFilter {
  q?: string | undefined;
  includeInactive?: boolean | undefined;
}

function textFilter(q: string | undefined): { OR?: [{ code: { contains: string } }, { name: { contains: string; mode: 'insensitive' } }] } {
  return q === undefined || q === '' ? {} : { OR: [{ code: { contains: q.toUpperCase() } }, { name: { contains: q, mode: 'insensitive' } }] };
}

/** Room categories, wards and beds of one hospital. */
@Injectable()
export class BedsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listRoomCategories(hospitalId: string, filter: MasterFilter, page: PageRequest): Promise<{ rows: RoomCategoryRow[]; total: number }> {
    const where: Prisma.RoomCategoryWhereInput = {
      hospitalId,
      ...(filter.includeInactive === true ? {} : { isActive: true }),
      ...textFilter(filter.q),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.roomCategory.findMany({ where, select: ROOM_CATEGORY_SELECT, orderBy: { name: 'asc' }, ...pageArgs(page) }),
      this.prisma.roomCategory.count({ where }),
    ]);
    return { rows, total };
  }

  findRoomCategory(hospitalId: string, id: string, tx?: Tx): Promise<RoomCategoryRow | null> {
    return (tx ?? this.prisma).roomCategory.findFirst({ where: { id, hospitalId }, select: ROOM_CATEGORY_SELECT });
  }

  createRoomCategory(hospitalId: string, data: { code: string; name: string }, tx: Tx): Promise<RoomCategoryRow> {
    return tx.roomCategory.create({ data: { hospitalId, ...data }, select: ROOM_CATEGORY_SELECT });
  }

  updateRoomCategory(hospitalId: string, id: string, data: { name?: string; isActive?: boolean }, tx: Tx): Promise<RoomCategoryRow> {
    return tx.roomCategory.update({ where: { id, hospitalId }, data, select: ROOM_CATEGORY_SELECT });
  }

  async listWards(hospitalId: string, filter: MasterFilter, page: PageRequest): Promise<{ rows: WardRow[]; total: number }> {
    const where: Prisma.WardWhereInput = {
      hospitalId,
      ...(filter.includeInactive === true ? {} : { isActive: true }),
      ...textFilter(filter.q),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.ward.findMany({ where, select: WARD_SELECT, orderBy: { code: 'asc' }, ...pageArgs(page) }),
      this.prisma.ward.count({ where }),
    ]);
    return { rows, total };
  }

  findWard(hospitalId: string, id: string, tx?: Tx): Promise<WardRow | null> {
    return (tx ?? this.prisma).ward.findFirst({ where: { id, hospitalId }, select: WARD_SELECT });
  }

  /** The hospital's branch for new wards. Phase 1 runs one branch per hospital. */
  async defaultBranchId(hospitalId: string): Promise<string | null> {
    const branch = await this.prisma.branch.findFirst({
      where: { hospitalId, isActive: true },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return branch?.id ?? null;
  }

  createWard(
    hospitalId: string,
    data: { branchId: string; code: string; name: string; roomCategoryId: string | null },
    tx: Tx,
  ): Promise<WardRow> {
    return tx.ward.create({ data: { hospitalId, ...data }, select: WARD_SELECT });
  }

  updateWard(
    hospitalId: string,
    id: string,
    data: { name?: string; roomCategoryId?: string | null; isActive?: boolean },
    tx: Tx,
  ): Promise<WardRow> {
    return tx.ward.update({ where: { id, hospitalId }, data, select: WARD_SELECT });
  }

  listBeds(hospitalId: string, wardId: string): Promise<BedRow[]> {
    return this.prisma.bed.findMany({ where: { hospitalId, wardId }, select: BED_SELECT, orderBy: { code: 'asc' } });
  }

  findBed(hospitalId: string, id: string, tx?: Tx): Promise<BedRow | null> {
    return (tx ?? this.prisma).bed.findFirst({ where: { id, hospitalId }, select: BED_SELECT });
  }

  createBed(hospitalId: string, wardId: string, code: string, tx: Tx): Promise<BedRow> {
    return tx.bed.create({ data: { hospitalId, wardId, code }, select: BED_SELECT });
  }

  /**
   * Retires or restores a bed. An occupied bed is never retired: the condition sits in the UPDATE
   * itself, so a patient placed at the same moment cannot slip past a separate check.
   * Returns null when the bed is occupied.
   */
  async updateBed(hospitalId: string, id: string, data: { isActive: boolean }, tx: Tx): Promise<BedRow | null> {
    const where = data.isActive ? { id, hospitalId } : { id, hospitalId, NOT: { status: 'occupied' as const } };
    const { count } = await tx.bed.updateMany({ where, data });
    return count === 0 ? null : tx.bed.findFirst({ where: { id, hospitalId }, select: BED_SELECT });
  }

  countOccupiedBeds(hospitalId: string, wardId: string, tx: Tx): Promise<number> {
    return tx.bed.count({ where: { hospitalId, wardId, status: 'occupied' } });
  }
}
