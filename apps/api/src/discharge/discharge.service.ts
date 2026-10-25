import { Injectable } from '@nestjs/common';
import type { Paginated } from '@devmsr/types';
import type { Discharge, DischargeListQuery, DischargeRow as DischargeRowDto, DischargeSummaryDocument, DischargeSummaryInput, Invoice, MarkFit } from '@devmsr/validation';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import { BillingRepository, NO_MONEY } from '../billing/billing.repository.js';
import { BillingService } from '../billing/billing.service.js';
import { paise, toBilledPatient, toInvoiceSummary, toIssuer } from '../billing/dto/billing.mapper.js';
import { fromDateOnly } from '../common/dates.js';
import { Errors } from '../common/errors/app-error.js';
import type { RequestMeta } from '../common/http/app-request.js';
import { hospitalOf } from '../common/http/hospital-scope.js';
import { paged } from '../common/http/pagination.js';
import type { Tx } from '../common/prisma/tx.js';
import { TransactionRunner } from '../common/prisma/transaction-runner.js';
import { Prisma } from '../generated/prisma/client.js';
import { IpdChargesService } from '../ipd/ipd-charges.service.js';
import { IpdRepository } from '../ipd/ipd.repository.js';
import { chargeableDays, daysMissingCharges } from '../ipd/nights.js';
import { accountState, isSettled, onlyDueLeft, type AccountState } from './discharge-balance.js';
import { DischargeRepository, type DischargeRow } from './discharge.repository.js';
import { namedUsers, toBalance, toDischarge, toDischargeRow, toSummaryDocument } from './dto/discharge.mapper.js';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** The money and charges that must be settled at clearance, checked again at completion. */
export interface DuesCheck {
  dischargeId: string;
  patientId: string;
  admissionId: string;
  admissionNumber: string;
  state: AccountState;
}

/**
 * Discharge (docs/billing-rules.md, discharge): the treating doctor marks the patient fit, billing
 * prepares the final bill, the account is settled and billing gives clearance (with money still due
 * only on the MD's approval), the doctor drafts the summary and the MD signs it off, and the ward
 * completes the discharge: the bed goes to cleaning.
 */
@Injectable()
export class DischargeService {
  constructor(
    private readonly discharges: DischargeRepository,
    private readonly ipd: IpdRepository,
    private readonly charges: IpdChargesService,
    private readonly billingRepo: BillingRepository,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
  ) {}

  private async requireTreatingDoctor(hospitalId: string, auth: AuthContext, doctorId: string): Promise<void> {
    const doctor = await this.discharges.doctorOfUser(hospitalId, auth.userId);
    if (doctor?.id !== doctorId) throw Errors.notTreatingDoctor();
  }

  /** Where the patient's account stands now, inside `tx` when given. */
  private async stateOf(hospitalId: string, row: DischargeRow, now: Date, tx?: Tx): Promise<AccountState> {
    const { patientId, admittedAt } = row.admission;
    const [unbilled, bills, held, posted] = await Promise.all([
      this.discharges.unbilled(hospitalId, patientId, tx),
      this.discharges.issuedBills(hospitalId, patientId, tx),
      this.ipd.depositHeld(hospitalId, patientId, tx),
      this.discharges.postedDays(row.admissionId, tx),
    ]);
    const balances = await this.billingRepo.balances(
      bills.map((bill) => bill.id),
      tx,
    );
    return accountState({
      unbilledCount: unbilled.count,
      unbilledPaise: unbilled.paise,
      bills: bills.map((bill) => ({ totalPaise: bill.totalPaise, balance: balances.get(bill.id) ?? NO_MONEY })),
      depositHeldPaise: held,
      // A completed discharge has no more days to charge; this only matters before completion.
      missingRoomCharges: row.completedAt === null ? daysMissingCharges(chargeableDays(admittedAt, now), posted) : [],
    });
  }

  private async view(auth: AuthContext, hospitalId: string, row: DischargeRow, now: Date, tx?: Tx): Promise<Discharge> {
    const [names, invoices, state, doctor] = await Promise.all([
      this.billingRepo.userNames(hospitalId, namedUsers(row)),
      this.billingRepo.patientInvoices(hospitalId, row.admission.patientId),
      this.stateOf(hospitalId, row, now, tx),
      this.discharges.doctorOfUser(hospitalId, auth.userId),
    ]);
    const stay = invoices.filter((invoice) => invoice.createdAt >= row.admission.admittedAt);
    const balances = await this.billingRepo.balances(stay.map((invoice) => invoice.id));
    const bills = stay.map((invoice) => toInvoiceSummary(invoice, balances.get(invoice.id)));
    return toDischarge(row, names, bills, state, doctor?.id === row.admission.doctor.id);
  }

  private async reload(auth: AuthContext, hospitalId: string, id: string, now: Date): Promise<Discharge> {
    const row = await this.discharges.find(hospitalId, id);
    if (row === null) throw Errors.notFound('discharge');
    return this.view(auth, hospitalId, row, now);
  }

  private async open(hospitalId: string, id: string, tx: Tx): Promise<DischargeRow> {
    const row = await this.discharges.lock(hospitalId, id, tx);
    if (row === null) throw Errors.notFound('discharge');
    if (row.completedAt !== null) throw Errors.dischargeStep('This patient has already been discharged.');
    return row;
  }

  /** The treating doctor marks the patient fit for discharge. This starts the discharge. */
  async markFit(auth: AuthContext, input: MarkFit, meta: RequestMeta, now: Date = new Date()): Promise<Discharge> {
    const hospitalId = hospitalOf(auth);
    const admission = await this.ipd.findAdmission(hospitalId, input.admissionId);
    if (admission === null) throw Errors.notFound('admission');
    if (admission.status !== 'admitted') throw Errors.admissionState();
    await this.requireTreatingDoctor(hospitalId, auth, admission.doctor.id);
    let id: string;
    try {
      id = await this.transactions.run(async (tx) => {
        const created = await this.discharges.create(hospitalId, { admissionId: admission.id, fitAt: now, fitById: auth.userId, fitNote: input.note ?? null }, tx);
        await this.audit.record(
          { action: 'ipd.discharge.fit-marked', hospitalId, actorUserId: auth.userId, entityType: 'discharge', entityId: created.id, meta, details: { admissionId: admission.id } },
          tx,
        );
        return created.id;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw Errors.dischargeStep('This patient is already marked fit for discharge.');
      throw error;
    }
    return this.reload(auth, hospitalId, id, now);
  }

  async list(auth: AuthContext, query: DischargeListQuery): Promise<Paginated<DischargeRowDto>> {
    const hospitalId = hospitalOf(auth);
    const completed = query.status === undefined ? undefined : query.status === 'completed';
    const { rows, total } = await this.discharges.list(hospitalId, { completed }, query);
    const names = await this.billingRepo.userNames(
      hospitalId,
      rows.map((row) => row.fitById),
    );
    return paged(
      rows.map((row) => toDischargeRow(row, names)),
      total,
      query,
    );
  }

  /** One discharge with the patient's bills and account. Audited like the patient's account. */
  async get(auth: AuthContext, id: string, meta: RequestMeta, now: Date = new Date()): Promise<Discharge> {
    const hospitalId = hospitalOf(auth);
    const row = await this.discharges.find(hospitalId, id);
    if (row === null) throw Errors.notFound('discharge');
    await this.audit.record({ action: 'ipd.discharge.viewed', hospitalId, actorUserId: auth.userId, entityType: 'discharge', entityId: id, meta });
    return this.view(auth, hospitalId, row, now);
  }

  /**
   * The final bill: posts any room and nursing charges due (missed nights, or the one day of a same-day
   * stay), then drafts a bill of every charge not yet on a bill. Billing issues it as any other bill.
   */
  async prepareFinalBill(auth: AuthContext, id: string, meta: RequestMeta, now: Date = new Date()): Promise<Invoice> {
    const hospitalId = hospitalOf(auth);
    try {
      return await this.transactions.run(async (tx) => {
        const row = await this.open(hospitalId, id, tx);
        const { missing } = await this.charges.postForAdmission(hospitalId, row.admissionId, now, auth.userId, tx);
        if (missing.length > 0) throw Errors.roomChargesMissing(missing);
        const chargeIds = await this.discharges.freeChargeIds(hospitalId, row.admission.patientId, tx);
        if (chargeIds.length === 0) throw Errors.nothingToBill();
        const bill = await this.billing.draftFromCharges(hospitalId, auth.userId, row.admission.patientId, chargeIds, meta, tx);
        await this.audit.record(
          { action: 'ipd.final-bill.prepared', hospitalId, actorUserId: auth.userId, entityType: 'discharge', entityId: id, meta, details: { invoiceId: bill.id } },
          tx,
        );
        return bill;
      });
    } catch (error) {
      // The midnight job posted the same night at the same moment: the next try finds it posted.
      if (isUniqueViolation(error)) throw Errors.dischargeStep('Room charges were being posted at the same moment. Try again.');
      throw error;
    }
  }

  /** Billing clearance at a zero balance. Money still due needs the MD (a clearance with dues request). */
  async clear(auth: AuthContext, id: string, meta: RequestMeta, now: Date = new Date()): Promise<Discharge> {
    const hospitalId = hospitalOf(auth);
    await this.transactions.run(async (tx) => {
      const row = await this.open(hospitalId, id, tx);
      const state = await this.stateOf(hospitalId, row, now, tx);
      if (!isSettled(state, 0n)) throw Errors.balanceNotZero(toBalance(state));
      await this.discharges.createClearance(hospitalId, { dischargeId: id, clearedAt: now, clearedById: auth.userId, duePaise: 0n, approvalRequestId: null }, tx);
      await this.audit.record(
        { action: 'billing.clearance.granted', hospitalId, actorUserId: auth.userId, entityType: 'discharge', entityId: id, meta, details: { duePaise: 0 } },
        tx,
      );
    });
    return this.reload(auth, hospitalId, id, now);
  }

  /**
   * What a clearance with dues would clear, for the request the MD decides. Everything but the amount
   * due must already be settled: bill every charge and use the deposit first.
   */
  async duesToClear(auth: AuthContext, id: string, now: Date = new Date()): Promise<DuesCheck> {
    const hospitalId = hospitalOf(auth);
    const row = await this.discharges.find(hospitalId, id);
    if (row === null) throw Errors.notFound('discharge');
    if (row.completedAt !== null) throw Errors.dischargeStep('This patient has already been discharged.');
    const state = await this.stateOf(hospitalId, row, now);
    if (state.duePaise === 0n && isSettled(state, 0n)) throw Errors.nothingDue();
    if (!onlyDueLeft(state)) throw Errors.balanceNotZero(toBalance(state));
    return { dischargeId: id, patientId: row.admission.patientId, admissionId: row.admissionId, admissionNumber: row.admission.number, state };
  }

  /**
   * The MD approved a clearance with dues: billing clearance is given now, inside the approval's
   * transaction, for what is due now. More than was approved means asking again.
   */
  async clearWithDues(hospitalId: string, approverId: string, request: { id: string; dischargeId: string; amountPaise: bigint }, meta: RequestMeta, now: Date, tx: Tx): Promise<void> {
    const row = await this.open(hospitalId, request.dischargeId, tx);
    const state = await this.stateOf(hospitalId, row, now, tx);
    if (!isSettled(state, request.amountPaise)) throw Errors.balanceNotZero(toBalance(state));
    await this.discharges.createClearance(
      hospitalId,
      { dischargeId: row.id, clearedAt: now, clearedById: approverId, duePaise: state.duePaise, approvalRequestId: request.id },
      tx,
    );
    await this.audit.record(
      {
        action: 'billing.clearance.granted',
        hospitalId,
        actorUserId: approverId,
        entityType: 'discharge',
        entityId: row.id,
        meta,
        details: { duePaise: paise(state.duePaise), approvalRequestId: request.id },
      },
      tx,
    );
  }

  // The discharge summary.

  private async summaryDocument(hospitalId: string, id: string): Promise<DischargeSummaryDocument> {
    const row = await this.discharges.summaryDocument(hospitalId, id);
    if (row === null) throw Errors.notFound('discharge');
    const [issuer, patient, names] = await Promise.all([
      this.billingRepo.issuer(hospitalId),
      this.billingRepo.findPatient(hospitalId, row.admission.patientId),
      this.billingRepo.userNames(hospitalId, [row.summary?.draftedById ?? null, row.summary?.signedById ?? null]),
    ]);
    if (patient === null) throw Errors.notFound('discharge');
    return toSummaryDocument(row, toIssuer(issuer), toBilledPatient(patient), row.admission.number, names);
  }

  /** The treating doctor writes or rewrites the summary until the MD signs it. */
  async saveSummary(auth: AuthContext, id: string, input: DischargeSummaryInput, meta: RequestMeta, now: Date = new Date()): Promise<DischargeSummaryDocument> {
    const hospitalId = hospitalOf(auth);
    await this.transactions.run(async (tx) => {
      const row = await this.open(hospitalId, id, tx);
      await this.requireTreatingDoctor(hospitalId, auth, row.admission.doctor.id);
      if (row.summary !== null && row.summary.signedAt !== null) throw Errors.dischargeStep('The summary is signed and can no longer change.');
      await this.discharges.saveSummary(
        hospitalId,
        id,
        {
          diagnosis: input.diagnosis,
          courseInHospital: input.courseInHospital,
          conditionAtDischarge: input.conditionAtDischarge,
          medications: input.medications,
          advice: input.advice,
          followUpDate: input.followUpDate === null ? null : fromDateOnly(input.followUpDate),
        },
        auth.userId,
        now,
        tx,
      );
      // Field names only: the text is clinical.
      await this.audit.record(
        { action: 'ipd.discharge-summary.saved', hospitalId, actorUserId: auth.userId, entityType: 'discharge', entityId: id, meta, details: { fields: Object.keys(input).join(',') } },
        tx,
      );
    });
    return this.summaryDocument(hospitalId, id);
  }

  /** The MD signs the summary off. Whoever wrote it cannot sign it, and after this it never changes. */
  async signSummary(auth: AuthContext, id: string, meta: RequestMeta, now: Date = new Date()): Promise<DischargeSummaryDocument> {
    const hospitalId = hospitalOf(auth);
    await this.transactions.run(async (tx) => {
      const row = await this.open(hospitalId, id, tx);
      if (row.summary === null) throw Errors.dischargeStep('The doctor has not written the summary yet.');
      if (row.summary.signedAt !== null) throw Errors.dischargeStep('The summary is already signed.');
      if (row.summary.draftedById === auth.userId) throw Errors.selfApproval();
      await this.discharges.signSummary(hospitalId, id, auth.userId, now, tx);
      await this.audit.record({ action: 'ipd.discharge-summary.signed', hospitalId, actorUserId: auth.userId, entityType: 'discharge', entityId: id, meta }, tx);
    });
    return this.summaryDocument(hospitalId, id);
  }

  /** The summary for reading and printing. Audited like a clinical record view. */
  async getSummary(auth: AuthContext, id: string, meta: RequestMeta): Promise<DischargeSummaryDocument> {
    const hospitalId = hospitalOf(auth);
    const document = await this.summaryDocument(hospitalId, id);
    await this.audit.record({ action: 'ipd.discharge-summary.viewed', hospitalId, actorUserId: auth.userId, entityType: 'discharge', entityId: id, meta });
    return document;
  }

  // Completion.

  /**
   * The patient leaves: needs billing clearance that still holds (nothing billed, paid or posted since
   * has changed what is owed beyond what was cleared) and the summary signed. The bed is released to
   * cleaning and the admission closes, in one transaction.
   */
  async complete(auth: AuthContext, id: string, meta: RequestMeta, now: Date = new Date()): Promise<Discharge> {
    const hospitalId = hospitalOf(auth);
    await this.transactions.run(async (tx) => {
      const row = await this.open(hospitalId, id, tx);
      const admission = await this.ipd.lockAdmission(hospitalId, row.admissionId, tx);
      if (admission?.status !== 'admitted') throw Errors.admissionState();
      const clearance = row.clearances[0];
      if (clearance === undefined) throw Errors.dischargeStep('Billing clearance is needed before the patient leaves.');
      if (row.summary === null || row.summary.signedAt === null) throw Errors.dischargeStep('The MD must sign the discharge summary before the patient leaves.');
      const state = await this.stateOf(hospitalId, row, now, tx);
      if (!isSettled(state, clearance.duePaise)) throw Errors.balanceNotZero(toBalance(state));

      const current = admission.assignments.find((assignment) => assignment.endedAt === null);
      if (current !== undefined) {
        await this.ipd.endAssignment(current.id, { endedAt: now, endReason: 'discharge', endedById: auth.userId }, tx);
        await this.ipd.setBedStatus(current.bedId, 'cleaning', tx);
      }
      await this.discharges.dischargeAdmission(admission.id, now, tx);
      await this.discharges.complete(id, { completedAt: now, completedById: auth.userId }, tx);
      await this.audit.record(
        {
          action: 'ipd.patient.discharged',
          hospitalId,
          actorUserId: auth.userId,
          entityType: 'admission',
          entityId: admission.id,
          meta,
          details: { dischargeId: id, bedId: current?.bedId ?? null, duePaise: paise(state.duePaise) },
        },
        tx,
      );
    });
    return this.reload(auth, hospitalId, id, now);
  }
}
