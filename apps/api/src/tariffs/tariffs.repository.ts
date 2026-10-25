import { Injectable } from '@nestjs/common';
import type { Prisma, ServiceKind } from '../generated/prisma/client.js';
import { fromDateOnly } from '../common/dates.js';
import { pageArgs, type PageRequest } from '../common/http/pagination.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Tx } from '../common/prisma/tx.js';

const RATE_SELECT = {
  id: true,
  ratePaise: true,
  taxRateBp: true,
  effectiveFrom: true,
  effectiveTo: true,
  createdAt: true,
  cancelledAt: true,
  cancelReason: true,
} as const satisfies Prisma.TariffRateSelect;
export type TariffRateRow = Prisma.TariffRateGetPayload<{ select: typeof RATE_SELECT }>;

/** The rate covering `today`: started on or before it, not yet ended, not cancelled. */
function rateOn(today: string): Prisma.TariffRateWhereInput {
  const day = fromDateOnly(today);
  return { cancelledAt: null, effectiveFrom: { lte: day }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }] };
}

function serviceItemSelect(today: string) {
  return {
    id: true,
    code: true,
    name: true,
    kind: true,
    doctorId: true,
    roomCategoryId: true,
    isActive: true,
    doctor: { select: { fullName: true } },
    roomCategory: { select: { name: true } },
    rates: { where: rateOn(today), select: RATE_SELECT, orderBy: { effectiveFrom: 'desc' }, take: 1 },
  } as const satisfies Prisma.ServiceItemSelect;
}

export type ServiceItemRow = Prisma.ServiceItemGetPayload<{ select: ReturnType<typeof serviceItemSelect> }>;

export interface ServiceItemFilter {
  q?: string | undefined;
  includeInactive?: boolean | undefined;
  kind?: ServiceKind | undefined;
  doctorId?: string | undefined;
}

/** Service items and their dated rates, for one hospital. */
@Injectable()
export class TariffsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listServiceItems(
    hospitalId: string,
    filter: ServiceItemFilter,
    page: PageRequest,
    today: string,
  ): Promise<{ rows: ServiceItemRow[]; total: number }> {
    const where: Prisma.ServiceItemWhereInput = {
      hospitalId,
      ...(filter.includeInactive === true ? {} : { isActive: true }),
      ...(filter.kind === undefined ? {} : { kind: filter.kind }),
      ...(filter.doctorId === undefined ? {} : { doctorId: filter.doctorId }),
      ...(filter.q === undefined || filter.q === ''
        ? {}
        : { OR: [{ code: { contains: filter.q.toUpperCase() } }, { name: { contains: filter.q, mode: 'insensitive' } }] }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.serviceItem.findMany({
        where,
        select: serviceItemSelect(today),
        orderBy: [{ kind: 'asc' }, { name: 'asc' }],
        ...pageArgs(page),
      }),
      this.prisma.serviceItem.count({ where }),
    ]);
    return { rows, total };
  }

  findServiceItem(hospitalId: string, id: string, today: string, tx?: Tx): Promise<ServiceItemRow | null> {
    return (tx ?? this.prisma).serviceItem.findFirst({ where: { id, hospitalId }, select: serviceItemSelect(today) });
  }

  createServiceItem(
    hospitalId: string,
    data: { code: string; name: string; kind: ServiceKind; doctorId: string | null; roomCategoryId: string | null },
    today: string,
    tx: Tx,
  ): Promise<ServiceItemRow> {
    return tx.serviceItem.create({ data: { hospitalId, ...data }, select: serviceItemSelect(today) });
  }

  updateServiceItem(hospitalId: string, id: string, data: { name?: string; isActive?: boolean }, today: string, tx: Tx): Promise<ServiceItemRow> {
    return tx.serviceItem.update({ where: { id, hospitalId }, data, select: serviceItemSelect(today) });
  }

  async activeDoctorExists(hospitalId: string, id: string): Promise<boolean> {
    return (await this.prisma.doctor.count({ where: { id, hospitalId, isActive: true } })) === 1;
  }

  async activeRoomCategoryExists(hospitalId: string, id: string): Promise<boolean> {
    return (await this.prisma.roomCategory.count({ where: { id, hospitalId, isActive: true } })) === 1;
  }

  /** Locks the service item row so two rate changes for the same item run one after the other. */
  async lockServiceItem(hospitalId: string, id: string, tx: Tx): Promise<void> {
    await tx.$queryRaw`SELECT id FROM service_items WHERE id = ${id}::uuid AND hospital_id = ${hospitalId}::uuid FOR UPDATE`;
  }

  listRates(hospitalId: string, serviceItemId: string): Promise<TariffRateRow[]> {
    return this.prisma.tariffRate.findMany({
      where: { hospitalId, serviceItemId },
      select: RATE_SELECT,
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  /** The latest rate in force or scheduled: the one without an end date. Cancelled rates do not count. */
  openRate(hospitalId: string, serviceItemId: string, tx: Tx): Promise<TariffRateRow | null> {
    return tx.tariffRate.findFirst({ where: { hospitalId, serviceItemId, effectiveTo: null, cancelledAt: null }, select: RATE_SELECT });
  }

  findRate(hospitalId: string, serviceItemId: string, id: string, tx: Tx): Promise<TariffRateRow | null> {
    return tx.tariffRate.findFirst({ where: { id, hospitalId, serviceItemId }, select: RATE_SELECT });
  }

  /** The rate that ends on `effectiveTo`, if any: the one a cancelled rate was going to replace. */
  rateEndingOn(hospitalId: string, serviceItemId: string, effectiveTo: string, tx: Tx): Promise<TariffRateRow | null> {
    return tx.tariffRate.findFirst({
      where: { hospitalId, serviceItemId, cancelledAt: null, effectiveTo: fromDateOnly(effectiveTo) },
      select: RATE_SELECT,
    });
  }

  cancelRate(id: string, data: { cancelledAt: Date; cancelledById: string; cancelReason: string }, tx: Tx): Promise<TariffRateRow> {
    return tx.tariffRate.update({ where: { id }, data, select: RATE_SELECT });
  }

  async reopenRate(id: string, tx: Tx): Promise<void> {
    await tx.tariffRate.update({ where: { id }, data: { effectiveTo: null }, select: { id: true } });
  }

  async closeRate(id: string, effectiveTo: string, tx: Tx): Promise<void> {
    await tx.tariffRate.update({ where: { id }, data: { effectiveTo: fromDateOnly(effectiveTo) }, select: { id: true } });
  }

  insertRate(
    data: { hospitalId: string; serviceItemId: string; ratePaise: bigint; taxRateBp: number; effectiveFrom: string; createdById: string },
    tx: Tx,
  ): Promise<TariffRateRow> {
    return tx.tariffRate.create({
      data: { ...data, effectiveFrom: fromDateOnly(data.effectiveFrom) },
      select: RATE_SELECT,
    });
  }
}
