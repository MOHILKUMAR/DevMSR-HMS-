import { Injectable } from '@nestjs/common';
import type { ChargeStatus, InvoiceStatus, Prisma } from '../generated/prisma/client.js';
import { fromDateOnly } from '../common/dates.js';
import { pageArgs, type PageRequest } from '../common/http/pagination.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Tx } from '../common/prisma/tx.js';

export const CHARGE_SELECT = {
  id: true,
  patientId: true,
  serviceItemId: true,
  description: true,
  serviceDate: true,
  quantity: true,
  unitRatePaise: true,
  taxRateBp: true,
  amountPaise: true,
  status: true,
  invoiceId: true,
  createdAt: true,
} as const satisfies Prisma.ChargeSelect;
export type ChargeRow = Prisma.ChargeGetPayload<{ select: typeof CHARGE_SELECT }>;

const LINE_SELECT = {
  chargeId: true,
  lineNo: true,
  description: true,
  serviceDate: true,
  quantity: true,
  unitRatePaise: true,
  amountPaise: true,
  discountPaise: true,
  taxablePaise: true,
  taxRateBp: true,
  cgstPaise: true,
  sgstPaise: true,
  totalPaise: true,
} as const satisfies Prisma.InvoiceLineSelect;

const PATIENT_SELECT = {
  id: true,
  uhid: true,
  fullName: true,
  sex: true,
  dateOfBirth: true,
  phone: true,
  addressLine: true,
  city: true,
  state: true,
  pincode: true,
} as const satisfies Prisma.PatientSelect;
export type BillPatientRow = Prisma.PatientGetPayload<{ select: typeof PATIENT_SELECT }>;

export const INVOICE_SELECT = {
  id: true,
  patientId: true,
  status: true,
  number: true,
  financialYear: true,
  subtotalPaise: true,
  discountPaise: true,
  taxablePaise: true,
  cgstPaise: true,
  sgstPaise: true,
  roundOffPaise: true,
  totalPaise: true,
  issuerSnapshot: true,
  patientSnapshot: true,
  createdById: true,
  issuedById: true,
  issuedAt: true,
  createdAt: true,
  patient: { select: PATIENT_SELECT },
  lines: { select: LINE_SELECT, orderBy: { lineNo: 'asc' } },
} as const satisfies Prisma.InvoiceSelect;
export type InvoiceRow = Prisma.InvoiceGetPayload<{ select: typeof INVOICE_SELECT }>;

const SUMMARY_SELECT = {
  id: true,
  status: true,
  number: true,
  patientId: true,
  totalPaise: true,
  issuedAt: true,
  createdAt: true,
  patient: { select: { uhid: true, fullName: true } },
} as const satisfies Prisma.InvoiceSelect;
export type InvoiceSummaryRow = Prisma.InvoiceGetPayload<{ select: typeof SUMMARY_SELECT }>;

const ISSUER_SELECT = {
  name: true,
  addressLine: true,
  city: true,
  state: true,
  pincode: true,
  phone: true,
  email: true,
  gstin: true,
} as const satisfies Prisma.HospitalSelect;
export type IssuerRow = Prisma.HospitalGetPayload<{ select: typeof ISSUER_SELECT }>;

export interface NewLine {
  chargeId: string;
  lineNo: number;
  description: string;
  serviceDate: Date;
  quantity: number;
  unitRatePaise: bigint;
  amountPaise: bigint;
  discountPaise: bigint;
  taxablePaise: bigint;
  taxRateBp: number;
  cgstPaise: bigint;
  sgstPaise: bigint;
  totalPaise: bigint;
}

/** Money counted on a bill. What is owed is total - credited - paid + refunded. */
export interface BillBalance {
  paid: bigint;
  credited: bigint;
  refunded: bigint;
}
export const NO_MONEY: Readonly<BillBalance> = { paid: 0n, credited: 0n, refunded: 0n };

export interface NewInvoiceTotals {
  subtotalPaise: bigint;
  discountPaise: bigint;
  taxablePaise: bigint;
  cgstPaise: bigint;
  sgstPaise: bigint;
  roundOffPaise: bigint;
  totalPaise: bigint;
}

/** Charges and bills of one hospital. Every query filters by hospital_id. */
@Injectable()
export class BillingRepository {
  constructor(private readonly prisma: PrismaService) {}

  findPatient(hospitalId: string, id: string, tx?: Tx): Promise<BillPatientRow | null> {
    return (tx ?? this.prisma).patient.findFirst({ where: { id, hospitalId }, select: PATIENT_SELECT });
  }

  issuer(hospitalId: string, tx?: Tx): Promise<IssuerRow> {
    return (tx ?? this.prisma).hospital.findUniqueOrThrow({ where: { id: hospitalId }, select: ISSUER_SELECT });
  }

  async userNames(hospitalId: string, ids: readonly (string | null)[]): Promise<Map<string, string>> {
    const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
    if (wanted.length === 0) return new Map();
    const users = await this.prisma.user.findMany({ where: { id: { in: wanted }, hospitalId }, select: { id: true, displayName: true } });
    return new Map(users.map((user) => [user.id, user.displayName]));
  }

  /** The service item, and its rate covering `date` (not cancelled), if any. */
  findItemAndRate(hospitalId: string, serviceItemId: string, date: string) {
    const day = fromDateOnly(date);
    return this.prisma.serviceItem.findFirst({
      where: { id: serviceItemId, hospitalId },
      select: {
        id: true,
        name: true,
        isActive: true,
        rates: {
          where: { cancelledAt: null, effectiveFrom: { lte: day }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }] },
          select: { id: true, ratePaise: true, taxRateBp: true },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
        },
      },
    });
  }

  createCharge(data: Prisma.ChargeUncheckedCreateInput, tx: Tx): Promise<ChargeRow> {
    return tx.charge.create({ data, select: CHARGE_SELECT });
  }

  listCharges(hospitalId: string, patientId: string, status?: ChargeStatus): Promise<ChargeRow[]> {
    return this.prisma.charge.findMany({
      where: { hospitalId, patientId, ...(status === undefined ? {} : { status }) },
      select: CHARGE_SELECT,
      orderBy: [{ serviceDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** Locks the chosen charges until the transaction ends, so two bills can never take the same one. */
  async lockCharges(hospitalId: string, ids: readonly string[], tx: Tx): Promise<ChargeRow[]> {
    await tx.$queryRaw`SELECT id FROM charges WHERE hospital_id = ${hospitalId}::uuid AND id = ANY(${[...ids]}::uuid[]) FOR UPDATE`;
    return tx.charge.findMany({
      where: { hospitalId, id: { in: [...ids] } },
      select: CHARGE_SELECT,
      orderBy: [{ serviceDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  createDraft(
    hospitalId: string,
    patientId: string,
    createdById: string,
    totals: NewInvoiceTotals,
    lines: readonly NewLine[],
    tx: Tx,
  ): Promise<InvoiceRow> {
    return tx.invoice.create({
      data: {
        hospitalId,
        patientId,
        createdById,
        ...totals,
        // Each line's hospital_id comes from the bill itself, through the shared (hospital_id, invoice_id) key.
        lines: { create: [...lines] },
      },
      select: INVOICE_SELECT,
    });
  }

  async attachCharges(hospitalId: string, ids: readonly string[], invoiceId: string, tx: Tx): Promise<number> {
    const { count } = await tx.charge.updateMany({
      where: { hospitalId, id: { in: [...ids] }, status: 'pending', invoiceId: null },
      data: { invoiceId },
    });
    return count;
  }

  /** Locks the bill row until the transaction ends: issuing, discarding and paying run one at a time. */
  async lockInvoice(hospitalId: string, id: string, tx: Tx): Promise<InvoiceRow | null> {
    await tx.$queryRaw`SELECT id FROM invoices WHERE hospital_id = ${hospitalId}::uuid AND id = ${id}::uuid FOR UPDATE`;
    return tx.invoice.findFirst({ where: { id, hospitalId }, select: INVOICE_SELECT });
  }

/** A discount on this draft is waiting for approval: the draft is neither issued nor discarded until it is decided. */
  async hasPendingDiscount(invoiceId: string, tx: Tx): Promise<boolean> {
    return (await tx.approvalRequest.count({ where: { invoiceId, kind: 'discount', status: 'pending' } })) > 0;
  }

  findInvoice(hospitalId: string, id: string): Promise<InvoiceRow | null> {
    return this.prisma.invoice.findFirst({ where: { id, hospitalId }, select: INVOICE_SELECT });
  }

  issue(
    id: string,
    data: { number: string; financialYear: string; issuedById: string; issuedAt: Date; issuerSnapshot: Prisma.InputJsonValue; patientSnapshot: Prisma.InputJsonValue },
    tx: Tx,
  ): Promise<InvoiceRow> {
    return tx.invoice.update({ where: { id }, data: { status: 'issued', ...data }, select: INVOICE_SELECT });
  }

  async markChargesBilled(invoiceId: string, tx: Tx): Promise<void> {
    await tx.charge.updateMany({ where: { invoiceId, status: 'pending' }, data: { status: 'billed' } });
  }

  discard(id: string, discardedById: string, discardedAt: Date, tx: Tx): Promise<InvoiceRow> {
    return tx.invoice.update({ where: { id }, data: { status: 'discarded', discardedById, discardedAt }, select: INVOICE_SELECT });
  }

  async releaseCharges(invoiceId: string, tx: Tx): Promise<void> {
    await tx.charge.updateMany({ where: { invoiceId, status: 'pending' }, data: { invoiceId: null } });
  }

  /**
   * The money counted on each bill: payments set against it (void receipts left out), credit notes,
   * and refunds of what was overpaid. Bills with none of these are missing from the map.
   */
  async balances(ids: readonly string[], tx?: Tx): Promise<Map<string, BillBalance>> {
    if (ids.length === 0) return new Map();
    const db = tx ?? this.prisma;
    const [paid, credited, refunded] = await Promise.all([
      db.receiptAllocation.groupBy({
        by: ['invoiceId'],
        where: { invoiceId: { in: [...ids] }, receipt: { voidRecord: null } },
        _sum: { amountPaise: true },
      }),
      db.creditNote.groupBy({ by: ['invoiceId'], where: { invoiceId: { in: [...ids] } }, _sum: { totalPaise: true } }),
      db.refund.groupBy({ by: ['invoiceId'], where: { invoiceId: { in: [...ids] } }, _sum: { amountPaise: true } }),
    ]);
    const balances = new Map<string, BillBalance>();
    const entry = (id: string) => {
      const found = balances.get(id) ?? { ...NO_MONEY };
      balances.set(id, found);
      return found;
    };
    for (const row of paid) entry(row.invoiceId).paid = row._sum.amountPaise ?? 0n;
    for (const row of credited) entry(row.invoiceId).credited = row._sum.totalPaise ?? 0n;
    for (const row of refunded) if (row.invoiceId !== null) entry(row.invoiceId).refunded = row._sum.amountPaise ?? 0n;
    return balances;
  }

  async listInvoices(
    hospitalId: string,
    filter: { status?: InvoiceStatus | undefined; patientId?: string | undefined },
    page: PageRequest,
  ): Promise<{ rows: InvoiceSummaryRow[]; total: number }> {
    const where: Prisma.InvoiceWhereInput = {
      hospitalId,
      ...(filter.status === undefined ? { NOT: { status: 'discarded' } } : { status: filter.status }),
      ...(filter.patientId === undefined ? {} : { patientId: filter.patientId }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({ where, select: SUMMARY_SELECT, orderBy: { createdAt: 'desc' }, ...pageArgs(page) }),
      this.prisma.invoice.count({ where }),
    ]);
    return { rows, total };
  }

  pendingCharges(hospitalId: string, patientId: string) {
    return this.prisma.charge.aggregate({
      where: { hospitalId, patientId, status: 'pending', invoiceId: null },
      _count: { _all: true },
      _sum: { amountPaise: true },
    });
  }

  patientInvoices(hospitalId: string, patientId: string): Promise<InvoiceSummaryRow[]> {
    return this.prisma.invoice.findMany({
      where: { hospitalId, patientId, NOT: { status: 'discarded' } },
      select: SUMMARY_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  patientReceipts(hospitalId: string, patientId: string) {
    return this.prisma.receipt.findMany({
      where: { hospitalId, patientId },
      select: {
        id: true,
        number: true,
        purpose: true,
        mode: true,
        amountPaise: true,
        createdAt: true,
        allocations: { select: { amountPaise: true } },
        refunds: { select: { amountPaise: true } },
        voidRecord: { select: { createdAt: true } },
        shift: { select: { closedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  patientCreditNotes(hospitalId: string, patientId: string) {
    return this.prisma.creditNote.findMany({
      where: { hospitalId, patientId },
      select: { id: true, approvalRequestId: true, number: true, invoiceId: true, totalPaise: true, createdAt: true, invoice: { select: { number: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  patientRefunds(hospitalId: string, patientId: string) {
    return this.prisma.refund.findMany({
      where: { hospitalId, patientId },
      select: { id: true, approvalRequestId: true, number: true, mode: true, amountPaise: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
