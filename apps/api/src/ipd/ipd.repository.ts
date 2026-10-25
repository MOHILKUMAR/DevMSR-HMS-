import { Injectable } from '@nestjs/common';
import type { AdmissionStatus, BedStatus, DailyChargeKind, Prisma } from '../generated/prisma/client.js';
import { fromDateOnly } from '../common/dates.js';
import { pageArgs, type PageRequest } from '../common/http/pagination.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Tx } from '../common/prisma/tx.js';

const BED_PLACE_SELECT = {
  id: true,
  code: true,
  status: true,
  isActive: true,
  ward: { select: { name: true, isActive: true, roomCategory: { select: { id: true, name: true, minimumAdvancePaise: true } } } },
} as const satisfies Prisma.BedSelect;
export type BedPlaceRow = Prisma.BedGetPayload<{ select: typeof BED_PLACE_SELECT }>;

const ASSIGNMENT_SELECT = {
  id: true,
  bedId: true,
  startedAt: true,
  endedAt: true,
  endReason: true,
  bed: { select: BED_PLACE_SELECT },
} as const satisfies Prisma.BedAssignmentSelect;

export const ADMISSION_SELECT = {
  id: true,
  patientId: true,
  number: true,
  status: true,
  payerType: true,
  reason: true,
  opdVisitId: true,
  admittedAt: true,
  admittedById: true,
  dischargedAt: true,
  minimumAdvancePaise: true,
  depositHeldPaise: true,
  patient: { select: { id: true, uhid: true, fullName: true, sex: true, dateOfBirth: true } },
  doctor: { select: { id: true, fullName: true } },
  assignments: { select: ASSIGNMENT_SELECT, orderBy: { startedAt: 'asc' } },
  discharge: { select: { id: true } },
} as const satisfies Prisma.AdmissionSelect;
export type AdmissionRow = Prisma.AdmissionGetPayload<{ select: typeof ADMISSION_SELECT }>;

const DAILY_SELECT = {
  chargeDate: true,
  kind: true,
  bed: { select: { code: true } },
  charge: { select: { description: true, amountPaise: true } },
} as const satisfies Prisma.DailyChargeSelect;
export type DailyRow = Prisma.DailyChargeGetPayload<{ select: typeof DAILY_SELECT }>;

/** An admission as the room and nursing charges need it: its beds and the days already charged. */
const CHARGING_SELECT = {
  id: true,
  patientId: true,
  admittedAt: true,
  dischargedAt: true,
  assignments: {
    select: { bedId: true, startedAt: true, endedAt: true, bed: { select: { ward: { select: { roomCategoryId: true } } } } },
    orderBy: { startedAt: 'asc' },
  },
  dailyCharges: { select: { chargeDate: true, kind: true } },
} as const satisfies Prisma.AdmissionSelect;
export type ChargingRow = Prisma.AdmissionGetPayload<{ select: typeof CHARGING_SELECT }>;

/** Admissions, bed assignments and the midnight room and nursing charges. Every query filters by hospital_id. */
@Injectable()
export class IpdRepository {
  constructor(private readonly prisma: PrismaService) {}

  activeDoctor(hospitalId: string, id: string) {
    return this.prisma.doctor.findFirst({ where: { id, hospitalId, isActive: true }, select: { id: true } });
  }

  /** Locks the bed until the transaction ends: two admissions to one bed run one at a time. */
  async lockBed(hospitalId: string, id: string, tx: Tx): Promise<BedPlaceRow | null> {
    await tx.$queryRaw`SELECT id FROM beds WHERE hospital_id = ${hospitalId}::uuid AND id = ${id}::uuid FOR UPDATE`;
    return tx.bed.findFirst({ where: { id, hospitalId }, select: BED_PLACE_SELECT });
  }

  setBedStatus(id: string, status: BedStatus, tx: Tx): Promise<BedPlaceRow> {
    return tx.bed.update({ where: { id }, data: { status }, select: BED_PLACE_SELECT });
  }

  openAdmissionCount(hospitalId: string, patientId: string, tx: Tx): Promise<number> {
    return tx.admission.count({ where: { hospitalId, patientId, status: 'admitted' } });
  }

  /** What the patient holds in deposits now: not void, less what was used or refunded. */
  async depositHeld(hospitalId: string, patientId: string, tx?: Tx): Promise<bigint> {
    const deposits = await (tx ?? this.prisma).receipt.findMany({
      where: { hospitalId, patientId, purpose: 'deposit', voidRecord: null },
      select: { amountPaise: true, allocations: { select: { amountPaise: true } }, refunds: { select: { amountPaise: true } } },
    });
    return deposits.reduce(
      (sum, deposit) => sum + deposit.amountPaise - [...deposit.allocations, ...deposit.refunds].reduce((used, part) => used + part.amountPaise, 0n),
      0n,
    );
  }

  /** An OPD visit of this patient where admission was advised, for linking the admission to it. */
  advisedVisit(hospitalId: string, id: string, patientId: string) {
    return this.prisma.opdVisit.findFirst({ where: { id, hospitalId, patientId, admissionAdvised: true }, select: { id: true } });
  }

  createAdmission(data: Prisma.AdmissionUncheckedCreateInput, tx: Tx): Promise<{ id: string }> {
    return tx.admission.create({ data, select: { id: true } });
  }

  async createAssignment(hospitalId: string, data: { admissionId: string; bedId: string; startedAt: Date; createdById: string }, tx: Tx): Promise<void> {
    await tx.bedAssignment.create({ data: { hospitalId, ...data }, select: { id: true } });
  }

  async endAssignment(id: string, data: { endedAt: Date; endReason: 'transfer' | 'discharge'; endedById: string }, tx: Tx): Promise<void> {
    await tx.bedAssignment.update({ where: { id }, data, select: { id: true } });
  }

  findAdmission(hospitalId: string, id: string, tx?: Tx): Promise<AdmissionRow | null> {
    return (tx ?? this.prisma).admission.findFirst({ where: { id, hospitalId }, select: ADMISSION_SELECT });
  }

  /** Locks the admission until the transaction ends: transfers and discharge run one at a time. */
  async lockAdmission(hospitalId: string, id: string, tx: Tx): Promise<AdmissionRow | null> {
    await tx.$queryRaw`SELECT id FROM admissions WHERE hospital_id = ${hospitalId}::uuid AND id = ${id}::uuid FOR UPDATE`;
    return this.findAdmission(hospitalId, id, tx);
  }

  async listAdmissions(hospitalId: string, filter: { status?: AdmissionStatus | undefined }, page: PageRequest): Promise<{ rows: AdmissionRow[]; total: number }> {
    const where: Prisma.AdmissionWhereInput = { hospitalId, ...(filter.status === undefined ? {} : { status: filter.status }) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.admission.findMany({ where, select: ADMISSION_SELECT, orderBy: { admittedAt: 'desc' }, ...pageArgs(page) }),
      this.prisma.admission.count({ where }),
    ]);
    return { rows, total };
  }

  dailyCharges(hospitalId: string, admissionId: string): Promise<DailyRow[]> {
    return this.prisma.dailyCharge.findMany({ where: { hospitalId, admissionId }, select: DAILY_SELECT, orderBy: [{ chargeDate: 'asc' }, { kind: 'asc' }] });
  }

  bedBoard(hospitalId: string) {
    return this.prisma.ward.findMany({
      where: { hospitalId, isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        roomCategory: { select: { id: true, name: true, minimumAdvancePaise: true } },
        beds: {
          where: { isActive: true },
          select: {
            id: true,
            code: true,
            status: true,
            assignments: {
              where: { endedAt: null },
              select: { admission: { select: { id: true, number: true, patient: { select: { fullName: true, uhid: true } } } } },
            },
          },
          orderBy: { code: 'asc' },
        },
      },
      orderBy: { code: 'asc' },
    });
  }

  /** Completed OPD visits since `since` where the doctor advised admission and no admission followed. */
  admissionAdvised(hospitalId: string, since: string) {
    return this.prisma.opdVisit.findMany({
      where: { hospitalId, admissionAdvised: true, status: 'completed', visitDate: { gte: fromDateOnly(since) }, admissions: { none: {} } },
      select: {
        id: true,
        visitDate: true,
        diagnosis: true,
        patient: { select: { id: true, uhid: true, fullName: true } },
        doctor: { select: { id: true, fullName: true } },
      },
      orderBy: [{ visitDate: 'desc' }, { tokenNumber: 'asc' }],
    });
  }

  roomCategoryAdvances(hospitalId: string) {
    return this.prisma.roomCategory.findMany({
      where: { hospitalId },
      select: { id: true, code: true, name: true, isActive: true, minimumAdvancePaise: true },
      orderBy: { name: 'asc' },
    });
  }

  async setMinimumAdvance(hospitalId: string, id: string, minimumAdvancePaise: bigint): Promise<number> {
    const { count } = await this.prisma.roomCategory.updateMany({ where: { id, hospitalId }, data: { minimumAdvancePaise } });
    return count;
  }

  /** Pending charges of the patient posted since admission: what an interim bill shows. */
  stayCharges(hospitalId: string, patientId: string, since: Date) {
    return this.prisma.charge.findMany({
      where: { hospitalId, patientId, status: 'pending', createdAt: { gte: since } },
      select: { description: true, serviceDate: true, quantity: true, unitRatePaise: true, taxRateBp: true, amountPaise: true },
      orderBy: [{ serviceDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  // The midnight job.

  hospitalIds(): Promise<{ id: string }[]> {
    return this.prisma.hospital.findMany({ where: { isActive: true }, select: { id: true } });
  }

  /** Admissions that may still have nights to charge: open ones, and those discharged in the last week. */
  admissionsToCharge(hospitalId: string, dischargedSince: Date): Promise<ChargingRow[]> {
    return this.prisma.admission.findMany({
      where: { hospitalId, OR: [{ status: 'admitted' }, { dischargedAt: { gte: dischargedSince } }] },
      select: CHARGING_SELECT,
    });
  }

  /** One admission with what pricing its days needs, inside the caller's transaction. */
  admissionToCharge(hospitalId: string, id: string, tx: Tx): Promise<ChargingRow | null> {
    return tx.admission.findFirst({ where: { id, hospitalId }, select: CHARGING_SELECT });
  }

  /** The room or nursing service item of a room category, with its rate on `date`. */
  dailyItem(hospitalId: string, kind: DailyChargeKind, roomCategoryId: string, date: string) {
    const day = fromDateOnly(date);
    return this.prisma.serviceItem.findFirst({
      where: { hospitalId, kind, roomCategoryId, isActive: true },
      select: {
        id: true,
        name: true,
        rates: {
          where: { cancelledAt: null, effectiveFrom: { lte: day }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }] },
          select: { id: true, ratePaise: true, taxRateBp: true },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async recordDaily(
    hospitalId: string,
    data: { admissionId: string; chargeDate: string; kind: DailyChargeKind; chargeId: string; bedId: string; roomCategoryId: string },
    tx: Tx,
  ): Promise<void> {
    await tx.dailyCharge.create({ data: { hospitalId, ...data, chargeDate: fromDateOnly(data.chargeDate) }, select: { id: true } });
  }
}
