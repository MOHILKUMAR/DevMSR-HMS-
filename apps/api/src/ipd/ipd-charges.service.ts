import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { BillingRepository } from '../billing/billing.repository.js';
import { addDays, fromDateOnly, istMidnight, toDateOnly } from '../common/dates.js';
import type { Tx } from '../common/prisma/tx.js';
import { TransactionRunner } from '../common/prisma/transaction-runner.js';
import type { DailyChargeKind } from '../generated/prisma/client.js';
import { Prisma } from '../generated/prisma/client.js';
import { IpdRepository, type ChargingRow } from './ipd.repository.js';
import { bedForDay, chargeableDays, daysMissingCharges, heldAt, nightsToCharge } from './nights.js';

const KINDS: DailyChargeKind[] = ['room', 'nursing'];
/** Discharged admissions are looked at for a week, in case the job was down over their last nights. */
const DISCHARGED_LOOKBACK_DAYS = 7;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export interface PostingResult {
  posted: number;
  /** Nights left uncharged because the room category has no room or nursing item with a rate. */
  missingRates: number;
}

function postedDays(admission: ChargingRow): { chargeDate: string; kind: string }[] {
  return admission.dailyCharges.map((day) => ({ chargeDate: toDateOnly(day.chargeDate), kind: day.kind }));
}

/**
 * Posts room and nursing charges for every midnight an admitted patient was in a bed
 * (docs/billing-rules.md): one room and one nursing charge per night, at the rate of the room category
 * of the bed held at that midnight. Runs at 00:05 IST and at API start, and catches up any nights
 * missed while it was down. Each night is posted once: the daily_charges unique key refuses a second.
 * The final bill of a discharge also posts what is due through `postForAdmission`.
 */
@Injectable()
export class IpdChargesService {
  private readonly logger = new Logger(IpdChargesService.name);

  constructor(
    private readonly ipd: IpdRepository,
    private readonly billing: BillingRepository,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
  ) {}

  async postDue(now: Date = new Date()): Promise<PostingResult> {
    const result: PostingResult = { posted: 0, missingRates: 0 };
    for (const hospital of await this.ipd.hospitalIds()) {
      const part = await this.postForHospital(hospital.id, now);
      result.posted += part.posted;
      result.missingRates += part.missingRates;
    }
    if (result.missingRates > 0) {
      this.logger.warn(`Room or nursing rates are missing for ${String(result.missingRates)} night(s); those nights are not charged yet`);
    }
    return result;
  }

  /** One hospital's nights, as the midnight job posts them for every hospital. */
  async postForHospital(hospitalId: string, now: Date): Promise<PostingResult> {
    const result: PostingResult = { posted: 0, missingRates: 0 };
    const dischargedSince = new Date(now.getTime() - DISCHARGED_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    for (const admission of await this.ipd.admissionsToCharge(hospitalId, dischargedSince)) {
      const done = new Set(postedDays(admission).map((day) => `${day.chargeDate}:${day.kind}`));
      let postedHere = 0;
      for (const night of nightsToCharge(admission.admittedAt, admission.dischargedAt, now)) {
        if (KINDS.every((kind) => done.has(`${night}:${kind}`))) continue;
        const bed = heldAt(admission.assignments, istMidnight(addDays(night, 1)));
        if (bed === undefined) continue;
        try {
          const part = await this.transactions.run((tx) => this.postDay(hospitalId, admission, night, bed, done, null, tx));
          result.posted += part.posted;
          result.missingRates += part.missingRates;
          postedHere += part.posted;
        } catch (error) {
          // Another run, or a final bill, posted this night first.
          if (!isUniqueViolation(error)) throw error;
        }
      }
      if (postedHere > 0) {
        await this.audit.record({
          action: 'ipd.daily-charges.posted',
          hospitalId,
          actorUserId: null,
          entityType: 'admission',
          entityId: admission.id,
          details: { charges: postedHere },
        });
      }
    }
    return result;
  }

  /**
   * Posts what an open admission is due up to `now`, inside the caller's transaction: every night not
   * yet charged, or the admission day for a stay that has crossed no midnight. Returns the days still
   * missing a charge because their room category has no rate.
   */
  async postForAdmission(hospitalId: string, admissionId: string, now: Date, postedById: string, tx: Tx): Promise<{ posted: number; missing: string[] }> {
    const admission = await this.ipd.admissionToCharge(hospitalId, admissionId, tx);
    if (admission === null) return { posted: 0, missing: [] };
    const done = new Set(postedDays(admission).map((day) => `${day.chargeDate}:${day.kind}`));
    const days = chargeableDays(admission.admittedAt, now);
    let posted = 0;
    for (const day of daysMissingCharges(days, postedDays(admission))) {
      const bed = bedForDay(admission.assignments, day, now);
      if (bed === undefined) continue;
      posted += (await this.postDay(hospitalId, admission, day, bed, done, postedById, tx)).posted;
    }
    if (posted > 0) {
      await this.audit.record(
        { action: 'ipd.daily-charges.posted', hospitalId, actorUserId: postedById, entityType: 'admission', entityId: admissionId, details: { charges: posted } },
        tx,
      );
    }
    const after = await this.ipd.admissionToCharge(hospitalId, admissionId, tx);
    return { posted, missing: after === null ? [] : daysMissingCharges(days, postedDays(after)) };
  }

  /** Posts the room and nursing charges of one day not posted yet, at the rates of the bed's room category that day. */
  private async postDay(
    hospitalId: string,
    admission: { id: string; patientId: string },
    day: string,
    bed: ChargingRow['assignments'][number],
    done: Set<string>,
    postedById: string | null,
    tx: Tx,
  ): Promise<PostingResult> {
    const result: PostingResult = { posted: 0, missingRates: 0 };
    const roomCategoryId = bed.bed.ward.roomCategoryId;
    if (roomCategoryId === null) return result;
    for (const kind of KINDS) {
      if (done.has(`${day}:${kind}`)) continue;
      const item = await this.ipd.dailyItem(hospitalId, kind, roomCategoryId, day);
      const rate = item?.rates[0];
      if (item === null || rate === undefined) {
        result.missingRates += 1;
        continue;
      }
      const charge = await this.billing.createCharge(
        {
          hospitalId,
          patientId: admission.patientId,
          serviceItemId: item.id,
          tariffRateId: rate.id,
          description: item.name,
          serviceDate: fromDateOnly(day),
          quantity: 1,
          unitRatePaise: rate.ratePaise,
          taxRateBp: rate.taxRateBp,
          amountPaise: rate.ratePaise,
          postedById,
        },
        tx,
      );
      await this.ipd.recordDaily(hospitalId, { admissionId: admission.id, chargeDate: day, kind, chargeId: charge.id, bedId: bed.bedId, roomCategoryId }, tx);
      done.add(`${day}:${kind}`);
      result.posted += 1;
    }
    return result;
  }
}
