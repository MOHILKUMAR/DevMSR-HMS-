import { Injectable } from '@nestjs/common';
import type { CollectionReport, OperationsReport, ReportDateQuery } from '@devmsr/validation';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import { BillingRepository } from '../billing/billing.repository.js';
import { paise } from '../billing/dto/billing.mapper.js';
import { addDays, istMidnight, todayIst } from '../common/dates.js';
import type { RequestMeta } from '../common/http/app-request.js';
import { hospitalOf } from '../common/http/hospital-scope.js';
import { collectionTotals, type MoneyCounts } from './collection.js';
import { dayBookCsv, type DayBookEntry } from './day-book.js';
import { ReportsRepository } from './reports.repository.js';

function counts(value: MoneyCounts) {
  return {
    paymentsPaise: paise(value.paymentsPaise),
    depositsPaise: paise(value.depositsPaise),
    refundsPaise: paise(value.refundsPaise),
    netPaise: paise(value.netPaise),
    receipts: value.receipts,
    refunds: value.refunds,
  };
}

/** A report day: midnight to midnight IST (docs/billing-rules.md). */
function dayRange(query: ReportDateQuery, now: Date): { date: string; from: Date; to: Date } {
  const date = query.date ?? todayIst(now);
  return { date, from: istMidnight(date), to: istMidnight(addDays(date, 1)) };
}

/** Day-end collection, the Tally day book and basic counts. Every report read is audited. */
@Injectable()
export class ReportsService {
  constructor(
    private readonly reports: ReportsRepository,
    private readonly billing: BillingRepository,
    private readonly audit: AuditService,
  ) {}

  async collection(auth: AuthContext, query: ReportDateQuery, meta: RequestMeta, now: Date = new Date()): Promise<CollectionReport> {
    const hospitalId = hospitalOf(auth);
    const { date, from, to } = dayRange(query, now);
    const [receipts, refunds] = await Promise.all([this.reports.receipts(hospitalId, from, to), this.reports.refunds(hospitalId, from, to)]);
    const totals = collectionTotals(
      receipts.map((receipt) => ({
        cashierId: receipt.shift.cashierId,
        mode: receipt.mode,
        purpose: receipt.purpose,
        amountPaise: receipt.amountPaise,
        voided: receipt.voidRecord !== null,
      })),
      refunds.map((refund) => ({ cashierId: refund.shift.cashierId, mode: refund.mode, amountPaise: refund.amountPaise })),
    );
    const names = await this.billing.userNames(
      hospitalId,
      totals.rows.map((row) => row.cashierId),
    );
    await this.audit.record({ action: 'reports.collection.viewed', hospitalId, actorUserId: auth.userId, meta, details: { date } });
    const rows = totals.rows.map((row) => ({ cashierId: row.cashierId, cashierName: names.get(row.cashierId) ?? null, mode: row.mode, ...counts(row.counts) }));
    return {
      date,
      generatedAt: now.toISOString(),
      // Grouped by cashier name, then in payment mode order.
      rows: rows.sort((a, b) => (a.cashierName ?? '').localeCompare(b.cashierName ?? '')),
      byMode: totals.byMode.map((row) => ({ mode: row.mode, ...counts(row.counts) })),
      totals: counts(totals.totals),
      voided: { count: totals.voided.count, amountPaise: paise(totals.voided.amountPaise) },
    };
  }

  /** The day book as CSV. Limited to 10 an hour per user like every export (CLAUDE.md section 9). */
  async dayBook(auth: AuthContext, query: ReportDateQuery, meta: RequestMeta, now: Date = new Date()): Promise<{ date: string; csv: string }> {
    const hospitalId = hospitalOf(auth);
    const { date, from, to } = dayRange(query, now);
    const [bills, receipts, creditNotes, refunds] = await Promise.all([
      this.reports.billsIssued(hospitalId, from, to),
      this.reports.receipts(hospitalId, from, to),
      this.reports.creditNotes(hospitalId, from, to),
      this.reports.refunds(hospitalId, from, to),
    ]);
    const money = { taxablePaise: null, cgstPaise: null, sgstPaise: null, roundOffPaise: null };
    const entries: DayBookEntry[] = [
      ...bills.map((bill) => ({
        at: bill.issuedAt ?? from,
        type: 'Sales' as const,
        number: bill.number ?? '',
        uhid: bill.patient.uhid,
        mode: '',
        against: '',
        taxablePaise: bill.taxablePaise,
        cgstPaise: bill.cgstPaise,
        sgstPaise: bill.sgstPaise,
        roundOffPaise: bill.roundOffPaise,
        amountPaise: bill.totalPaise,
      })),
      ...receipts.map((receipt) => {
        const voided = receipt.voidRecord !== null;
        return {
          at: receipt.createdAt,
          type: voided ? ('Receipt, void' as const) : receipt.purpose === 'deposit' ? ('Deposit' as const) : ('Receipt' as const),
          number: receipt.number,
          uhid: receipt.patient.uhid,
          mode: receipt.mode,
          against: receipt.allocations.map((allocation) => allocation.invoice.number ?? '').join(' '),
          ...money,
          amountPaise: voided ? 0n : receipt.amountPaise,
        };
      }),
      ...creditNotes.map((note) => ({
        at: note.createdAt,
        type: 'Credit note' as const,
        number: note.number,
        uhid: note.patient.uhid,
        mode: '',
        against: note.invoice.number ?? '',
        taxablePaise: note.taxablePaise,
        cgstPaise: note.cgstPaise,
        sgstPaise: note.sgstPaise,
        roundOffPaise: note.roundOffPaise,
        amountPaise: note.totalPaise,
      })),
      ...refunds.map((refund) => ({
        at: refund.createdAt,
        type: 'Refund' as const,
        number: refund.number,
        uhid: refund.patient.uhid,
        mode: refund.mode,
        against: refund.invoice?.number ?? refund.receipt?.number ?? '',
        ...money,
        amountPaise: refund.amountPaise,
      })),
    ];
    await this.audit.record({ action: 'reports.day-book.exported', hospitalId, actorUserId: auth.userId, meta, details: { date, rows: entries.length } });
    return { date, csv: dayBookCsv(entries) };
  }

  async operations(auth: AuthContext, query: ReportDateQuery, meta: RequestMeta, now: Date = new Date()): Promise<OperationsReport> {
    const hospitalId = hospitalOf(auth);
    const { date, from, to } = dayRange(query, now);
    const [opd, admissions, discharges, beds] = await Promise.all([
      this.reports.opdByStatus(hospitalId, date),
      this.reports.admissionsBetween(hospitalId, from, to),
      this.reports.dischargesBetween(hospitalId, from, to),
      this.reports.beds(hospitalId),
    ]);
    const visits = (status: string) => opd.find((row) => row.status === status)?._count._all ?? 0;
    const bedCount = (status: string) => beds.filter((bed) => bed.status === status).length;
    const wards = new Map<string, { name: string; total: number; occupied: number }>();
    for (const bed of beds) {
      const ward = wards.get(bed.ward.name) ?? { name: bed.ward.name, total: 0, occupied: 0 };
      ward.total += 1;
      if (bed.status === 'occupied') ward.occupied += 1;
      wards.set(bed.ward.name, ward);
    }
    await this.audit.record({ action: 'reports.operations.viewed', hospitalId, actorUserId: auth.userId, meta, details: { date } });
    return {
      date,
      generatedAt: now.toISOString(),
      opd: { tokens: opd.reduce((sum, row) => sum + row._count._all, 0), seen: visits('completed'), cancelled: visits('cancelled') },
      admissions,
      discharges,
      beds: {
        total: beds.length,
        occupied: bedCount('occupied'),
        free: bedCount('free'),
        cleaning: bedCount('cleaning'),
        reserved: bedCount('reserved'),
        blocked: bedCount('blocked'),
      },
      wards: [...wards.values()].sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
}
