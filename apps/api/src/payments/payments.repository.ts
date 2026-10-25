import { Injectable } from '@nestjs/common';
import type { PaymentMode, Prisma, ReceiptPurpose } from '../generated/prisma/client.js';
import { pageArgs, type PageRequest } from '../common/http/pagination.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Tx } from '../common/prisma/tx.js';

const SHIFT_SELECT = {
  id: true,
  cashierId: true,
  openedAt: true,
  openingCashPaise: true,
  closedAt: true,
  countedCashPaise: true,
  expectedCashPaise: true,
  differencePaise: true,
  differenceReason: true,
} as const satisfies Prisma.CashShiftSelect;
export type ShiftRow = Prisma.CashShiftGetPayload<{ select: typeof SHIFT_SELECT }>;

const RECEIPT_SELECT = {
  id: true,
  number: true,
  purpose: true,
  mode: true,
  amountPaise: true,
  reference: true,
  cardLast4: true,
  bankName: true,
  receivedById: true,
  createdAt: true,
  patient: {
    select: { id: true, uhid: true, fullName: true, sex: true, dateOfBirth: true, phone: true, addressLine: true, city: true, state: true, pincode: true },
  },
  allocations: { select: { invoiceId: true, amountPaise: true, invoice: { select: { number: true } } }, orderBy: { createdAt: 'asc' } },
  refunds: { select: { amountPaise: true } },
  voidRecord: { select: { createdAt: true } },
} as const satisfies Prisma.ReceiptSelect;
export type ReceiptRow = Prisma.ReceiptGetPayload<{ select: typeof RECEIPT_SELECT }>;

/** Money taken in a shift (receipts that are not void), and refunds paid out of it, by mode. */
export interface ShiftTotalsRow {
  mode: PaymentMode;
  purpose: ReceiptPurpose | 'refund';
  count: number;
  amountPaise: bigint;
}

export interface NewReceipt {
  patientId: string;
  number: string;
  financialYear: string;
  shiftId: string;
  purpose: ReceiptPurpose;
  mode: PaymentMode;
  amountPaise: bigint;
  reference: string | null;
  cardLast4: string | null;
  bankName: string | null;
  receivedById: string;
}

/** Cash shifts, receipts and allocations of one hospital. Every query filters by hospital_id. */
@Injectable()
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  openShift(hospitalId: string, cashierId: string, openingCashPaise: bigint): Promise<ShiftRow> {
    return this.prisma.cashShift.create({ data: { hospitalId, cashierId, openingCashPaise }, select: SHIFT_SELECT });
  }

  findOpenShift(hospitalId: string, cashierId: string, tx?: Tx): Promise<ShiftRow | null> {
    return (tx ?? this.prisma).cashShift.findFirst({ where: { hospitalId, cashierId, closedAt: null }, select: SHIFT_SELECT });
  }

  /** Locks the shift until the transaction ends: closing and taking money never cross. */
  async lockShift(hospitalId: string, id: string, tx: Tx): Promise<ShiftRow | null> {
    await tx.$queryRaw`SELECT id FROM cash_shifts WHERE hospital_id = ${hospitalId}::uuid AND id = ${id}::uuid FOR UPDATE`;
    return tx.cashShift.findFirst({ where: { id, hospitalId }, select: SHIFT_SELECT });
  }

  async shiftTotals(shiftIds: readonly string[], tx?: Tx): Promise<Map<string, ShiftTotalsRow[]>> {
    if (shiftIds.length === 0) return new Map();
    const db = tx ?? this.prisma;
    const [rows, refunds] = await Promise.all([
      db.receipt.groupBy({
        by: ['shiftId', 'mode', 'purpose'],
        where: { shiftId: { in: [...shiftIds] }, voidRecord: null },
        _count: { _all: true },
        _sum: { amountPaise: true },
      }),
      db.refund.groupBy({ by: ['shiftId', 'mode'], where: { shiftId: { in: [...shiftIds] } }, _count: { _all: true }, _sum: { amountPaise: true } }),
    ]);
    const totals = new Map<string, ShiftTotalsRow[]>();
    const add = (shiftId: string, row: ShiftTotalsRow) => {
      const list = totals.get(shiftId) ?? [];
      list.push(row);
      totals.set(shiftId, list);
    };
    for (const row of rows) add(row.shiftId, { mode: row.mode, purpose: row.purpose, count: row._count._all, amountPaise: row._sum.amountPaise ?? 0n });
    for (const row of refunds) add(row.shiftId, { mode: row.mode, purpose: 'refund', count: row._count._all, amountPaise: row._sum.amountPaise ?? 0n });
    return totals;
  }

  closeShift(
    id: string,
    data: { closedAt: Date; countedCashPaise: bigint; expectedCashPaise: bigint; differencePaise: bigint; differenceReason: string | null },
    tx: Tx,
  ): Promise<ShiftRow> {
    return tx.cashShift.update({ where: { id }, data, select: SHIFT_SELECT });
  }

  async listShifts(hospitalId: string, page: PageRequest): Promise<{ rows: ShiftRow[]; total: number }> {
    const where = { hospitalId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.cashShift.findMany({ where, select: SHIFT_SELECT, orderBy: { openedAt: 'desc' }, ...pageArgs(page) }),
      this.prisma.cashShift.count({ where }),
    ]);
    return { rows, total };
  }

  async patientExists(hospitalId: string, id: string): Promise<boolean> {
    return (await this.prisma.patient.count({ where: { id, hospitalId } })) === 1;
  }

  async createReceipt(hospitalId: string, data: NewReceipt, tx: Tx): Promise<string> {
    const receipt = await tx.receipt.create({ data: { hospitalId, ...data }, select: { id: true } });
    return receipt.id;
  }

  async allocate(hospitalId: string, data: { receiptId: string; invoiceId: string; amountPaise: bigint; allocatedById: string }, tx: Tx): Promise<void> {
    await tx.receiptAllocation.create({ data: { hospitalId, ...data }, select: { id: true } });
  }

  /**
   * The patient's deposits with something left on them (not void, less what was used or refunded),
   * oldest first, locked until the transaction ends so the same rupee is never used twice.
   */
  async lockHeldDeposits(hospitalId: string, patientId: string, tx: Tx): Promise<{ id: string; heldPaise: bigint }[]> {
    await tx.$queryRaw`SELECT id FROM receipts WHERE hospital_id = ${hospitalId}::uuid AND patient_id = ${patientId}::uuid AND purpose = 'deposit' FOR UPDATE`;
    const deposits = await tx.receipt.findMany({
      where: { hospitalId, patientId, purpose: 'deposit', voidRecord: null },
      select: { id: true, amountPaise: true, allocations: { select: { amountPaise: true } }, refunds: { select: { amountPaise: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return deposits
      .map((deposit) => ({
        id: deposit.id,
        heldPaise: deposit.amountPaise - [...deposit.allocations, ...deposit.refunds].reduce((sum, part) => sum + part.amountPaise, 0n),
      }))
      .filter((deposit) => deposit.heldPaise > 0n);
  }

  findReceipt(hospitalId: string, id: string, tx?: Tx): Promise<ReceiptRow | null> {
    return (tx ?? this.prisma).receipt.findFirst({ where: { id, hospitalId }, select: RECEIPT_SELECT });
  }
}
