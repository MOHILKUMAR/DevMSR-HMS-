import { Injectable } from '@nestjs/common';
import type { Paginated } from '@devmsr/types';
import type {
  ApprovalDetails,
  ApprovalKind,
  ApprovalListQuery,
  ApprovalRequest,
  ApproveRequest,
  CreditNote,
  PayRefund,
  Refund,
  RejectRequest,
  RequestCreditNote,
  RequestDiscount,
  RequestReceiptVoid,
  RequestRefund,
} from '@devmsr/validation';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import { BillingRepository, NO_MONEY, type InvoiceRow } from '../billing/billing.repository.js';
import { owedOn, paise, toBilledPatient, toIssuer } from '../billing/dto/billing.mapper.js';
import { billAmounts, creditLine, creditNoteTotal, percentOf, spreadDiscount, type CreditAmounts } from '../billing/money.js';
import { Errors } from '../common/errors/app-error.js';
import type { RequestMeta } from '../common/http/app-request.js';
import { hospitalOf } from '../common/http/hospital-scope.js';
import { paged } from '../common/http/pagination.js';
import type { Tx } from '../common/prisma/tx.js';
import { TransactionRunner } from '../common/prisma/transaction-runner.js';
import { Prisma } from '../generated/prisma/client.js';
import { NumberingService } from '../numbering/numbering.service.js';
import { PaymentsRepository } from '../payments/payments.repository.js';
import { ApprovalsRepository, type ReceiptStateRow, type RequestRow } from './approvals.repository.js';
import { toApprovalRequest, toCreditNote, toRefund } from './dto/approvals.mapper.js';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** A credit note worked out against the bill as it stands now. */
interface CreditPlan {
  wholeBill: boolean;
  lines: (CreditAmounts & { lineNo: number; description: string; quantity: number | null; amountPaise: bigint | null })[];
  exactPaise: bigint;
  totalPaise: bigint;
  roundOffPaise: bigint;
}

/** What is left on a deposit receipt: its amount less what was set against bills or refunded. Nothing once void. */
function depositLeft(receipt: ReceiptStateRow): bigint {
  if (receipt.voidRecord !== null || receipt.purpose !== 'deposit') return 0n;
  return receipt.amountPaise - [...receipt.allocations, ...receipt.refunds].reduce((sum, part) => sum + part.amountPaise, 0n);
}

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly approvals: ApprovalsRepository,
    private readonly billing: BillingRepository,
    private readonly payments: PaymentsRepository,
    private readonly numbering: NumberingService,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
  ) {}

  private async view(hospitalId: string, row: RequestRow, tx?: Tx): Promise<ApprovalRequest> {
    const [names, limit] = await Promise.all([
      this.billing.userNames(hospitalId, [row.requestedById, row.decidedById]),
      this.approvals.discountLimit(hospitalId, tx),
    ]);
    return toApprovalRequest(row, names, limit);
  }

  /** Saves a request. A second one of the same kind for the same bill or receipt is refused. */
  private async create(
    auth: AuthContext,
    hospitalId: string,
    data: { kind: ApprovalKind; patientId: string; invoiceId: string | null; receiptId: string | null; amountPaise: bigint; reason: string; details: ApprovalDetails },
    meta: RequestMeta,
  ): Promise<ApprovalRequest> {
    try {
      const row = await this.transactions.run(async (tx) => {
        const created = await this.approvals.createRequest(hospitalId, { ...data, requestedById: auth.userId }, tx);
        await this.audit.record(
          {
            action: 'approvals.request.created',
            hospitalId,
            actorUserId: auth.userId,
            entityType: 'approval_request',
            entityId: created.id,
            meta,
            details: { kind: data.kind, amountPaise: paise(data.amountPaise), invoiceId: data.invoiceId, receiptId: data.receiptId },
          },
          tx,
        );
        return created;
      });
      return await this.view(hospitalId, row);
    } catch (error) {
      if (isUniqueViolation(error)) throw Errors.requestPending();
      throw error;
    }
  }

  /**
   * Locks a pending request of the right kind for a decision. Another hospital's request, or one of
   * another kind, is not found. Whoever asked can never decide (maker-checker).
   */
  private async pendingForDecision(auth: AuthContext, hospitalId: string, kind: ApprovalKind, id: string, tx: Tx): Promise<RequestRow> {
    const request = await this.approvals.lockRequest(hospitalId, id, tx);
    if (request?.kind !== kind) throw Errors.notFound('request');
    if (request.status !== 'pending') throw Errors.requestDecided();
    if (request.requestedById === auth.userId) throw Errors.selfApproval();
    return request;
  }

  private async recordDecision(auth: AuthContext, hospitalId: string, request: RequestRow, decision: 'approved' | 'rejected', meta: RequestMeta, tx: Tx) {
    await this.audit.record(
      {
        action: `approvals.request.${decision}`,
        hospitalId,
        actorUserId: auth.userId,
        entityType: 'approval_request',
        entityId: request.id,
        meta,
        details: { kind: request.kind, amountPaise: paise(request.amountPaise) },
      },
      tx,
    );
  }

  // Discounts.

  /** Per-line discounts for a draft, worked out from the line amounts before any discount. */
  private discountLines(draft: InvoiceRow, input: RequestDiscount): bigint[] {
    const amounts = draft.lines.map((line) => line.amountPaise);
    const subtotal = amounts.reduce((sum, amount) => sum + amount, 0n);
    const discount = input.discount;
    if (discount.scope === 'lines') {
      const wanted = new Map(discount.lines.map((line) => [line.lineNo, BigInt(line.discountPaise)]));
      if ([...wanted.keys()].some((lineNo) => !draft.lines.some((line) => line.lineNo === lineNo))) throw Errors.amountTooLarge();
      return draft.lines.map((line) => {
        const value = wanted.get(line.lineNo) ?? 0n;
        if (value > line.amountPaise) throw Errors.amountTooLarge();
        return value;
      });
    }
    const total = discount.scope === 'bill_amount' ? BigInt(discount.amountPaise) : percentOf(subtotal, discount.percentBp);
    if (total > subtotal) throw Errors.amountTooLarge();
    return spreadDiscount(amounts, total);
  }

  /** A discount on a draft bill, for someone else to approve before the bill is issued. */
  async requestDiscount(auth: AuthContext, input: RequestDiscount, meta: RequestMeta): Promise<ApprovalRequest> {
    const hospitalId = hospitalOf(auth);
    const draft = await this.billing.findInvoice(hospitalId, input.invoiceId);
    if (draft === null) throw Errors.notFound('bill');
    // An issued bill never changes: a correction is a credit note.
    if (draft.status !== 'draft') throw Errors.invoiceLocked();
    const shares = this.discountLines(draft, input);
    const amountPaise = shares.reduce((sum, share) => sum + share, 0n);
    if (amountPaise === 0n) throw Errors.amountTooLarge();
    const details: ApprovalDetails = {
      kind: 'discount',
      scope: input.discount.scope,
      percentBp: input.discount.scope === 'bill_percent' ? input.discount.percentBp : null,
      lines: draft.lines
        .map((line, index) => ({ lineNo: line.lineNo, description: line.description, amountPaise: paise(line.amountPaise), discountPaise: paise(shares[index] ?? 0n) }))
        .filter((line) => line.discountPaise > 0),
    };
    return this.create(auth, hospitalId, { kind: 'discount', patientId: draft.patientId, invoiceId: draft.id, receiptId: null, amountPaise, reason: input.reason, details }, meta);
  }

  /**
   * Approves a discount: the draft is replaced by a new draft with the discount taken off each line
   * before tax. Finance approves up to the hospital's limit; above it only the MD (docs/billing-rules.md).
   */
  private async approveDiscount(auth: AuthContext, hospitalId: string, id: string, input: ApproveRequest, meta: RequestMeta, now: Date, tx: Tx): Promise<RequestRow> {
    const request = await this.pendingForDecision(auth, hospitalId, 'discount', id, tx);
    const limit = await this.approvals.discountLimit(hospitalId, tx);
    if (request.amountPaise > limit && !auth.permissions.has('billing.discount.approve-above-limit')) throw Errors.aboveApprovalLimit();
    const details = this.detailsOf(request, 'discount');
    const draft = request.invoiceId === null ? null : await this.billing.lockInvoice(hospitalId, request.invoiceId, tx);
    if (draft?.status !== 'draft') throw Errors.invoiceLocked();

    const discountOf = new Map(details.lines.map((line) => [line.lineNo, BigInt(line.discountPaise)]));
    const bill = billAmounts(
      draft.lines.map((line) => ({ unitRatePaise: line.unitRatePaise, quantity: line.quantity, taxRateBp: line.taxRateBp, discountPaise: discountOf.get(line.lineNo) ?? 0n })),
    );
    const lines = draft.lines.map((line, index) => {
      const amounts = bill.lines[index];
      if (amounts === undefined) throw new Error('Every line has amounts');
      return {
        chargeId: line.chargeId,
        lineNo: line.lineNo,
        description: line.description,
        serviceDate: line.serviceDate,
        quantity: line.quantity,
        unitRatePaise: line.unitRatePaise,
        taxRateBp: line.taxRateBp,
        ...amounts,
      };
    });
    const { lines: _lines, ...totals } = bill;
    const replacement = await this.billing.createDraft(hospitalId, draft.patientId, request.requestedById, totals, lines, tx);
    // The decision goes first: the database keeps a draft with a discount waiting from being discarded.
    const decided = await this.approvals.decide(
      id,
      { status: 'approved', decidedById: auth.userId, decidedAt: now, decisionNote: input.note ?? null, resultInvoiceId: replacement.id },
      tx,
    );
    await this.billing.discard(draft.id, auth.userId, now, tx);
    await this.billing.releaseCharges(draft.id, tx);
    const chargeIds = lines.map((line) => line.chargeId);
    if ((await this.billing.attachCharges(hospitalId, chargeIds, replacement.id, tx)) !== chargeIds.length) throw Errors.chargeUnavailable();
    await this.recordDecision(auth, hospitalId, decided, 'approved', meta, tx);
    await this.audit.record(
      {
        action: 'billing.invoice.discounted',
        hospitalId,
        actorUserId: auth.userId,
        entityType: 'invoice',
        entityId: replacement.id,
        meta,
        details: { replacesInvoiceId: draft.id, discountPaise: paise(totals.discountPaise), totalPaise: paise(totals.totalPaise) },
      },
      tx,
    );
    return decided;
  }

  // Credit notes.

  /** Works a credit note out against the bill as it stands, after any earlier credit notes. */
  private async creditPlan(bill: InvoiceRow, ask: { wholeBill: true } | { wholeBill: false; lines: RequestCreditNote['credit'] & { scope: 'lines' } }, tx?: Tx): Promise<CreditPlan> {
    const credited = await this.approvals.credited(bill.id, tx);
    const lines: CreditPlan['lines'] = [];
    const left = (line: InvoiceRow['lines'][number]) => {
      const done = credited.lines.get(line.lineNo);
      return {
        quantity: line.quantity,
        taxRateBp: line.taxRateBp,
        taxablePaise: line.taxablePaise,
        cgstPaise: line.cgstPaise,
        sgstPaise: line.sgstPaise,
        creditedTaxablePaise: done?.taxable ?? 0n,
        creditedCgstPaise: done?.cgst ?? 0n,
        creditedSgstPaise: done?.sgst ?? 0n,
      };
    };
    if (ask.wholeBill) {
      for (const line of bill.lines) {
        const state = left(line);
        const rest = state.taxablePaise - state.creditedTaxablePaise;
        const tax = state.cgstPaise - state.creditedCgstPaise + state.sgstPaise - state.creditedSgstPaise;
        if (rest === 0n && tax === 0n) continue;
        const cgstPaise = state.cgstPaise - state.creditedCgstPaise;
        const sgstPaise = state.sgstPaise - state.creditedSgstPaise;
        lines.push({ lineNo: line.lineNo, description: line.description, quantity: null, amountPaise: null, taxablePaise: rest, cgstPaise, sgstPaise, totalPaise: rest + cgstPaise + sgstPaise });
      }
    } else {
      for (const wanted of ask.lines.lines) {
        const line = bill.lines.find((candidate) => candidate.lineNo === wanted.lineNo);
        if (line === undefined) throw Errors.amountTooLarge();
        const amounts = creditLine(left(line), 'quantity' in wanted ? { quantity: wanted.quantity } : { amountPaise: BigInt(wanted.amountPaise) });
        if (amounts === null) throw Errors.amountTooLarge();
        lines.push({
          lineNo: line.lineNo,
          description: line.description,
          quantity: 'quantity' in wanted ? wanted.quantity : null,
          amountPaise: 'amountPaise' in wanted ? BigInt(wanted.amountPaise) : null,
          ...amounts,
        });
      }
    }
    if (lines.length === 0) throw Errors.amountTooLarge();
    // The note clears the bill when every line is then fully credited, tax included.
    const clearsBill = bill.lines.every((line) => {
      const state = left(line);
      const now = lines.find((candidate) => candidate.lineNo === line.lineNo);
      return (
        state.creditedTaxablePaise + (now?.taxablePaise ?? 0n) === line.taxablePaise &&
        state.creditedCgstPaise + (now?.cgstPaise ?? 0n) === line.cgstPaise &&
        state.creditedSgstPaise + (now?.sgstPaise ?? 0n) === line.sgstPaise
      );
    });
    const exactPaise = lines.reduce((sum, line) => sum + line.totalPaise, 0n);
    const total = creditNoteTotal(exactPaise, bill.totalPaise, credited.total, clearsBill);
    if (total === null) throw Errors.amountTooLarge();
    return { wholeBill: ask.wholeBill, lines, exactPaise, ...total };
  }

  /** A credit note on an issued bill: chosen lines, or the whole bill (a bill void). */
  async requestCreditNote(auth: AuthContext, input: RequestCreditNote, meta: RequestMeta): Promise<ApprovalRequest> {
    const hospitalId = hospitalOf(auth);
    const bill = await this.billing.findInvoice(hospitalId, input.invoiceId);
    if (bill === null) throw Errors.notFound('bill');
    if (bill.status !== 'issued') throw Errors.billNotIssued();
    const plan = await this.creditPlan(bill, input.credit.scope === 'whole_bill' ? { wholeBill: true } : { wholeBill: false, lines: input.credit });
    return this.create(
      auth,
      hospitalId,
      {
        kind: 'credit_note',
        patientId: bill.patientId,
        invoiceId: bill.id,
        receiptId: null,
        amountPaise: plan.totalPaise,
        reason: input.reason,
        details: {
          kind: 'credit_note',
          wholeBill: plan.wholeBill,
          lines: plan.lines.map((line) => ({
            lineNo: line.lineNo,
            description: line.description,
            quantity: line.quantity,
            amountPaise: line.amountPaise === null ? null : paise(line.amountPaise),
            taxablePaise: paise(line.taxablePaise),
            cgstPaise: paise(line.cgstPaise),
            sgstPaise: paise(line.sgstPaise),
            totalPaise: paise(line.totalPaise),
          })),
        },
      },
      meta,
    );
  }

  /** Approves a credit note: it gets the next CN number and lowers what the bill comes to. */
  private async approveCreditNote(auth: AuthContext, hospitalId: string, id: string, input: ApproveRequest, meta: RequestMeta, now: Date, tx: Tx): Promise<RequestRow> {
    const request = await this.pendingForDecision(auth, hospitalId, 'credit_note', id, tx);
    const details = this.detailsOf(request, 'credit_note');
    // Cancelling a whole bill is a void (docs/billing-rules.md).
    if (details.wholeBill && !auth.permissions.has('billing.void.approve')) throw Errors.permissionDenied();
    const bill = request.invoiceId === null ? null : await this.billing.lockInvoice(hospitalId, request.invoiceId, tx);
    if (bill?.status !== 'issued') throw Errors.billNotIssued();
    const plan = await this.creditPlan(
      bill,
      details.wholeBill
        ? { wholeBill: true }
        : {
            wholeBill: false,
            lines: {
              scope: 'lines',
              lines: details.lines.map((line) => (line.quantity === null ? { lineNo: line.lineNo, amountPaise: line.amountPaise ?? line.taxablePaise } : { lineNo: line.lineNo, quantity: line.quantity })),
            },
          },
      tx,
    );
    // Nothing else can credit this bill while the request waits, so the sums still agree.
    if (plan.totalPaise !== request.amountPaise) throw Errors.amountTooLarge();
    const decided = await this.approvals.decide(id, { status: 'approved', decidedById: auth.userId, decidedAt: now, decisionNote: input.note ?? null }, tx);
    const { number, financialYear } = await this.numbering.nextDocumentNumber(hospitalId, 'credit_note', tx, now);
    const sum = (pick: (line: CreditPlan['lines'][number]) => bigint) => plan.lines.reduce((total, line) => total + pick(line), 0n);
    const note = await this.approvals.createCreditNote(
      hospitalId,
      {
        invoiceId: bill.id,
        patientId: bill.patientId,
        approvalRequestId: id,
        number,
        financialYear,
        wholeBill: plan.wholeBill,
        taxablePaise: sum((line) => line.taxablePaise),
        cgstPaise: sum((line) => line.cgstPaise),
        sgstPaise: sum((line) => line.sgstPaise),
        roundOffPaise: plan.roundOffPaise,
        totalPaise: plan.totalPaise,
        approvedById: auth.userId,
        lines: plan.lines.map((line) => ({
          lineNo: line.lineNo,
          description: line.description,
          quantity: line.quantity,
          taxablePaise: line.taxablePaise,
          cgstPaise: line.cgstPaise,
          sgstPaise: line.sgstPaise,
          totalPaise: line.totalPaise,
        })),
      },
      tx,
    );
    await this.recordDecision(auth, hospitalId, decided, 'approved', meta, tx);
    await this.audit.record(
      {
        action: 'billing.credit-note.issued',
        hospitalId,
        actorUserId: auth.userId,
        entityType: 'credit_note',
        entityId: note.id,
        meta,
        details: { number, invoiceId: bill.id, totalPaise: paise(plan.totalPaise), wholeBill: plan.wholeBill },
      },
      tx,
    );
    return decided;
  }

  // Refunds.

  /** What can still be refunded from a deposit or an overpaid bill, less other refunds asked for and not paid. */
  private async refundable(hospitalId: string, patientId: string, source: RequestRefund['source'], exceptId: string | null, tx?: Tx): Promise<bigint> {
    if (source.kind === 'deposit') {
      const receipt = tx === undefined ? await this.approvals.receiptState(hospitalId, source.receiptId) : await this.approvals.lockReceipt(hospitalId, source.receiptId, tx);
      if (receipt === null) throw Errors.notFound('receipt');
      if (receipt.patientId !== patientId) throw Errors.notFound('receipt');
      return depositLeft(receipt) - (await this.approvals.openRefundAmount(hospitalId, { receiptId: receipt.id }, exceptId, tx));
    }
    const bill = tx === undefined ? await this.billing.findInvoice(hospitalId, source.invoiceId) : await this.billing.lockInvoice(hospitalId, source.invoiceId, tx);
    if (bill === null || bill.patientId !== patientId) throw Errors.notFound('bill');
    if (bill.status !== 'issued') throw Errors.billNotIssued();
    const owed = owedOn(bill.totalPaise, (await this.billing.balances([bill.id], tx)).get(bill.id) ?? NO_MONEY);
    const overpaid = owed < 0n ? -owed : 0n;
    return overpaid - (await this.approvals.openRefundAmount(hospitalId, { invoiceId: bill.id }, exceptId, tx));
  }

  /** The patient a refund source belongs to, from the deposit receipt or the bill. */
  private async sourcePatient(hospitalId: string, source: RequestRefund['source']): Promise<string> {
    if (source.kind === 'deposit') {
      const receipt = await this.approvals.receiptState(hospitalId, source.receiptId);
      if (receipt === null) throw Errors.notFound('receipt');
      return receipt.patientId;
    }
    const bill = await this.billing.findInvoice(hospitalId, source.invoiceId);
    if (bill === null) throw Errors.notFound('bill');
    return bill.patientId;
  }

  /** A refund of excess deposit or of an overpaid bill. Every refund is approved by the MD. */
  async requestRefund(auth: AuthContext, input: RequestRefund, meta: RequestMeta): Promise<ApprovalRequest> {
    const hospitalId = hospitalOf(auth);
    const patientId = await this.sourcePatient(hospitalId, input.source);
    const amountPaise = BigInt(input.amountPaise);
    if (amountPaise > (await this.refundable(hospitalId, patientId, input.source, null))) throw Errors.amountTooLarge();
    return this.create(
      auth,
      hospitalId,
      {
        kind: 'refund',
        patientId,
        invoiceId: input.source.kind === 'bill' ? input.source.invoiceId : null,
        receiptId: input.source.kind === 'deposit' ? input.source.receiptId : null,
        amountPaise,
        reason: input.reason,
        details: { kind: 'refund', source: input.source.kind, mode: input.mode },
      },
      meta,
    );
  }

  private refundSource(request: RequestRow): RequestRefund['source'] {
    if (request.receiptId !== null) return { kind: 'deposit', receiptId: request.receiptId };
    if (request.invoiceId !== null) return { kind: 'bill', invoiceId: request.invoiceId };
    throw new Error('A refund request has a source');
  }

  private async approveRefund(auth: AuthContext, hospitalId: string, id: string, input: ApproveRequest, meta: RequestMeta, now: Date, tx: Tx): Promise<RequestRow> {
    const request = await this.pendingForDecision(auth, hospitalId, 'refund', id, tx);
    if (request.amountPaise > (await this.refundable(hospitalId, request.patientId, this.refundSource(request), id, tx))) throw Errors.amountTooLarge();
    const decided = await this.approvals.decide(id, { status: 'approved', decidedById: auth.userId, decidedAt: now, decisionNote: input.note ?? null }, tx);
    await this.recordDecision(auth, hospitalId, decided, 'approved', meta, tx);
    return decided;
  }

  /** Pays out an approved refund from the cashier's own open shift, with the details its mode needs. */
  async payRefund(auth: AuthContext, id: string, input: PayRefund, meta: RequestMeta, now: Date = new Date()): Promise<Refund> {
    const hospitalId = hospitalOf(auth);
    const refundId = await this.transactions.run(async (tx) => {
      const request = await this.approvals.lockRequest(hospitalId, id, tx);
      if (request?.kind !== 'refund') throw Errors.notFound('request');
      if (request.status !== 'approved' || request.refund !== null) throw Errors.refundNotReady();
      const details = this.detailsOf(request, 'refund');
      const complete =
        details.mode === 'cash'
          ? input.reference === undefined && input.bankName === undefined
          : details.mode === 'upi'
            ? input.reference !== undefined && input.bankName === undefined
            : input.reference !== undefined && input.bankName !== undefined;
      if (!complete) throw Errors.validation([{ location: 'body', path: 'reference', message: 'Enter the details this refund mode needs, and only those' }]);

      const open = await this.payments.findOpenShift(hospitalId, auth.userId, tx);
      const shift = open === null ? null : await this.payments.lockShift(hospitalId, open.id, tx);
      if (shift === null || shift.closedAt !== null) throw Errors.shiftRequired();
      if (request.amountPaise > (await this.refundable(hospitalId, request.patientId, this.refundSource(request), id, tx))) throw Errors.amountTooLarge();

      const { number, financialYear } = await this.numbering.nextDocumentNumber(hospitalId, 'refund', tx, now);
      const refund = await this.approvals.createRefund(
        hospitalId,
        {
          patientId: request.patientId,
          approvalRequestId: id,
          number,
          financialYear,
          shiftId: shift.id,
          receiptId: request.receiptId,
          invoiceId: request.invoiceId,
          mode: details.mode,
          amountPaise: request.amountPaise,
          reference: input.reference ?? null,
          bankName: input.bankName ?? null,
          paidById: auth.userId,
        },
        tx,
      );
      await this.audit.record(
        {
          action: 'payments.refund.paid',
          hospitalId,
          actorUserId: auth.userId,
          entityType: 'refund',
          entityId: refund.id,
          meta,
          details: { number, mode: details.mode, amountPaise: paise(request.amountPaise), approvalRequestId: id },
        },
        tx,
      );
      return refund.id;
    });
    return this.refundDocument(hospitalId, refundId);
  }

  // Receipt voids.

  /** A receipt is voidable while its shift is open, if it is not void already and (for a deposit) nothing of it was used. */
  private voidable(receipt: ReceiptStateRow): boolean {
    if (receipt.voidRecord !== null || receipt.shift.closedAt !== null) return false;
    return receipt.purpose !== 'deposit' || (receipt.allocations.length === 0 && receipt.refunds.length === 0);
  }

  /** Asks for a receipt entered by mistake (wrong patient, amount or mode) to be voided. */
  async requestVoid(auth: AuthContext, input: RequestReceiptVoid, meta: RequestMeta): Promise<ApprovalRequest> {
    const hospitalId = hospitalOf(auth);
    const receipt = await this.approvals.receiptState(hospitalId, input.receiptId);
    if (receipt === null) throw Errors.notFound('receipt');
    if (!this.voidable(receipt)) throw Errors.receiptNotVoidable();
    return this.create(
      auth,
      hospitalId,
      {
        kind: 'receipt_void',
        patientId: receipt.patientId,
        invoiceId: null,
        receiptId: receipt.id,
        amountPaise: receipt.amountPaise,
        reason: input.reason,
        details: { kind: 'receipt_void', purpose: receipt.purpose, mode: receipt.mode },
      },
      meta,
    );
  }

  private async approveVoid(auth: AuthContext, hospitalId: string, id: string, input: ApproveRequest, meta: RequestMeta, now: Date, tx: Tx): Promise<RequestRow> {
    const request = await this.pendingForDecision(auth, hospitalId, 'receipt_void', id, tx);
    const receipt = request.receiptId === null ? null : await this.approvals.lockReceipt(hospitalId, request.receiptId, tx);
    if (receipt === null || !this.voidable(receipt)) throw Errors.receiptNotVoidable();
    const decided = await this.approvals.decide(id, { status: 'approved', decidedById: auth.userId, decidedAt: now, decisionNote: input.note ?? null }, tx);
    await this.approvals.createVoid(hospitalId, { receiptId: receipt.id, approvalRequestId: id, voidedById: auth.userId }, tx);
    await this.recordDecision(auth, hospitalId, decided, 'approved', meta, tx);
    await this.audit.record(
      { action: 'payments.receipt.voided', hospitalId, actorUserId: auth.userId, entityType: 'receipt', entityId: receipt.id, meta, details: { approvalRequestId: id } },
      tx,
    );
    return decided;
  }

  // Decisions.

  private detailsOf<K extends ApprovalDetails['kind']>(request: RequestRow, kind: K): Extract<ApprovalDetails, { kind: K }> {
    const details = request.details as ApprovalDetails;
    if (details.kind !== kind) throw new Error('Request details do not match its kind');
    return details as Extract<ApprovalDetails, { kind: K }>;
  }

  /** Approves a request of one kind. The route's permission is checked by its guard. */
  async approve(auth: AuthContext, kind: ApprovalKind, id: string, input: ApproveRequest, meta: RequestMeta, now: Date = new Date()): Promise<ApprovalRequest> {
    const hospitalId = hospitalOf(auth);
    const row = await this.transactions.run((tx) => {
      switch (kind) {
        case 'discount':
          return this.approveDiscount(auth, hospitalId, id, input, meta, now, tx);
        case 'credit_note':
          return this.approveCreditNote(auth, hospitalId, id, input, meta, now, tx);
        case 'refund':
          return this.approveRefund(auth, hospitalId, id, input, meta, now, tx);
        case 'receipt_void':
          return this.approveVoid(auth, hospitalId, id, input, meta, now, tx);
      }
    });
    return this.view(hospitalId, (await this.approvals.findRequest(hospitalId, row.id)) ?? row);
  }

  /** Rejects a request, always with a reason. Nothing else changes. The route's guard checks the permission. */
  async reject(auth: AuthContext, kind: ApprovalKind, id: string, input: RejectRequest, meta: RequestMeta, now: Date = new Date()): Promise<ApprovalRequest> {
    const hospitalId = hospitalOf(auth);
    const row = await this.transactions.run(async (tx) => {
      const request = await this.pendingForDecision(auth, hospitalId, kind, id, tx);
      const decided = await this.approvals.decide(request.id, { status: 'rejected', decidedById: auth.userId, decidedAt: now, decisionNote: input.note }, tx);
      await this.recordDecision(auth, hospitalId, decided, 'rejected', meta, tx);
      return decided;
    });
    return this.view(hospitalId, row);
  }

  // Reading.

  async list(auth: AuthContext, query: ApprovalListQuery): Promise<Paginated<ApprovalRequest>> {
    const hospitalId = hospitalOf(auth);
    const { rows, total } = await this.approvals.listRequests(hospitalId, query, query);
    const [names, limit] = await Promise.all([
      this.billing.userNames(
        hospitalId,
        rows.flatMap((row) => [row.requestedById, row.decidedById]),
      ),
      this.approvals.discountLimit(hospitalId),
    ]);
    return paged(
      rows.map((row) => toApprovalRequest(row, names, limit)),
      total,
      query,
    );
  }

  async get(auth: AuthContext, id: string): Promise<ApprovalRequest> {
    const hospitalId = hospitalOf(auth);
    const row = await this.approvals.findRequest(hospitalId, id);
    if (row === null) throw Errors.notFound('request');
    return this.view(hospitalId, row);
  }

  /** A credit note, for printing. Views are audited like bills. */
  async getCreditNote(auth: AuthContext, id: string, meta: RequestMeta): Promise<CreditNote> {
    const hospitalId = hospitalOf(auth);
    const row = await this.approvals.findCreditNote(hospitalId, id);
    if (row === null) throw Errors.notFound('credit note');
    const names = await this.billing.userNames(hospitalId, [row.approvalRequest.requestedById, row.approvedById]);
    await this.audit.record({ action: 'billing.credit-note.viewed', hospitalId, actorUserId: auth.userId, entityType: 'credit_note', entityId: id, meta });
    return toCreditNote(row, names);
  }

  private async refundDocument(hospitalId: string, id: string): Promise<Refund> {
    const row = await this.approvals.findRefund(hospitalId, id);
    if (row === null) throw Errors.notFound('refund');
    const [issuer, patient, names] = await Promise.all([
      this.billing.issuer(hospitalId),
      this.billing.findPatient(hospitalId, row.patientId),
      this.billing.userNames(hospitalId, [row.paidById, row.approvalRequest.decidedById]),
    ]);
    if (patient === null) throw Errors.notFound('refund');
    return toRefund(row, toIssuer(issuer), toBilledPatient(patient), names);
  }

  /** A refund, for printing. */
  async getRefund(auth: AuthContext, id: string, meta: RequestMeta): Promise<Refund> {
    const hospitalId = hospitalOf(auth);
    const refund = await this.refundDocument(hospitalId, id);
    await this.audit.record({ action: 'payments.refund.viewed', hospitalId, actorUserId: auth.userId, entityType: 'refund', entityId: id, meta });
    return refund;
  }
}

