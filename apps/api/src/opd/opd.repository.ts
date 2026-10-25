import { Injectable } from '@nestjs/common';
import type { OpdVisitStatus, Prisma } from '../generated/prisma/client.js';
import { fromDateOnly } from '../common/dates.js';
import { pageArgs, type PageRequest } from '../common/http/pagination.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Tx } from '../common/prisma/tx.js';

export const VISIT_SELECT = {
  id: true,
  patientId: true,
  doctorId: true,
  serviceItemId: true,
  visitDate: true,
  tokenNumber: true,
  status: true,
  quotedFeePaise: true,
  feeInvoiceId: true,
  createdById: true,
  createdAt: true,
  paidAt: true,
  calledAt: true,
  completedAt: true,
  cancelledAt: true,
  cancelReason: true,
  patient: { select: { id: true, uhid: true, fullName: true, sex: true, dateOfBirth: true } },
  doctor: { select: { id: true, fullName: true, userId: true, department: { select: { name: true } } } },
  feeInvoice: { select: { number: true } },
} as const satisfies Prisma.OpdVisitSelect;
export type VisitRow = Prisma.OpdVisitGetPayload<{ select: typeof VISIT_SELECT }>;

const CONSULTATION_SELECT = {
  ...VISIT_SELECT,
  complaints: true,
  findings: true,
  diagnosis: true,
  advice: true,
  followUpDate: true,
  admissionAdvised: true,
  notesUpdatedAt: true,
  orders: {
    select: { createdAt: true, charge: { select: { id: true, description: true, quantity: true, amountPaise: true } } },
    orderBy: { createdAt: 'asc' },
  },
} as const satisfies Prisma.OpdVisitSelect;
export type ConsultationRow = Prisma.OpdVisitGetPayload<{ select: typeof CONSULTATION_SELECT }>;

/** The visits still open: a second open token for the same patient and doctor on one day is refused. */
const OPEN: OpdVisitStatus[] = ['awaiting_payment', 'waiting', 'with_doctor'];

/** OPD visits and orders of one hospital. Every query filters by hospital_id. */
@Injectable()
export class OpdRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** An active doctor of the hospital, with their active consultation item and its rate on `date`. */
  doctorForToken(hospitalId: string, doctorId: string, date: string) {
    const day = fromDateOnly(date);
    return this.prisma.doctor.findFirst({
      where: { id: doctorId, hospitalId, isActive: true },
      select: {
        id: true,
        serviceItems: {
          where: { kind: 'consultation', isActive: true },
          select: {
            id: true,
            rates: {
              where: { cancelledAt: null, effectiveFrom: { lte: day }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }] },
              select: { id: true, ratePaise: true, taxRateBp: true },
              orderBy: { effectiveFrom: 'desc' },
              take: 1,
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  /** The doctor record linked to a user login, if any. */
  doctorOfUser(hospitalId: string, userId: string) {
    return this.prisma.doctor.findFirst({ where: { hospitalId, userId, isActive: true }, select: { id: true, fullName: true } });
  }

  hasOpenVisit(hospitalId: string, patientId: string, doctorId: string, date: string, tx: Tx): Promise<number> {
    return tx.opdVisit.count({ where: { hospitalId, patientId, doctorId, visitDate: fromDateOnly(date), status: { in: OPEN } } });
  }

  createVisit(data: Prisma.OpdVisitUncheckedCreateInput, tx: Tx): Promise<VisitRow> {
    return tx.opdVisit.create({ data, select: VISIT_SELECT });
  }

  findVisit(hospitalId: string, id: string, tx?: Tx): Promise<VisitRow | null> {
    return (tx ?? this.prisma).opdVisit.findFirst({ where: { id, hospitalId }, select: VISIT_SELECT });
  }

  /** Locks the visit until the transaction ends: paying, calling and completing run one at a time. */
  async lockVisit(hospitalId: string, id: string, tx: Tx): Promise<VisitRow | null> {
    await tx.$queryRaw`SELECT id FROM opd_visits WHERE hospital_id = ${hospitalId}::uuid AND id = ${id}::uuid FOR UPDATE`;
    return this.findVisit(hospitalId, id, tx);
  }

  updateVisit(id: string, data: Prisma.OpdVisitUncheckedUpdateInput, tx: Tx): Promise<VisitRow> {
    return tx.opdVisit.update({ where: { id }, data, select: VISIT_SELECT });
  }

  findConsultation(hospitalId: string, id: string): Promise<ConsultationRow | null> {
    return this.prisma.opdVisit.findFirst({ where: { id, hospitalId }, select: CONSULTATION_SELECT });
  }

  async listVisits(
    hospitalId: string,
    filter: { date: string; status?: OpdVisitStatus | undefined; doctorId?: string | undefined },
    page: PageRequest,
  ): Promise<{ rows: VisitRow[]; total: number }> {
    const where: Prisma.OpdVisitWhereInput = {
      hospitalId,
      visitDate: fromDateOnly(filter.date),
      ...(filter.status === undefined ? {} : { status: filter.status }),
      ...(filter.doctorId === undefined ? {} : { doctorId: filter.doctorId }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.opdVisit.findMany({ where, select: VISIT_SELECT, orderBy: { tokenNumber: 'asc' }, ...pageArgs(page) }),
      this.prisma.opdVisit.count({ where }),
    ]);
    return { rows, total };
  }

  /** A doctor's paid visits of the day still to be seen, in token order, and how many are done. */
  async queue(hospitalId: string, doctorId: string, date: string): Promise<{ rows: VisitRow[]; completed: number }> {
    const day = fromDateOnly(date);
    const [rows, completed] = await this.prisma.$transaction([
      this.prisma.opdVisit.findMany({
        where: { hospitalId, doctorId, visitDate: day, status: { in: ['waiting', 'with_doctor'] } },
        select: VISIT_SELECT,
        orderBy: { tokenNumber: 'asc' },
      }),
      this.prisma.opdVisit.count({ where: { hospitalId, doctorId, visitDate: day, status: 'completed' } }),
    ]);
    return { rows, completed };
  }

  /** A service item a doctor may order (not a consultation, room or nursing), with its rate on `date`. */
  orderableItem(hospitalId: string, serviceItemId: string, date: string) {
    const day = fromDateOnly(date);
    return this.prisma.serviceItem.findFirst({
      where: { id: serviceItemId, hospitalId, isActive: true, kind: { notIn: ['consultation', 'room', 'nursing'] } },
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
    });
  }

  async createOrder(hospitalId: string, data: { visitId: string; chargeId: string; orderedById: string }, tx: Tx): Promise<void> {
    await tx.opdOrder.create({ data: { hospitalId, ...data }, select: { id: true } });
  }
}
