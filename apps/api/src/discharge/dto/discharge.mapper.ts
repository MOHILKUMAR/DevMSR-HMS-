import type {
  BilledPatient,
  Discharge,
  DischargeBalance,
  DischargeRow as DischargeRowDto,
  DischargeSummaryDocument,
  InvoiceSummary,
  Issuer,
  SummaryStatus,
} from '@devmsr/validation';
import { paise } from '../../billing/dto/billing.mapper.js';
import { toDateOnly } from '../../common/dates.js';
import { toAdmissionSummary } from '../../ipd/dto/ipd.mapper.js';
import { isSettled, type AccountState } from '../discharge-balance.js';
import type { DischargeRow, SummaryDocumentRow } from '../discharge.repository.js';

export function toBalance(state: AccountState): DischargeBalance {
  return {
    unbilledCount: state.unbilledCount,
    unbilledPaise: paise(state.unbilledPaise),
    duePaise: paise(state.duePaise),
    depositHeldPaise: paise(state.depositHeldPaise),
    refundablePaise: paise(state.refundablePaise),
    missingRoomCharges: state.missingRoomCharges,
    settled: isSettled(state, 0n),
  };
}

function summaryStatus(row: DischargeRow): SummaryStatus {
  if (row.summary === null) return 'none';
  return row.summary.signedAt === null ? 'draft' : 'signed';
}

export function toDischargeRow(row: DischargeRow, names: Map<string, string>): DischargeRowDto {
  return {
    id: row.id,
    admission: toAdmissionSummary(row.admission),
    fitAt: row.fitAt.toISOString(),
    fitByName: names.get(row.fitById) ?? null,
    clearedAt: row.clearances[0]?.clearedAt.toISOString() ?? null,
    summaryStatus: summaryStatus(row),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

/** User ids a discharge view names. */
export function namedUsers(row: DischargeRow): (string | null)[] {
  return [row.fitById, row.completedById, row.clearances[0]?.clearedById ?? null, row.summary?.draftedById ?? null, row.summary?.signedById ?? null];
}

export function toDischarge(
  row: DischargeRow,
  names: Map<string, string>,
  bills: readonly InvoiceSummary[],
  state: AccountState,
  isTreatingDoctor: boolean,
): Discharge {
  const clearance = row.clearances[0];
  return {
    ...toDischargeRow(row, names),
    fitNote: row.fitNote,
    clearance:
      clearance === undefined
        ? null
        : {
            clearedAt: clearance.clearedAt.toISOString(),
            clearedByName: names.get(clearance.clearedById) ?? null,
            duePaise: paise(clearance.duePaise),
            approvalRequestId: clearance.approvalRequestId,
          },
    pendingDuesRequestId: row.approvalRequests[0]?.id ?? null,
    summary:
      row.summary === null
        ? null
        : {
            draftedByName: names.get(row.summary.draftedById) ?? null,
            draftedAt: row.summary.draftedAt.toISOString(),
            signedByName: row.summary.signedById === null ? null : (names.get(row.summary.signedById) ?? null),
            signedAt: row.summary.signedAt?.toISOString() ?? null,
          },
    bills: [...bills],
    balance: toBalance(state),
    completedByName: row.completedById === null ? null : (names.get(row.completedById) ?? null),
    isTreatingDoctor,
  };
}

export function toSummaryDocument(row: SummaryDocumentRow, issuer: Issuer, patient: BilledPatient, admissionNumber: string, names: Map<string, string>): DischargeSummaryDocument {
  const summary = row.summary;
  return {
    dischargeId: row.id,
    admissionNumber,
    issuer,
    patient,
    doctorName: row.admission.doctor.fullName,
    departmentName: row.admission.doctor.department.name,
    admittedAt: row.admission.admittedAt.toISOString(),
    dischargedAt: row.completedAt?.toISOString() ?? null,
    wardName: row.admission.assignments[0]?.bed.ward.name ?? null,
    content:
      summary === null
        ? null
        : {
            diagnosis: summary.diagnosis,
            courseInHospital: summary.courseInHospital,
            conditionAtDischarge: summary.conditionAtDischarge,
            medications: summary.medications,
            advice: summary.advice,
            followUpDate: summary.followUpDate === null ? null : toDateOnly(summary.followUpDate),
          },
    draftedByName: summary === null ? null : (names.get(summary.draftedById) ?? null),
    draftedAt: summary?.draftedAt.toISOString() ?? null,
    signedByName: summary === null || summary.signedById === null ? null : (names.get(summary.signedById) ?? null),
    signedAt: summary?.signedAt?.toISOString() ?? null,
  };
}
