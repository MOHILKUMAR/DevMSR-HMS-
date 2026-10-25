import { Injectable } from '@nestjs/common';
import type { Paginated } from '@devmsr/types';
import type { ApplyDeposit, CloseShift, Invoice, OpenShift, PaginationQuery, Receipt, Shift, TakeDeposit, TakePayment } from '@devmsr/validation';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import { BillingRepository } from '../billing/billing.repository.js';
import { BillingService } from '../billing/billing.service.js';
import { NO_MONEY } from '../billing/billing.repository.js';
import { owedOn, paise, toIssuer } from '../billing/dto/billing.mapper.js';
import { Errors } from '../common/errors/app-error.js';
import type { RequestMeta } from '../common/http/app-request.js';
import { hospitalOf } from '../common/http/hospital-scope.js';
import { paged } from '../common/http/pagination.js';
import type { Tx } from '../common/prisma/tx.js';
import { TransactionRunner } from '../common/prisma/transaction-runner.js';
import { Prisma } from '../generated/prisma/client.js';
import { NumberingService } from '../numbering/numbering.service.js';
import { expectedCash, toReceipt, toShift } from './dto/payments.mapper.js';
import { PaymentsRepository, type ShiftRow } from './payments.repository.js';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** How the money came in, as stored: only the details the payment mode needs. */
function details(input: TakePayment | TakeDeposit) {
  return { reference: input.reference ?? null, cardLast4: input.cardLast4 ?? null, bankName: input.bankName ?? null };
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly payments: PaymentsRepository,
    private readonly billing: BillingRepository,
    private readonly bills: BillingService,
    private readonly numbering: NumberingService,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
  ) {}

  private async shiftView(hospitalId: string, row: ShiftRow, tx?: Tx): Promise<Shift> {
    const [totals, names] = await Promise.all([this.payments.shiftTotals([row.id], tx), this.billing.userNames(hospitalId, [row.cashierId])]);
    return toShift(row, totals.get(row.id) ?? [], names.get(row.cashierId) ?? null);
  }

  private async receiptView(hospitalId: string, id: string, tx?: Tx): Promise<Receipt> {
    const row = await this.payments.findReceipt(hospitalId, id, tx);
    if (row === null) throw Errors.notFound('receipt');
    const [issuer, names] = await Promise.all([this.billing.issuer(hospitalId, tx), this.billing.userNames(hospitalId, [row.receivedById])]);
    return toReceipt(row, toIssuer(issuer), names.get(row.receivedById) ?? null);
  }

  /** The cashier's own open shift, locked: money is taken only into it. */
  private async ownOpenShift(hospitalId: string, cashierId: string, tx: Tx): Promise<ShiftRow> {
    const shift = await this.payments.findOpenShift(hospitalId, cashierId, tx);
    const locked = shift === null ? null : await this.payments.lockShift(hospitalId, shift.id, tx);
    if (locked?.closedAt !== null) throw Errors.shiftRequired();
    return locked;
  }

  async openShift(auth: AuthContext, input: OpenShift, meta: RequestMeta): Promise<Shift> {
    const hospitalId = hospitalOf(auth);
    try {
      const shift = await this.payments.openShift(hospitalId, auth.userId, BigInt(input.openingCashPaise));
      await this.audit.record({
        action: 'payments.shift.opened',
        hospitalId,
        actorUserId: auth.userId,
        entityType: 'cash_shift',
        entityId: shift.id,
        meta,
        details: { openingCashPaise: input.openingCashPaise },
      });
      return await this.shiftView(hospitalId, shift);
    } catch (error) {
      if (isUniqueViolation(error)) throw Errors.shiftAlreadyOpen();
      throw error;
    }
  }

  async currentShift(auth: AuthContext): Promise<{ shift: Shift | null }> {
    const hospitalId = hospitalOf(auth);
    const shift = await this.payments.findOpenShift(hospitalId, auth.userId);
    return { shift: shift === null ? null : await this.shiftView(hospitalId, shift) };
  }

  /**
   * Closes the cashier's own shift with the counted cash. A difference from what the system expects
   * needs a reason, and is kept for finance (docs/billing-rules.md).
   */
  async closeShift(auth: AuthContext, id: string, input: CloseShift, meta: RequestMeta, now: Date = new Date()): Promise<Shift> {
    const hospitalId = hospitalOf(auth);
    return this.transactions.run(async (tx) => {
      const shift = await this.payments.lockShift(hospitalId, id, tx);
      // Another cashier's shift is not theirs to see, so it is "not found".
      if (shift === null || shift.cashierId !== auth.userId) throw Errors.notFound('shift');
      if (shift.closedAt !== null) throw Errors.shiftClosed();
      const totals = await this.payments.shiftTotals([id], tx);
      const expected = expectedCash(shift, totals.get(id) ?? []);
      const counted = BigInt(input.countedCashPaise);
      const difference = counted - expected;
      if (difference !== 0n && input.differenceReason === undefined) {
        throw Errors.validation([{ location: 'body', path: 'differenceReason', message: 'Give a reason for the difference' }]);
      }
      const closed = await this.payments.closeShift(
        id,
        {
          closedAt: now,
          countedCashPaise: counted,
          expectedCashPaise: expected,
          differencePaise: difference,
          differenceReason: difference === 0n ? null : (input.differenceReason ?? null),
        },
        tx,
      );
      await this.audit.record(
        {
          action: 'payments.shift.closed',
          hospitalId,
          actorUserId: auth.userId,
          entityType: 'cash_shift',
          entityId: id,
          meta,
          details: { expectedCashPaise: paise(expected), countedCashPaise: input.countedCashPaise, differencePaise: paise(difference) },
        },
        tx,
      );
      return this.shiftView(hospitalId, closed, tx);
    });
  }

  async listShifts(auth: AuthContext, query: PaginationQuery): Promise<Paginated<Shift>> {
    const hospitalId = hospitalOf(auth);
    const { rows, total } = await this.payments.listShifts(hospitalId, query);
    const [totals, names] = await Promise.all([
      this.payments.shiftTotals(rows.map((row) => row.id)),
      this.billing.userNames(
        hospitalId,
        rows.map((row) => row.cashierId),
      ),
    ]);
    return paged(
      rows.map((row) => toShift(row, totals.get(row.id) ?? [], names.get(row.cashierId) ?? null)),
      total,
      query,
    );
  }

  /** Payment against an issued bill, up to what is due, into the cashier's open shift. */
  async takePayment(auth: AuthContext, input: TakePayment, meta: RequestMeta, now: Date = new Date()): Promise<Receipt> {
    const hospitalId = hospitalOf(auth);
    return this.transactions.run(async (tx) => {
      const shift = await this.ownOpenShift(hospitalId, auth.userId, tx);
      const bill = await this.billing.lockInvoice(hospitalId, input.invoiceId, tx);
      if (bill === null) throw Errors.notFound('bill');
      if (bill.status !== 'issued') throw Errors.billNotIssued();
      const owed = owedOn(bill.totalPaise, (await this.billing.balances([bill.id], tx)).get(bill.id) ?? NO_MONEY);
      const amount = BigInt(input.amountPaise);
      if (amount > owed) throw Errors.amountExceedsDue();

      const { number, financialYear } = await this.numbering.nextDocumentNumber(hospitalId, 'receipt', tx, now);
      const receiptId = await this.payments.createReceipt(
        hospitalId,
        {
          patientId: bill.patientId,
          number,
          financialYear,
          shiftId: shift.id,
          purpose: 'bill_payment',
          mode: input.mode,
          amountPaise: amount,
          ...details(input),
          receivedById: auth.userId,
        },
        tx,
      );
      await this.payments.allocate(hospitalId, { receiptId, invoiceId: bill.id, amountPaise: amount, allocatedById: auth.userId }, tx);
      await this.audit.record(
        {
          action: 'payments.receipt.taken',
          hospitalId,
          actorUserId: auth.userId,
          entityType: 'receipt',
          entityId: receiptId,
          meta,
          details: { number, purpose: 'bill_payment', mode: input.mode, amountPaise: input.amountPaise, invoiceId: bill.id },
        },
        tx,
      );
      return this.receiptView(hospitalId, receiptId, tx);
    });
  }

  /** An advance held for the patient. Not revenue until it is set against a bill. */
  async takeDeposit(auth: AuthContext, input: TakeDeposit, meta: RequestMeta, now: Date = new Date()): Promise<Receipt> {
    const hospitalId = hospitalOf(auth);
    if (!(await this.payments.patientExists(hospitalId, input.patientId))) throw Errors.notFound('patient');
    return this.transactions.run(async (tx) => {
      const shift = await this.ownOpenShift(hospitalId, auth.userId, tx);
      const { number, financialYear } = await this.numbering.nextDocumentNumber(hospitalId, 'receipt', tx, now);
      const receiptId = await this.payments.createReceipt(
        hospitalId,
        {
          patientId: input.patientId,
          number,
          financialYear,
          shiftId: shift.id,
          purpose: 'deposit',
          mode: input.mode,
          amountPaise: BigInt(input.amountPaise),
          ...details(input),
          receivedById: auth.userId,
        },
        tx,
      );
      await this.audit.record(
        {
          action: 'payments.deposit.taken',
          hospitalId,
          actorUserId: auth.userId,
          entityType: 'receipt',
          entityId: receiptId,
          meta,
          details: { number, mode: input.mode, amountPaise: input.amountPaise, patientId: input.patientId },
        },
        tx,
      );
      return this.receiptView(hospitalId, receiptId, tx);
    });
  }

  /** Sets held deposit against an issued bill, oldest deposit first. No money changes hands. */
  async applyDeposit(auth: AuthContext, invoiceId: string, input: ApplyDeposit, meta: RequestMeta): Promise<Invoice> {
    const hospitalId = hospitalOf(auth);
    await this.transactions.run(async (tx) => {
      const bill = await this.billing.lockInvoice(hospitalId, invoiceId, tx);
      if (bill === null) throw Errors.notFound('bill');
      if (bill.status !== 'issued') throw Errors.billNotIssued();
      const owed = owedOn(bill.totalPaise, (await this.billing.balances([bill.id], tx)).get(bill.id) ?? NO_MONEY);
      let remaining = BigInt(input.amountPaise);
      if (remaining > owed) throw Errors.amountExceedsDue();
      const deposits = await this.payments.lockHeldDeposits(hospitalId, bill.patientId, tx);
      if (deposits.reduce((sum, deposit) => sum + deposit.heldPaise, 0n) < remaining) throw Errors.noDepositHeld();

      const used: string[] = [];
      for (const deposit of deposits) {
        if (remaining === 0n) break;
        const take = deposit.heldPaise < remaining ? deposit.heldPaise : remaining;
        await this.payments.allocate(hospitalId, { receiptId: deposit.id, invoiceId: bill.id, amountPaise: take, allocatedById: auth.userId }, tx);
        used.push(deposit.id);
        remaining -= take;
      }
      await this.audit.record(
        {
          action: 'payments.deposit.applied',
          hospitalId,
          actorUserId: auth.userId,
          entityType: 'invoice',
          entityId: bill.id,
          meta,
          details: { amountPaise: input.amountPaise, receipts: used.join(',') },
        },
        tx,
      );
    });
    return this.bills.getInvoice(auth, invoiceId, meta);
  }

  async getReceipt(auth: AuthContext, id: string, meta: RequestMeta): Promise<Receipt> {
    const hospitalId = hospitalOf(auth);
    const receipt = await this.receiptView(hospitalId, id);
    await this.audit.record({ action: 'payments.receipt.viewed', hospitalId, actorUserId: auth.userId, entityType: 'receipt', entityId: id, meta });
    return receipt;
  }
}
