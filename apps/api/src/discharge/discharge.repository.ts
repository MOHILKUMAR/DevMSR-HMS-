import { Injectable } from '@nestjs/common';
import { toDateOnly } from '../common/dates.js';
import { pageArgs, type PageRequest } from '../common/http/pagination.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Tx } from '../common/prisma/tx.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ADMISSION_SELECT } from '../ipd/ipd.repository.js';

export const DISCHARGE_SELECT = {
  id: true,
  admissionId: true,
  fitAt: true,
  fitById: true,
  fitNote: true,
  completedAt: true,
  completedById: true,
  admission: { select: ADMISSION_SELECT },
  // The latest clearance is the one that counts.
  clearances: { select: { clearedAt: true, clearedById: true, duePaise: true, approvalRequestId: true }, orderBy: { clearedAt: 'desc' }, take: 1 },
  summary: { select: { draftedById: true, draftedAt: true, signedById: true, signedAt: true } },
  approvalRequests: { where: { status: 'pending', kind: 'clearance_dues' }, select: { id: true }, take: 1 },
} as const satisfies Prisma.DischargeSelect;
export type DischargeRow = Prisma.DischargeGetPayload<{ select: typeof DISCHARGE_SELECT }>;

const SUMMARY_DOCUMENT_SELECT = {
  id: true,
  completedAt: true,
  admission: {
    select: {
      number: true,
      admittedAt: true,
      patientId: true,
      doctor: { select: { fullName: true, department: { select: { name: true } } } },
      assignments: { select: { bed: { select: { ward: { select: { name: true } } } } }, orderBy: { startedAt: 'desc' }, take: 1 },
    },
  },
  summary: {
    select: {
      diagnosis: true,
      courseInHospital: true,
      conditionAtDischarge: true,
      medications: true,
      advice: true,
      followUpDate: true,
      draftedById: true,
      draftedAt: true,
      signedById: true,
      signedAt: true,
    },
  },
} as const satisfies Prisma.DischargeSelect;
export type SummaryDocumentRow = Prisma.DischargeGetPayload<{ select: typeof SUMMARY_DOCUMENT_SELECT }>;

export interface SummaryContent {
  diagnosis: string;
  courseInHospital: string;
  conditionAtDischarge: string;
  medications: string | null;
  advice: string | null;
  followUpDate: Date | null;
}

/** Discharges, their billing clearances and summaries. Every query filters by hospital_id. */
@Injectable()
export class DischargeRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The doctor record linked to a login, for "only the treating doctor" checks. */
  doctorOfUser(hospitalId: string, userId: string) {
    return this.prisma.doctor.findFirst({ where: { hospitalId, userId, isActive: true }, select: { id: true } });
  }

  async create(hospitalId: string, data: { admissionId: string; fitAt: Date; fitById: string; fitNote: string | null }, tx: Tx): Promise<{ id: string }> {
    return tx.discharge.create({ data: { hospitalId, ...data }, select: { id: true } });
  }

  find(hospitalId: string, id: string, tx?: Tx): Promise<DischargeRow | null> {
    return (tx ?? this.prisma).discharge.findFirst({ where: { id, hospitalId }, select: DISCHARGE_SELECT });
  }

  /** Locks the discharge until the transaction ends, so two desks cannot run the same step at once. */
  async lock(hospitalId: string, id: string, tx: Tx): Promise<DischargeRow | null> {
    await tx.$queryRaw`SELECT id FROM discharges WHERE hospital_id = ${hospitalId}::uuid AND id = ${id}::uuid FOR UPDATE`;
    return this.find(hospitalId, id, tx);
  }

  async list(hospitalId: string, filter: { completed?: boolean | undefined }, page: PageRequest): Promise<{ rows: DischargeRow[]; total: number }> {
    const where: Prisma.DischargeWhereInput = {
      hospitalId,
      ...(filter.completed === undefined ? {} : { completedAt: filter.completed ? { not: null } : null }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.discharge.findMany({ where, select: DISCHARGE_SELECT, orderBy: { fitAt: 'desc' }, ...pageArgs(page) }),
      this.prisma.discharge.count({ where }),
    ]);
    return { rows, total };
  }

  // The account.

  /** Charges not on an issued bill: unbilled, or only on a draft. */
  async unbilled(hospitalId: string, patientId: string, tx?: Tx): Promise<{ count: number; paise: bigint }> {
    const result = await (tx ?? this.prisma).charge.aggregate({
      where: { hospitalId, patientId, status: 'pending' },
      _count: { _all: true },
      _sum: { amountPaise: true },
    });
    return { count: result._count._all, paise: result._sum.amountPaise ?? 0n };
  }

  /** Charges a new bill can take: unbilled and on no draft. */
  async freeChargeIds(hospitalId: string, patientId: string, tx: Tx): Promise<string[]> {
    const rows = await tx.charge.findMany({
      where: { hospitalId, patientId, status: 'pending', invoiceId: null },
      select: { id: true },
      orderBy: [{ serviceDate: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => row.id);
  }

  issuedBills(hospitalId: string, patientId: string, tx?: Tx) {
    return (tx ?? this.prisma).invoice.findMany({ where: { hospitalId, patientId, status: 'issued' }, select: { id: true, totalPaise: true } });
  }

  async postedDays(admissionId: string, tx?: Tx): Promise<{ chargeDate: string; kind: string }[]> {
    const rows = await (tx ?? this.prisma).dailyCharge.findMany({ where: { admissionId }, select: { chargeDate: true, kind: true } });
    return rows.map((row) => ({ chargeDate: toDateOnly(row.chargeDate), kind: row.kind }));
  }

  // Clearance and completion.

  async createClearance(hospitalId: string, data: { dischargeId: string; clearedAt: Date; clearedById: string; duePaise: bigint; approvalRequestId: string | null }, tx: Tx): Promise<void> {
    await tx.dischargeClearance.create({ data: { hospitalId, ...data }, select: { id: true } });
  }

  async complete(id: string, data: { completedAt: Date; completedById: string }, tx: Tx): Promise<void> {
    await tx.discharge.update({ where: { id }, data, select: { id: true } });
  }

  async dischargeAdmission(id: string, dischargedAt: Date, tx: Tx): Promise<void> {
    await tx.admission.update({ where: { id }, data: { status: 'discharged', dischargedAt }, select: { id: true } });
  }

  // The summary.

  async saveSummary(hospitalId: string, dischargeId: string, content: SummaryContent, draftedById: string, draftedAt: Date, tx: Tx): Promise<void> {
    await tx.dischargeSummary.upsert({
      where: { hospitalId_dischargeId: { hospitalId, dischargeId } },
      create: { hospitalId, dischargeId, ...content, draftedById, draftedAt },
      update: { ...content, draftedById, draftedAt },
      select: { id: true },
    });
  }

  async signSummary(hospitalId: string, dischargeId: string, signedById: string, signedAt: Date, tx: Tx): Promise<void> {
    await tx.dischargeSummary.update({ where: { hospitalId_dischargeId: { hospitalId, dischargeId } }, data: { signedById, signedAt }, select: { id: true } });
  }

  summaryDocument(hospitalId: string, id: string): Promise<SummaryDocumentRow | null> {
    return this.prisma.discharge.findFirst({ where: { id, hospitalId }, select: SUMMARY_DOCUMENT_SELECT });
  }
}
