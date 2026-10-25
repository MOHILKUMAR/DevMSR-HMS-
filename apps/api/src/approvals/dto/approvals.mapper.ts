import {
  approvalDetailsSchema,
  billedPatientSchema,
  issuerSchema,
  type ApprovalRequest,
  type BilledPatient,
  type CreditNote,
  type Issuer,
  type Refund,
} from '@devmsr/validation';
import { paise } from '../../billing/dto/billing.mapper.js';
import type { CreditNoteRow, RefundRow, RequestRow } from '../approvals.repository.js';

/** A request as the API returns it. `limit` is the hospital's finance limit for discounts. */
export function toApprovalRequest(row: RequestRow, names: Map<string, string>, limit: bigint): ApprovalRequest {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    patient: row.patient,
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoice?.number ?? null,
    receiptId: row.receiptId,
    receiptNumber: row.receipt?.number ?? null,
    amountPaise: paise(row.amountPaise),
    reason: row.reason,
    details: approvalDetailsSchema.parse(row.details),
    requestedById: row.requestedById,
    requestedByName: names.get(row.requestedById) ?? null,
    requestedAt: row.requestedAt.toISOString(),
    decidedByName: row.decidedById === null ? null : (names.get(row.decidedById) ?? null),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decisionNote: row.decisionNote,
    resultInvoiceId: row.resultInvoiceId,
    creditNote: row.creditNote === null ? null : { id: row.creditNote.id, number: row.creditNote.number, totalPaise: paise(row.creditNote.totalPaise) },
    refund: row.refund === null ? null : { id: row.refund.id, number: row.refund.number, createdAt: row.refund.createdAt.toISOString() },
    aboveLimit: row.kind === 'discount' && row.amountPaise > limit,
  };
}

/** A credit note, with the hospital and patient as printed on the bill it corrects. */
export function toCreditNote(row: CreditNoteRow, names: Map<string, string>): CreditNote {
  return {
    id: row.id,
    requestId: row.approvalRequestId,
    number: row.number,
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoice.number ?? '',
    wholeBill: row.wholeBill,
    issuer: issuerSchema.parse(row.invoice.issuerSnapshot),
    patient: billedPatientSchema.parse(row.invoice.patientSnapshot),
    lines: row.lines.map((line) => ({
      lineNo: line.lineNo,
      description: line.description,
      quantity: line.quantity,
      taxablePaise: paise(line.taxablePaise),
      cgstPaise: paise(line.cgstPaise),
      sgstPaise: paise(line.sgstPaise),
      totalPaise: paise(line.totalPaise),
    })),
    taxablePaise: paise(row.taxablePaise),
    cgstPaise: paise(row.cgstPaise),
    sgstPaise: paise(row.sgstPaise),
    roundOffPaise: paise(row.roundOffPaise),
    totalPaise: paise(row.totalPaise),
    reason: row.approvalRequest.reason,
    requestedByName: names.get(row.approvalRequest.requestedById) ?? null,
    approvedByName: names.get(row.approvedById) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toRefund(row: RefundRow, issuer: Issuer, patient: BilledPatient, names: Map<string, string>): Refund {
  const decidedById = row.approvalRequest.decidedById;
  return {
    id: row.id,
    requestId: row.approvalRequestId,
    number: row.number,
    mode: row.mode,
    amountPaise: paise(row.amountPaise),
    reference: row.reference,
    bankName: row.bankName,
    source: row.receipt === null ? 'bill' : 'deposit',
    sourceNumber: row.receipt?.number ?? row.invoice?.number ?? '',
    issuer,
    patient,
    reason: row.approvalRequest.reason,
    paidByName: names.get(row.paidById) ?? null,
    approvedByName: decidedById === null ? null : (names.get(decidedById) ?? null),
    createdAt: row.createdAt.toISOString(),
  };
}
