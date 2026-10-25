import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { BillingRepository } from '../billing/billing.repository.js';
import { addDays, fromDateOnly, istMidnight } from '../common/dates.js';
import { TransactionRunner } from '../common/prisma/transaction-runner.js';
import type { DailyChargeKind } from '../generated/prisma/client.js';
import { Prisma } from '../generated/prisma/client.js';
import { IpdRepository } from './ipd.repository.js';
import { heldAt, nightsToCharge } from './nights.js';

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

/**
 * Posts room and nursing charges for every midnight an admitted patient was in a bed
 * (docs/billing-rules.md): one room and one nursing charge per night, at the rate of the room category
 * of the bed held at that midnight. Runs at 00:05 IST and at API start, and catches up any nights
 * missed while it was down. Each night is posted once: the daily_charges unique key refuses a second.
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

  private async postForHospital(hospitalId: string, now: Date): Promise<PostingResult> {
    const result: PostingResult = { posted: 0, missingRates: 0 };
    const dischargedSince = new Date(now.getTime() - DISCHARGED_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    for (const admission of await this.ipd.admissionsToCharge(hospitalId, dischargedSince)) {
      const done = new Set(admission.dailyCharges.map((day) => `${day.chargeDate.toISOString().slice(0, 10)}:${day.kind}`));
      let postedHere = 0;
      for (const night of nightsToCharge(admission.admittedAt, admission.dischargedAt, now)) {
        const bed = heldAt(admission.assignments, istMidnight(addDays(night, 1)));
        const roomCategoryId = bed?.bed.ward.roomCategoryId ?? null;
        if (bed === undefined || roomCategoryId === null) continue;
        for (const kind of KINDS) {
          if (done.has(`${night}:${kind}`)) continue;
          const item = await this.ipd.dailyItem(hospitalId, kind, roomCategoryId, night);
          const rate = item?.rates[0];
          if (item === null || rate === undefined) {
            result.missingRates += 1;
            continue;
          }
          try {
            await this.transactions.run(async (tx) => {
              const charge = await this.billing.createCharge(
                {
                  hospitalId,
                  patientId: admission.patientId,
                  serviceItemId: item.id,
                  tariffRateId: rate.id,
                  description: item.name,
                  serviceDate: fromDateOnly(night),
                  quantity: 1,
                  unitRatePaise: rate.ratePaise,
                  taxRateBp: rate.taxRateBp,
                  amountPaise: rate.ratePaise,
                  postedById: null,
                },
                tx,
              );
              await this.ipd.recordDaily(hospitalId, { admissionId: admission.id, chargeDate: night, kind, chargeId: charge.id, bedId: bed.bedId, roomCategoryId }, tx);
            });
            result.posted += 1;
            postedHere += 1;
          } catch (error) {
            // Another run posted this night first.
            if (!isUniqueViolation(error)) throw error;
          }
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
}
