import type { Consultation, OpdVisit } from '@devmsr/validation';
import { paise } from '../../billing/dto/billing.mapper.js';
import { toDateOnly } from '../../common/dates.js';
import type { ConsultationRow, VisitRow } from '../opd.repository.js';

export function toOpdVisit(row: VisitRow, names: Map<string, string>): OpdVisit {
  return {
    id: row.id,
    visitDate: toDateOnly(row.visitDate),
    tokenNumber: row.tokenNumber,
    status: row.status,
    patient: {
      id: row.patient.id,
      uhid: row.patient.uhid,
      fullName: row.patient.fullName,
      sex: row.patient.sex,
      dateOfBirth: row.patient.dateOfBirth === null ? null : toDateOnly(row.patient.dateOfBirth),
    },
    doctor: { id: row.doctor.id, fullName: row.doctor.fullName, departmentName: row.doctor.department.name },
    quotedFeePaise: paise(row.quotedFeePaise),
    feeInvoiceId: row.feeInvoiceId,
    feeInvoiceNumber: row.feeInvoice?.number ?? null,
    createdByName: names.get(row.createdById) ?? null,
    createdAt: row.createdAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    calledAt: row.calledAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelReason: row.cancelReason,
  };
}

export function toConsultation(row: ConsultationRow, names: Map<string, string>): Consultation {
  return {
    visit: toOpdVisit(row, names),
    notes: {
      complaints: row.complaints,
      findings: row.findings,
      diagnosis: row.diagnosis,
      advice: row.advice,
      followUpDate: row.followUpDate === null ? null : toDateOnly(row.followUpDate),
      admissionAdvised: row.admissionAdvised,
    },
    notesUpdatedAt: row.notesUpdatedAt?.toISOString() ?? null,
    orders: row.orders.map((order) => ({
      chargeId: order.charge.id,
      description: order.charge.description,
      quantity: order.charge.quantity,
      amountPaise: paise(order.charge.amountPaise),
      orderedAt: order.createdAt.toISOString(),
    })),
  };
}
