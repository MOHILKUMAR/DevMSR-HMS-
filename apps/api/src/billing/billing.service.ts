import { Injectable } from '@nestjs/common';
import type { Paginated } from '@devmsr/types';
import type {
  Charge,
  ChargeListQuery,
  CreateInvoice,
  Invoice,
  InvoiceListQuery,
  InvoiceSummary,
  PatientAccount,
  PostCharge,
} from '@devmsr/validation';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import { fromDateOnly, todayIst } from '../common/dates.js';
import { Errors } from '../common/errors/app-error.js';
import type { RequestMeta } from '../common/http/app-request.js';
import { hospitalOf } from '../common/http/hospital-scope.js';
import { paged } from '../common/http/pagination.js';
import type { Tx } from '../common/prisma/tx.js';
import { TransactionRunner } from '../common/prisma/transaction-runner.js';
import { NumberingService } from '../numbering/numbering.service.js';
import { BillingRepository, type InvoiceRow } from './billing.repository.js';
import { paise, toBilledPatient, toCharge, toInvoice, toInvoiceSummary, toIssuer } from './dto/billing.mapper.js';
import { billAmounts } from './money.js';

@Injectable()
export class BillingService {
  constructor(
    private readonly billing: BillingRepository,
    private readonly numbering: NumberingService,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
  ) {}

  private async requirePatient(hospitalId: string, patientId: string, tx?: Tx) {
    const patient = await this.billing.findPatient(hospitalId, patientId, tx);
    if (patient === null) throw Errors.notFound('patient');
    return patient;
  }

  private async view(hospitalId: string, row: InvoiceRow, tx?: Tx): Promise<Invoice> {
    const [balances, issuer, names] = await Promise.all([
      this.billing.balances([row.id], tx),
      this.billing.issuer(hospitalId, tx),
      this.billing.userNames(hospitalId, [row.createdById, row.issuedById]),
    ]);
    return toInvoice(row, balances.get(row.id), issuer, names);
  }

  /**
   * Posts a charge at the rate in force on the service date. The rate, tax and rate version are
   * copied onto the charge, so a later rate change never alters it.
   */
  async postCharge(auth: AuthContext, patientId: string, input: PostCharge, meta: RequestMeta, now: Date = new Date()): Promise<Charge> {
    const hospitalId = hospitalOf(auth);
    await this.requirePatient(hospitalId, patientId);
    const today = todayIst(now);
    const serviceDate = input.serviceDate ?? today;
    if (serviceDate > today) {
      throw Errors.validation([{ location: 'body', path: 'serviceDate', message: 'The service date cannot be in the future' }]);
    }
    const item = await this.billing.findItemAndRate(hospitalId, input.serviceItemId, serviceDate);
    if (item === null || !item.isActive) throw Errors.referenceInvalid('service item');
    const rate = item.rates[0];
    if (rate === undefined) throw Errors.rateMissing();

    return this.transactions.run(async (tx) => {
      const charge = await this.billing.createCharge(
        {
          hospitalId,
          patientId,
          serviceItemId: item.id,
          tariffRateId: rate.id,
          description: item.name,
          serviceDate: fromDateOnly(serviceDate),
          quantity: input.quantity,
          unitRatePaise: rate.ratePaise,
          taxRateBp: rate.taxRateBp,
          amountPaise: rate.ratePaise * BigInt(input.quantity),
          postedById: auth.userId,
        },
        tx,
      );
      await this.audit.record(
        {
          action: 'billing.charge.posted',
          hospitalId,
          actorUserId: auth.userId,
          entityType: 'charge',
          entityId: charge.id,
          meta,
          details: { patientId, serviceItemId: item.id, quantity: input.quantity, amountPaise: paise(charge.amountPaise) },
        },
        tx,
      );
      return toCharge(charge);
    });
  }

  async listCharges(auth: AuthContext, patientId: string, query: ChargeListQuery): Promise<{ data: Charge[] }> {
    const hospitalId = hospitalOf(auth);
    await this.requirePatient(hospitalId, patientId);
    return { data: (await this.billing.listCharges(hospitalId, patientId, query.status)).map(toCharge) };
  }

  /** A draft bill from chosen unbilled charges of one patient. The charges are locked while it is made. */
  async createDraft(auth: AuthContext, input: CreateInvoice, meta: RequestMeta): Promise<Invoice> {
    const hospitalId = hospitalOf(auth);
    await this.requirePatient(hospitalId, input.patientId);
    const ids = [...new Set(input.chargeIds)];

    return this.transactions.run(async (tx) => {
      const charges = await this.billing.lockCharges(hospitalId, ids, tx);
      const usable = charges.length === ids.length && charges.every((c) => c.patientId === input.patientId && c.status === 'pending' && c.invoiceId === null);
      if (!usable) throw Errors.chargeUnavailable();

      const bill = billAmounts(charges.map((c) => ({ unitRatePaise: c.unitRatePaise, quantity: c.quantity, taxRateBp: c.taxRateBp })));
      const lines = charges.map((charge, index) => {
        const amounts = bill.lines[index];
        if (amounts === undefined) throw new Error('Every charge has a line');
        return {
          chargeId: charge.id,
          lineNo: index + 1,
          description: charge.description,
          serviceDate: charge.serviceDate,
          quantity: charge.quantity,
          unitRatePaise: charge.unitRatePaise,
          taxRateBp: charge.taxRateBp,
          ...amounts,
        };
      });
      const { lines: _lines, ...totals } = bill;
      const draft = await this.billing.createDraft(hospitalId, input.patientId, auth.userId, totals, lines, tx);
      if ((await this.billing.attachCharges(hospitalId, ids, draft.id, tx)) !== ids.length) throw Errors.chargeUnavailable();
      await this.audit.record(
        {
          action: 'billing.invoice.drafted',
          hospitalId,
          actorUserId: auth.userId,
          entityType: 'invoice',
          entityId: draft.id,
          meta,
          details: { patientId: input.patientId, lines: lines.length, totalPaise: paise(draft.totalPaise) },
        },
        tx,
      );
      return this.view(hospitalId, draft, tx);
    });
  }

  /** Opens a bill. Bills carry patient details, so every view is audited like a record view. */
  async getInvoice(auth: AuthContext, id: string, meta: RequestMeta): Promise<Invoice> {
    const hospitalId = hospitalOf(auth);
    const row = await this.billing.findInvoice(hospitalId, id);
    if (row === null) throw Errors.notFound('bill');
    await this.audit.record({ action: 'billing.invoice.viewed', hospitalId, actorUserId: auth.userId, entityType: 'invoice', entityId: id, meta });
    return this.view(hospitalId, row);
  }

  /**
   * Issues a draft: the next bill number of the financial year, the hospital's and patient's details
   * as printed, and the lock. After this the bill never changes (a database trigger enforces it).
   */
  async issue(auth: AuthContext, id: string, meta: RequestMeta, now: Date = new Date()): Promise<Invoice> {
    const hospitalId = hospitalOf(auth);
    return this.transactions.run(async (tx) => {
      const draft = await this.billing.lockInvoice(hospitalId, id, tx);
      if (draft === null) throw Errors.notFound('bill');
      if (draft.status !== 'draft') throw Errors.invoiceLocked();
      if (await this.billing.hasPendingDiscount(id, tx)) throw Errors.requestPending();
      const { number, financialYear } = await this.numbering.nextDocumentNumber(hospitalId, 'invoice', tx, now);
      const issuer = toIssuer(await this.billing.issuer(hospitalId, tx));
      const patient = toBilledPatient(draft.patient);
      const issued = await this.billing.issue(
        id,
        { number, financialYear, issuedById: auth.userId, issuedAt: now, issuerSnapshot: issuer, patientSnapshot: patient },
        tx,
      );
      await this.billing.markChargesBilled(id, tx);
      await this.audit.record(
        {
          action: 'billing.invoice.issued',
          hospitalId,
          actorUserId: auth.userId,
          entityType: 'invoice',
          entityId: id,
          meta,
          details: { number, totalPaise: paise(issued.totalPaise) },
        },
        tx,
      );
      return this.view(hospitalId, issued, tx);
    });
  }

  /** Throws away a draft; its charges become available for another bill. Issued bills cannot be discarded. */
  async discard(auth: AuthContext, id: string, meta: RequestMeta, now: Date = new Date()): Promise<Invoice> {
    const hospitalId = hospitalOf(auth);
    return this.transactions.run(async (tx) => {
      const draft = await this.billing.lockInvoice(hospitalId, id, tx);
      if (draft === null) throw Errors.notFound('bill');
      if (draft.status !== 'draft') throw Errors.invoiceLocked();
      if (await this.billing.hasPendingDiscount(id, tx)) throw Errors.requestPending();
      const discarded = await this.billing.discard(id, auth.userId, now, tx);
      await this.billing.releaseCharges(id, tx);
      await this.audit.record(
        { action: 'billing.invoice.discarded', hospitalId, actorUserId: auth.userId, entityType: 'invoice', entityId: id, meta },
        tx,
      );
      return this.view(hospitalId, discarded, tx);
    });
  }

  async listInvoices(auth: AuthContext, query: InvoiceListQuery): Promise<Paginated<InvoiceSummary>> {
    const hospitalId = hospitalOf(auth);
    const { rows, total } = await this.billing.listInvoices(hospitalId, query, query);
    const balances = await this.billing.balances(rows.map((row) => row.id));
    return paged(
      rows.map((row) => toInvoiceSummary(row, balances.get(row.id))),
      total,
      query,
    );
  }

  /** A patient's money at a glance: unbilled charges, bills and what is due, receipts and deposit held. */
  async account(auth: AuthContext, patientId: string, meta: RequestMeta): Promise<PatientAccount> {
    const hospitalId = hospitalOf(auth);
    const patient = await this.requirePatient(hospitalId, patientId);
    const [pending, invoices, receipts, creditNotes, refunds] = await Promise.all([
      this.billing.pendingCharges(hospitalId, patientId),
      this.billing.patientInvoices(hospitalId, patientId),
      this.billing.patientReceipts(hospitalId, patientId),
      this.billing.patientCreditNotes(hospitalId, patientId),
      this.billing.patientRefunds(hospitalId, patientId),
    ]);
    const balances = await this.billing.balances(invoices.map((row) => row.id));
    const summaries = invoices.map((row) => toInvoiceSummary(row, balances.get(row.id)));
    const receiptRows = receipts.map((receipt) => {
      const used = [...receipt.allocations, ...receipt.refunds].reduce((sum, part) => sum + part.amountPaise, 0n);
      const voided = receipt.voidRecord !== null;
      return {
        id: receipt.id,
        number: receipt.number,
        purpose: receipt.purpose,
        mode: receipt.mode,
        amountPaise: paise(receipt.amountPaise),
        // A void deposit holds nothing.
        heldPaise: receipt.purpose === 'deposit' && !voided ? paise(receipt.amountPaise - used) : 0,
        voided,
        shiftOpen: receipt.shift.closedAt === null,
        createdAt: receipt.createdAt.toISOString(),
      };
    });
    await this.audit.record({ action: 'billing.account.viewed', hospitalId, actorUserId: auth.userId, entityType: 'patient', entityId: patientId, meta });
    return {
      patientId,
      patient: toBilledPatient(patient),
      pendingCharges: { count: pending._count._all, amountPaise: paise(pending._sum.amountPaise ?? 0n) },
      invoices: summaries,
      receipts: receiptRows,
      creditNotes: creditNotes.map((note) => ({
        id: note.id,
        requestId: note.approvalRequestId,
        number: note.number,
        invoiceId: note.invoiceId,
        invoiceNumber: note.invoice.number ?? '',
        totalPaise: paise(note.totalPaise),
        createdAt: note.createdAt.toISOString(),
      })),
      refunds: refunds.map((refund) => ({
        id: refund.id,
        requestId: refund.approvalRequestId,
        number: refund.number,
        mode: refund.mode,
        amountPaise: paise(refund.amountPaise),
        createdAt: refund.createdAt.toISOString(),
      })),
      depositHeldPaise: receiptRows.reduce((sum, receipt) => sum + receipt.heldPaise, 0),
      totalDuePaise: summaries.reduce((sum, invoice) => sum + invoice.duePaise, 0),
      refundablePaise: summaries.reduce((sum, invoice) => sum + invoice.refundablePaise, 0),
    };
  }
}
