import { Injectable } from '@nestjs/common';
import type { ApprovalKind, ApprovalStatus, PaymentMode, Prisma } from '../generated/prisma/client.js';
import { pageArgs, type PageRequest } from '../common/http/pagination.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Tx } from '../common/prisma/tx.js';

export const REQUEST_SELECT = {
  id: true,
  kind: true,
  status: true,
  patientId: true,
  invoiceId: true,
  receiptId: true,
  dischargeId: true,
  amountPaise: true,
  reason: true,
  details: true,
  requestedById: true,
  requestedAt: true,
  decidedById: true,
  decidedAt: true,
  decisionNote: true,
  resultInvoiceId: true,
  patient: { select: { id: true, uhid: true, fullName: true } },
  invoice: { select: { number: true } },
  receipt: { select: { number: true } },
  creditNote: { select: { id: true, number: true, totalPaise: true } },
  refund: { select: { id: true, number: true, createdAt: true } },
} as const satisfies Prisma.ApprovalRequestSelect;
export type RequestRow = Prisma.ApprovalRequestGetPayload<{ select: typeof REQUEST_SELECT }>;

/** A receipt as a void or a deposit refund needs it: what is left on it, and whether its shift is open. */
const RECEIPT_STATE_SELECT = {
  id: true,
  patientId: true,
  purpose: true,
  mode: true,
  amountPaise: true,
  voidRecord: { select: { id: true } },
  shift: { select: { closedAt: true } },
  allocations: { select: { amountPaise: true } },
  refunds: { select: { amountPaise: true } },
} as const satisfies Prisma.ReceiptSelect;
export type ReceiptStateRow = Prisma.ReceiptGetPayload<{ select: typeof RECEIPT_STATE_SELECT }>;

const CREDIT_NOTE_SELECT = {
  id: true,
  approvalRequestId: true,
  number: true,
  invoiceId: true,
  wholeBill: true,
  taxablePaise: true,
  cgstPaise: true,
  sgstPaise: true,
  roundOffPaise: true,
  totalPaise: true,
  approvedById: true,
  createdAt: true,
  invoice: { select: { number: true, issuerSnapshot: true, patientSnapshot: true } },
  approvalRequest: { select: { reason: true, requestedById: true } },
  lines: {
    select: { lineNo: true, description: true, quantity: true, taxablePaise: true, cgstPaise: true, sgstPaise: true, totalPaise: true },
    orderBy: { lineNo: 'asc' },
  },
} as const satisfies Prisma.CreditNoteSelect;
export type CreditNoteRow = Prisma.CreditNoteGetPayload<{ select: typeof CREDIT_NOTE_SELECT }>;

const REFUND_SELECT = {
  id: true,
  approvalRequestId: true,
  number: true,
  mode: true,
  amountPaise: true,
  reference: true,
  bankName: true,
  paidById: true,
  createdAt: true,
  patientId: true,
  receipt: { select: { number: true } },
  invoice: { select: { number: true } },
  approvalRequest: { select: { reason: true, decidedById: true } },
} as const satisfies Prisma.RefundSelect;
export type RefundRow = Prisma.RefundGetPayload<{ select: typeof REFUND_SELECT }>;

export interface NewRequest {
  kind: ApprovalKind;
  patientId: string;
  invoiceId: string | null;
  receiptId: string | null;
  dischargeId: string | null;
  amountPaise: bigint;
  reason: string;
  details: Prisma.InputJsonValue;
  requestedById: string;
}

export interface NewCreditNote {
  invoiceId: string;
  patientId: string;
  approvalRequestId: string;
  number: string;
  financialYear: string;
  wholeBill: boolean;
  taxablePaise: bigint;
  cgstPaise: bigint;
  sgstPaise: bigint;
  roundOffPaise: bigint;
  totalPaise: bigint;
  approvedById: string;
  lines: {
    lineNo: number;
    description: string;
    quantity: number | null;
    taxablePaise: bigint;
    cgstPaise: bigint;
    sgstPaise: bigint;
    totalPaise: bigint;
  }[];
}

export interface NewRefund {
  patientId: string;
  approvalRequestId: string;
  number: string;
  financialYear: string;
  shiftId: string;
  receiptId: string | null;
  invoiceId: string | null;
  mode: PaymentMode;
  amountPaise: bigint;
  reference: string | null;
  bankName: string | null;
  paidById: string;
}

/** Approval requests, credit notes, refunds and receipt voids of one hospital. Every query filters by hospital_id. */
@Injectable()
export class ApprovalsRepository {
  constructor(private readonly prisma: PrismaService) {}

  createRequest(hospitalId: string, data: NewRequest, tx?: Tx): Promise<RequestRow> {
    return (tx ?? this.prisma).approvalRequest.create({ data: { hospitalId, ...data }, select: REQUEST_SELECT });
  }

  findRequest(hospitalId: string, id: string): Promise<RequestRow | null> {
    return this.prisma.approvalRequest.findFirst({ where: { id, hospitalId }, select: REQUEST_SELECT });
  }

  /** Locks the request until the transaction ends: two people deciding at once cannot both win. */
  async lockRequest(hospitalId: string, id: string, tx: Tx): Promise<RequestRow | null> {
    await tx.$queryRaw`SELECT id FROM approval_requests WHERE hospital_id = ${hospitalId}::uuid AND id = ${id}::uuid FOR UPDATE`;
    return tx.approvalRequest.findFirst({ where: { id, hospitalId }, select: REQUEST_SELECT });
  }

  decide(
    id: string,
    data: { status: ApprovalStatus; decidedById: string; decidedAt: Date; decisionNote: string | null; resultInvoiceId?: string },
    tx: Tx,
  ): Promise<RequestRow> {
    return tx.approvalRequest.update({ where: { id }, data, select: REQUEST_SELECT });
  }

  async listRequests(
    hospitalId: string,
    filter: { status?: ApprovalStatus | undefined; kind?: ApprovalKind | undefined; patientId?: string | undefined; invoiceId?: string | undefined },
    page: PageRequest,
  ): Promise<{ rows: RequestRow[]; total: number }> {
    const where: Prisma.ApprovalRequestWhereInput = {
      hospitalId,
      ...(filter.status === undefined ? {} : { status: filter.status }),
      ...(filter.kind === undefined ? {} : { kind: filter.kind }),
      ...(filter.patientId === undefined ? {} : { patientId: filter.patientId }),
      ...(filter.invoiceId === undefined ? {} : { invoiceId: filter.invoiceId }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.approvalRequest.findMany({ where, select: REQUEST_SELECT, orderBy: { requestedAt: 'desc' }, ...pageArgs(page) }),
      this.prisma.approvalRequest.count({ where }),
    ]);
    return { rows, total };
  }

  async discountLimit(hospitalId: string, tx?: Tx): Promise<bigint> {
    const hospital = await (tx ?? this.prisma).hospital.findUniqueOrThrow({ where: { id: hospitalId }, select: { discountApprovalLimitPaise: true } });
    return hospital.discountApprovalLimitPaise;
  }

  /** What earlier credit notes gave back on each line of a bill, and on the bill in total. */
  async credited(invoiceId: string, tx?: Tx): Promise<{ lines: Map<number, { taxable: bigint; cgst: bigint; sgst: bigint }>; total: bigint }> {
    const db = tx ?? this.prisma;
    const [lines, notes] = await Promise.all([
      db.creditNoteLine.groupBy({ by: ['lineNo'], where: { invoiceId }, _sum: { taxablePaise: true, cgstPaise: true, sgstPaise: true } }),
      db.creditNote.aggregate({ where: { invoiceId }, _sum: { totalPaise: true } }),
    ]);
    return {
      lines: new Map(
        lines.map((row) => [row.lineNo, { taxable: row._sum.taxablePaise ?? 0n, cgst: row._sum.cgstPaise ?? 0n, sgst: row._sum.sgstPaise ?? 0n }]),
      ),
      total: notes._sum.totalPaise ?? 0n,
    };
  }

  createCreditNote(hospitalId: string, { lines, ...note }: NewCreditNote, tx: Tx): Promise<{ id: string }> {
    return tx.creditNote.create({
      data: { hospitalId, ...note, lines: { create: lines.map((line) => ({ ...line, invoiceId: note.invoiceId })) } },
      select: { id: true },
    });
  }

  receiptState(hospitalId: string, id: string, tx?: Tx): Promise<ReceiptStateRow | null> {
    return (tx ?? this.prisma).receipt.findFirst({ where: { id, hospitalId }, select: RECEIPT_STATE_SELECT });
  }

  async lockReceipt(hospitalId: string, id: string, tx: Tx): Promise<ReceiptStateRow | null> {
    await tx.$queryRaw`SELECT id FROM receipts WHERE hospital_id = ${hospitalId}::uuid AND id = ${id}::uuid FOR UPDATE`;
    return this.receiptState(hospitalId, id, tx);
  }

  /**
   * Refunds asked for from the same deposit or bill that are not paid yet (waiting, or approved and
   * not paid out), leaving out `exceptId`. Their amounts are spoken for.
   */
  async openRefundAmount(hospitalId: string, source: { receiptId: string } | { invoiceId: string }, exceptId: string | null, tx?: Tx): Promise<bigint> {
    const result = await (tx ?? this.prisma).approvalRequest.aggregate({
      where: {
        hospitalId,
        kind: 'refund',
        ...source,
        OR: [{ status: 'pending' }, { status: 'approved', refund: null }],
        ...(exceptId === null ? {} : { NOT: { id: exceptId } }),
      },
      _sum: { amountPaise: true },
    });
    return result._sum.amountPaise ?? 0n;
  }

  createRefund(hospitalId: string, data: NewRefund, tx: Tx): Promise<{ id: string }> {
    return tx.refund.create({ data: { hospitalId, ...data }, select: { id: true } });
  }

  async createVoid(hospitalId: string, data: { receiptId: string; approvalRequestId: string; voidedById: string }, tx: Tx): Promise<void> {
    await tx.receiptVoid.create({ data: { hospitalId, ...data }, select: { id: true } });
  }

  findCreditNote(hospitalId: string, id: string): Promise<CreditNoteRow | null> {
    return this.prisma.creditNote.findFirst({ where: { id, hospitalId }, select: CREDIT_NOTE_SELECT });
  }

  findRefund(hospitalId: string, id: string, tx?: Tx): Promise<RefundRow | null> {
    return (tx ?? this.prisma).refund.findFirst({ where: { id, hospitalId }, select: REFUND_SELECT });
  }
}
