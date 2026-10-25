import { Injectable } from '@nestjs/common';
import type { Paginated } from '@devmsr/types';
import type {
  CancelVisit,
  Consultation,
  ConsultationNotes,
  IssueToken,
  OpdQueue,
  OpdVisit,
  OpdVisitListQuery,
  PayOpdFee,
  PlaceOrder,
  Receipt,
} from '@devmsr/validation';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import { BillingRepository } from '../billing/billing.repository.js';
import { paise, toBilledPatient, toIssuer } from '../billing/dto/billing.mapper.js';
import { billAmounts } from '../billing/money.js';
import { fromDateOnly, toDateOnly, todayIst } from '../common/dates.js';
import { Errors } from '../common/errors/app-error.js';
import type { RequestMeta } from '../common/http/app-request.js';
import { hospitalOf } from '../common/http/hospital-scope.js';
import { paged } from '../common/http/pagination.js';
import type { Tx } from '../common/prisma/tx.js';
import { TransactionRunner } from '../common/prisma/transaction-runner.js';
import { NumberingService } from '../numbering/numbering.service.js';
import { toReceipt } from '../payments/dto/payments.mapper.js';
import { PaymentsRepository } from '../payments/payments.repository.js';
import { toConsultation, toOpdVisit } from './dto/opd.mapper.js';
import { OpdRepository, type VisitRow } from './opd.repository.js';

/** Note fields are written as given; an empty note is stored as nothing. */
function noteValue(text: string | null): string | null {
  return text === null || text === '' ? null : text;
}

@Injectable()
export class OpdService {
  constructor(
    private readonly opd: OpdRepository,
    private readonly billing: BillingRepository,
    private readonly payments: PaymentsRepository,
    private readonly numbering: NumberingService,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
  ) {}

  private async names(hospitalId: string, rows: readonly VisitRow[]): Promise<Map<string, string>> {
    return this.billing.userNames(
      hospitalId,
      rows.map((row) => row.createdById),
    );
  }

  private async view(hospitalId: string, row: VisitRow): Promise<OpdVisit> {
    return toOpdVisit(row, await this.names(hospitalId, [row]));
  }

  /**
   * A token for a walk-in patient to see a doctor today. Tokens are numbered for the whole hospital
   * and restart every day. The fee shown is the doctor's consultation rate today; nothing is charged
   * until the cashier takes it.
   */
  async issueToken(auth: AuthContext, input: IssueToken, meta: RequestMeta, now: Date = new Date()): Promise<OpdVisit> {
    const hospitalId = hospitalOf(auth);
    if ((await this.billing.findPatient(hospitalId, input.patientId)) === null) throw Errors.notFound('patient');
    const today = todayIst(now);
    const doctor = await this.opd.doctorForToken(hospitalId, input.doctorId, today);
    if (doctor === null) throw Errors.referenceInvalid('doctor');
    const consultation = doctor.serviceItems.find((item) => item.rates.length > 0);
    const rate = consultation?.rates[0];
    if (consultation === undefined || rate === undefined) throw Errors.rateMissing();

    const row = await this.transactions.run(async (tx) => {
      if ((await this.opd.hasOpenVisit(hospitalId, input.patientId, doctor.id, today, tx)) > 0) throw Errors.tokenExists();
      const { tokenNumber, visitDate } = await this.numbering.nextOpdToken(hospitalId, tx, now);
      const visit = await this.opd.createVisit(
        {
          hospitalId,
          patientId: input.patientId,
          doctorId: doctor.id,
          serviceItemId: consultation.id,
          visitDate: fromDateOnly(visitDate),
          tokenNumber,
          quotedFeePaise: rate.ratePaise,
          createdById: auth.userId,
        },
        tx,
      );
      await this.audit.record(
        {
          action: 'opd.token.issued',
          hospitalId,
          actorUserId: auth.userId,
          entityType: 'opd_visit',
          entityId: visit.id,
          meta,
          details: { tokenNumber, visitDate, doctorId: doctor.id, patientId: input.patientId },
        },
        tx,
      );
      return visit;
    });
    return this.view(hospitalId, row);
  }

  async listVisits(auth: AuthContext, query: OpdVisitListQuery, now: Date = new Date()): Promise<Paginated<OpdVisit>> {
    const hospitalId = hospitalOf(auth);
    const { rows, total } = await this.opd.listVisits(hospitalId, { date: query.date ?? todayIst(now), status: query.status, doctorId: query.doctorId }, query);
    const names = await this.names(hospitalId, rows);
    return paged(
      rows.map((row) => toOpdVisit(row, names)),
      total,
      query,
    );
  }

  /** A visit without its clinical notes: the token slip and the desks. */
  async getVisit(auth: AuthContext, id: string): Promise<OpdVisit> {
    const hospitalId = hospitalOf(auth);
    const row = await this.opd.findVisit(hospitalId, id);
    if (row === null) throw Errors.notFound('visit');
    return this.view(hospitalId, row);
  }

  /** Cancels a token that has not been paid for. A paid visit has a bill, so it is not cancelled here. */
  async cancel(auth: AuthContext, id: string, input: CancelVisit, meta: RequestMeta, now: Date = new Date()): Promise<OpdVisit> {
    const hospitalId = hospitalOf(auth);
    const row = await this.transactions.run(async (tx) => {
      const visit = await this.opd.lockVisit(hospitalId, id, tx);
      if (visit === null) throw Errors.notFound('visit');
      if (visit.status !== 'awaiting_payment') throw Errors.visitState();
      const cancelled = await this.opd.updateVisit(id, { status: 'cancelled', cancelledAt: now, cancelledById: auth.userId, cancelReason: input.reason }, tx);
      await this.audit.record({ action: 'opd.token.cancelled', hospitalId, actorUserId: auth.userId, entityType: 'opd_visit', entityId: id, meta }, tx);
      return cancelled;
    });
    return this.view(hospitalId, row);
  }

  /**
   * Takes the consultation fee at the cash counter, in one transaction: the charge at today's rate,
   * a bill issued for it, and the receipt in the cashier's open shift. The paid token then joins the
   * doctor's queue. There is no queue without payment (docs/billing-rules.md).
   */
  async payFee(auth: AuthContext, id: string, input: PayOpdFee, meta: RequestMeta, now: Date = new Date()): Promise<Receipt> {
    const hospitalId = hospitalOf(auth);
    const receiptId = await this.transactions.run(async (tx) => {
      const open = await this.payments.findOpenShift(hospitalId, auth.userId, tx);
      const shift = open === null ? null : await this.payments.lockShift(hospitalId, open.id, tx);
      if (shift === null || shift.closedAt !== null) throw Errors.shiftRequired();
      const visit = await this.opd.lockVisit(hospitalId, id, tx);
      if (visit === null) throw Errors.notFound('visit');
      if (visit.status !== 'awaiting_payment') throw Errors.visitState();

      const visitDate = toDateOnly(visit.visitDate);
      const item = await this.billing.findItemAndRate(hospitalId, visit.serviceItemId, visitDate);
      const rate = item?.rates[0];
      if (item === null || rate === undefined) throw Errors.rateMissing();
      const bill = billAmounts([{ unitRatePaise: rate.ratePaise, quantity: 1, taxRateBp: rate.taxRateBp }]);
      // A receipt is always for some money; a fee that rounds to nothing has no rate to charge.
      if (bill.totalPaise <= 0n) throw Errors.rateMissing();

      const charge = await this.billing.createCharge(
        {
          hospitalId,
          patientId: visit.patientId,
          serviceItemId: item.id,
          tariffRateId: rate.id,
          description: item.name,
          serviceDate: visit.visitDate,
          quantity: 1,
          unitRatePaise: rate.ratePaise,
          taxRateBp: rate.taxRateBp,
          amountPaise: rate.ratePaise,
          postedById: auth.userId,
        },
        tx,
      );
      const [line] = bill.lines;
      if (line === undefined) throw new Error('A fee bill has one line');
      const { lines: _lines, ...totals } = bill;
      const draft = await this.billing.createDraft(
        hospitalId,
        visit.patientId,
        auth.userId,
        totals,
        [
          {
            chargeId: charge.id,
            lineNo: 1,
            description: item.name,
            serviceDate: visit.visitDate,
            quantity: 1,
            unitRatePaise: rate.ratePaise,
            taxRateBp: rate.taxRateBp,
            ...line,
          },
        ],
        tx,
      );
      if ((await this.billing.attachCharges(hospitalId, [charge.id], draft.id, tx)) !== 1) throw Errors.chargeUnavailable();
      const invoiceNumber = await this.numbering.nextDocumentNumber(hospitalId, 'invoice', tx, now);
      const issuer = toIssuer(await this.billing.issuer(hospitalId, tx));
      await this.billing.issue(
        draft.id,
        { ...invoiceNumber, issuedById: auth.userId, issuedAt: now, issuerSnapshot: issuer, patientSnapshot: toBilledPatient(draft.patient) },
        tx,
      );
      await this.billing.markChargesBilled(draft.id, tx);

      const receiptNumber = await this.numbering.nextDocumentNumber(hospitalId, 'receipt', tx, now);
      const newReceiptId = await this.payments.createReceipt(
        hospitalId,
        {
          patientId: visit.patientId,
          number: receiptNumber.number,
          financialYear: receiptNumber.financialYear,
          shiftId: shift.id,
          purpose: 'bill_payment',
          mode: input.mode,
          amountPaise: bill.totalPaise,
          reference: input.reference ?? null,
          cardLast4: input.cardLast4 ?? null,
          bankName: input.bankName ?? null,
          receivedById: auth.userId,
        },
        tx,
      );
      await this.payments.allocate(hospitalId, { receiptId: newReceiptId, invoiceId: draft.id, amountPaise: bill.totalPaise, allocatedById: auth.userId }, tx);
      await this.opd.updateVisit(id, { status: 'waiting', feeInvoiceId: draft.id, paidAt: now }, tx);
      await this.audit.record(
        {
          action: 'opd.fee.paid',
          hospitalId,
          actorUserId: auth.userId,
          entityType: 'opd_visit',
          entityId: id,
          meta,
          details: { invoiceNumber: invoiceNumber.number, receiptNumber: receiptNumber.number, mode: input.mode, amountPaise: paise(bill.totalPaise) },
        },
        tx,
      );
      return newReceiptId;
    });
    const row = await this.payments.findReceipt(hospitalId, receiptId);
    if (row === null) throw Errors.notFound('receipt');
    const [issuer, names] = await Promise.all([this.billing.issuer(hospitalId), this.billing.userNames(hospitalId, [row.receivedById])]);
    return toReceipt(row, toIssuer(issuer), names.get(row.receivedById) ?? null);
  }

  /** The signed-in doctor's paid visits for today, in token order. */
  async queue(auth: AuthContext, now: Date = new Date()): Promise<OpdQueue> {
    const hospitalId = hospitalOf(auth);
    const doctor = await this.opd.doctorOfUser(hospitalId, auth.userId);
    if (doctor === null) return { doctor: null, visits: [], completedToday: 0 };
    const { rows, completed } = await this.opd.queue(hospitalId, doctor.id, todayIst(now));
    const names = await this.names(hospitalId, rows);
    return { doctor, visits: rows.map((row) => toOpdVisit(row, names)), completedToday: completed };
  }

  /**
   * A visit of the signed-in doctor, locked. Another doctor's visit, or another hospital's, is not
   * found: notes are for the treating doctor.
   */
  private async ownVisit(auth: AuthContext, hospitalId: string, id: string, tx: Tx): Promise<VisitRow> {
    const visit = await this.opd.lockVisit(hospitalId, id, tx);
    if (visit?.doctor.userId !== auth.userId) throw Errors.notFound('visit');
    return visit;
  }

  async call(auth: AuthContext, id: string, meta: RequestMeta, now: Date = new Date()): Promise<Consultation> {
    const hospitalId = hospitalOf(auth);
    await this.transactions.run(async (tx) => {
      const visit = await this.ownVisit(auth, hospitalId, id, tx);
      if (visit.status !== 'waiting') throw Errors.visitState();
      await this.opd.updateVisit(id, { status: 'with_doctor', calledAt: now }, tx);
      await this.audit.record({ action: 'opd.visit.called', hospitalId, actorUserId: auth.userId, entityType: 'opd_visit', entityId: id, meta }, tx);
    });
    return this.consultation(auth, id, meta);
  }

  /** The visit with its notes and orders, for its doctor. Viewing notes is audited like a record view. */
  async consultation(auth: AuthContext, id: string, meta: RequestMeta): Promise<Consultation> {
    const hospitalId = hospitalOf(auth);
    const row = await this.opd.findConsultation(hospitalId, id);
    if (row?.doctor.userId !== auth.userId) throw Errors.notFound('visit');
    await this.audit.record({ action: 'opd.consultation.viewed', hospitalId, actorUserId: auth.userId, entityType: 'opd_visit', entityId: id, meta });
    return toConsultation(row, await this.names(hospitalId, [row]));
  }

  /** Saves the doctor's notes while the patient is with them. The audit names the fields, not their text. */
  async saveNotes(auth: AuthContext, id: string, input: ConsultationNotes, meta: RequestMeta, now: Date = new Date()): Promise<Consultation> {
    const hospitalId = hospitalOf(auth);
    await this.transactions.run(async (tx) => {
      const visit = await this.ownVisit(auth, hospitalId, id, tx);
      if (visit.status !== 'with_doctor') throw Errors.visitState();
      await this.opd.updateVisit(
        id,
        {
          complaints: noteValue(input.complaints),
          findings: noteValue(input.findings),
          diagnosis: noteValue(input.diagnosis),
          advice: noteValue(input.advice),
          followUpDate: input.followUpDate === null ? null : fromDateOnly(input.followUpDate),
          admissionAdvised: input.admissionAdvised,
          notesUpdatedAt: now,
        },
        tx,
      );
      const written = (['complaints', 'findings', 'diagnosis', 'advice', 'followUpDate'] as const).filter((field) => input[field] !== null && input[field] !== '');
      await this.audit.record(
        {
          action: 'opd.notes.saved',
          hospitalId,
          actorUserId: auth.userId,
          entityType: 'opd_visit',
          entityId: id,
          meta,
          details: { fields: written.join(','), admissionAdvised: input.admissionAdvised },
        },
        tx,
      );
    });
    return this.consultation(auth, id, meta);
  }

  /** A test or procedure ordered during the visit. Its charge is posted at today's rate, for billing. */
  async placeOrder(auth: AuthContext, id: string, input: PlaceOrder, meta: RequestMeta, now: Date = new Date()): Promise<Consultation> {
    const hospitalId = hospitalOf(auth);
    const today = todayIst(now);
    const item = await this.opd.orderableItem(hospitalId, input.serviceItemId, today);
    if (item === null) throw Errors.referenceInvalid('service item');
    const rate = item.rates[0];
    if (rate === undefined) throw Errors.rateMissing();
    await this.transactions.run(async (tx) => {
      const visit = await this.ownVisit(auth, hospitalId, id, tx);
      if (visit.status !== 'with_doctor') throw Errors.visitState();
      const charge = await this.billing.createCharge(
        {
          hospitalId,
          patientId: visit.patientId,
          serviceItemId: item.id,
          tariffRateId: rate.id,
          description: item.name,
          serviceDate: fromDateOnly(today),
          quantity: input.quantity,
          unitRatePaise: rate.ratePaise,
          taxRateBp: rate.taxRateBp,
          amountPaise: rate.ratePaise * BigInt(input.quantity),
          postedById: auth.userId,
        },
        tx,
      );
      await this.opd.createOrder(hospitalId, { visitId: id, chargeId: charge.id, orderedById: auth.userId }, tx);
      await this.audit.record(
        {
          action: 'opd.order.placed',
          hospitalId,
          actorUserId: auth.userId,
          entityType: 'opd_visit',
          entityId: id,
          meta,
          details: { serviceItemId: item.id, quantity: input.quantity, chargeId: charge.id, amountPaise: paise(charge.amountPaise) },
        },
        tx,
      );
    });
    return this.consultation(auth, id, meta);
  }

  /** Ends the visit. Its notes are locked from then on (a database trigger enforces it). */
  async complete(auth: AuthContext, id: string, meta: RequestMeta, now: Date = new Date()): Promise<Consultation> {
    const hospitalId = hospitalOf(auth);
    await this.transactions.run(async (tx) => {
      const visit = await this.ownVisit(auth, hospitalId, id, tx);
      if (visit.status !== 'with_doctor') throw Errors.visitState();
      await this.opd.updateVisit(id, { status: 'completed', completedAt: now }, tx);
      await this.audit.record({ action: 'opd.visit.completed', hospitalId, actorUserId: auth.userId, entityType: 'opd_visit', entityId: id, meta }, tx);
    });
    return this.consultation(auth, id, meta);
  }
}
