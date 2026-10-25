import {
  billedPatientSchema,
  issuerSchema,
  type BilledPatient,
  type Charge,
  type Invoice,
  type InvoiceSummary,
  type Issuer,
} from '@devmsr/validation';
import { toDateOnly } from '../../common/dates.js';
import { NO_MONEY, type BillBalance, type BillPatientRow, type ChargeRow, type InvoiceRow, type InvoiceSummaryRow, type IssuerRow } from '../billing.repository.js';

/** Paise leave the database as BigInt; every amount here is far below 2^53, so it fits a JSON number. */
export function paise(value: bigint): number {
  return Number(value);
}

export function toCharge(row: ChargeRow): Charge {
  return {
    id: row.id,
    serviceItemId: row.serviceItemId,
    description: row.description,
    serviceDate: toDateOnly(row.serviceDate),
    quantity: row.quantity,
    unitRatePaise: paise(row.unitRatePaise),
    taxRateBp: row.taxRateBp,
    amountPaise: paise(row.amountPaise),
    status: row.status,
    invoiceId: row.invoiceId,
    postedAt: row.createdAt.toISOString(),
  };
}

export function toIssuer(row: IssuerRow): Issuer {
  return { ...row };
}

/** The patient as a bill prints them: the address on one line. */
export function toBilledPatient(row: BillPatientRow): BilledPatient {
  const address = [row.addressLine, row.city, row.state, row.pincode].filter((part) => part !== null).join(', ');
  return {
    id: row.id,
    uhid: row.uhid,
    fullName: row.fullName,
    sex: row.sex,
    dateOfBirth: row.dateOfBirth === null ? null : toDateOnly(row.dateOfBirth),
    phone: row.phone,
    address: address === '' ? null : address,
  };
}

/** What a bill still owes, or has been overpaid by: total - credited - paid + refunded. */
export function owedOn(total: bigint, balance: BillBalance): bigint {
  return total - balance.credited - balance.paid + balance.refunded;
}

/** Paid, credited, refunded, due and refundable: only an issued bill carries money. */
function money(status: InvoiceRow['status'], total: bigint, balance: BillBalance = NO_MONEY) {
  const owed = status === 'issued' ? owedOn(total, balance) : 0n;
  return {
    paidPaise: paise(balance.paid),
    creditedPaise: paise(balance.credited),
    refundedPaise: paise(balance.refunded),
    duePaise: owed > 0n ? paise(owed) : 0,
    refundablePaise: owed < 0n ? paise(-owed) : 0,
  };
}

/**
 * A bill as the API returns it. An issued bill shows the hospital and patient as they were when it
 * was issued; a draft shows them as they are now.
 */
export function toInvoice(row: InvoiceRow, balance: BillBalance | undefined, currentIssuer: IssuerRow, names: Map<string, string>): Invoice {
  const issued = row.status === 'issued';
  return {
    id: row.id,
    status: row.status,
    number: row.number,
    financialYear: row.financialYear,
    subtotalPaise: paise(row.subtotalPaise),
    discountPaise: paise(row.discountPaise),
    taxablePaise: paise(row.taxablePaise),
    cgstPaise: paise(row.cgstPaise),
    sgstPaise: paise(row.sgstPaise),
    roundOffPaise: paise(row.roundOffPaise),
    totalPaise: paise(row.totalPaise),
    ...money(row.status, row.totalPaise, balance),
    issuer: issued ? issuerSchema.parse(row.issuerSnapshot) : toIssuer(currentIssuer),
    patient: issued ? billedPatientSchema.parse(row.patientSnapshot) : toBilledPatient(row.patient),
    lines: row.lines.map((line) => ({
      lineNo: line.lineNo,
      description: line.description,
      serviceDate: toDateOnly(line.serviceDate),
      quantity: line.quantity,
      unitRatePaise: paise(line.unitRatePaise),
      amountPaise: paise(line.amountPaise),
      discountPaise: paise(line.discountPaise),
      taxablePaise: paise(line.taxablePaise),
      taxRateBp: line.taxRateBp,
      cgstPaise: paise(line.cgstPaise),
      sgstPaise: paise(line.sgstPaise),
      totalPaise: paise(line.totalPaise),
    })),
    createdAt: row.createdAt.toISOString(),
    createdByName: names.get(row.createdById) ?? null,
    issuedAt: row.issuedAt?.toISOString() ?? null,
    issuedByName: row.issuedById === null ? null : (names.get(row.issuedById) ?? null),
  };
}

export function toInvoiceSummary(row: InvoiceSummaryRow, balance: BillBalance | undefined): InvoiceSummary {
  return {
    id: row.id,
    status: row.status,
    number: row.number,
    patientId: row.patientId,
    patientUhid: row.patient.uhid,
    patientName: row.patient.fullName,
    totalPaise: paise(row.totalPaise),
    ...money(row.status, row.totalPaise, balance),
    issuedAt: row.issuedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
