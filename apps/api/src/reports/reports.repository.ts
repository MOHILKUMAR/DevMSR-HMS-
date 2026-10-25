import { Injectable } from '@nestjs/common';
import { fromDateOnly } from '../common/dates.js';
import { PrismaService } from '../common/prisma/prisma.service.js';

/** The money and activity of one day, for reports. Every query filters by hospital_id. */
@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  receipts(hospitalId: string, from: Date, to: Date) {
    return this.prisma.receipt.findMany({
      where: { hospitalId, createdAt: { gte: from, lt: to } },
      select: {
        number: true,
        createdAt: true,
        purpose: true,
        mode: true,
        amountPaise: true,
        patient: { select: { uhid: true } },
        shift: { select: { cashierId: true } },
        voidRecord: { select: { id: true } },
        allocations: { select: { invoice: { select: { number: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  refunds(hospitalId: string, from: Date, to: Date) {
    return this.prisma.refund.findMany({
      where: { hospitalId, createdAt: { gte: from, lt: to } },
      select: {
        number: true,
        createdAt: true,
        mode: true,
        amountPaise: true,
        patient: { select: { uhid: true } },
        shift: { select: { cashierId: true } },
        invoice: { select: { number: true } },
        receipt: { select: { number: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  billsIssued(hospitalId: string, from: Date, to: Date) {
    return this.prisma.invoice.findMany({
      where: { hospitalId, status: 'issued', issuedAt: { gte: from, lt: to } },
      select: {
        number: true,
        issuedAt: true,
        taxablePaise: true,
        cgstPaise: true,
        sgstPaise: true,
        roundOffPaise: true,
        totalPaise: true,
        patient: { select: { uhid: true } },
      },
      orderBy: { issuedAt: 'asc' },
    });
  }

  creditNotes(hospitalId: string, from: Date, to: Date) {
    return this.prisma.creditNote.findMany({
      where: { hospitalId, createdAt: { gte: from, lt: to } },
      select: {
        number: true,
        createdAt: true,
        taxablePaise: true,
        cgstPaise: true,
        sgstPaise: true,
        roundOffPaise: true,
        totalPaise: true,
        patient: { select: { uhid: true } },
        invoice: { select: { number: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  opdByStatus(hospitalId: string, date: string) {
    return this.prisma.opdVisit.groupBy({ by: ['status'], where: { hospitalId, visitDate: fromDateOnly(date) }, _count: { _all: true } });
  }

  admissionsBetween(hospitalId: string, from: Date, to: Date): Promise<number> {
    return this.prisma.admission.count({ where: { hospitalId, admittedAt: { gte: from, lt: to } } });
  }

  dischargesBetween(hospitalId: string, from: Date, to: Date): Promise<number> {
    return this.prisma.discharge.count({ where: { hospitalId, completedAt: { gte: from, lt: to } } });
  }

  /** Active beds in active wards, with their state now. */
  beds(hospitalId: string) {
    return this.prisma.bed.findMany({
      where: { hospitalId, isActive: true, ward: { isActive: true } },
      select: { status: true, ward: { select: { name: true } } },
    });
  }
}
