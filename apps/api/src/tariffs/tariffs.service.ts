import { Injectable } from '@nestjs/common';
import type { Paginated } from '@devmsr/types';
import type {
  CancelTariffRate,
  CreateServiceItem,
  CreateTariffRate,
  ServiceItem,
  ServiceItemListQuery,
  TariffRate,
  UpdateServiceItem,
} from '@devmsr/validation';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import { addDays, toDateOnly, todayIst } from '../common/dates.js';
import { Errors } from '../common/errors/app-error.js';
import type { RequestMeta } from '../common/http/app-request.js';
import { hospitalOf } from '../common/http/hospital-scope.js';
import { paged } from '../common/http/pagination.js';
import { TransactionRunner } from '../common/prisma/transaction-runner.js';
import { Prisma } from '../generated/prisma/client.js';
import { toServiceItem, toTariffRate } from './dto/tariffs.mapper.js';
import { TariffsRepository } from './tariffs.repository.js';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class TariffsService {
  constructor(
    private readonly tariffs: TariffsRepository,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
  ) {}

  async listServiceItems(auth: AuthContext, query: ServiceItemListQuery, now: Date = new Date()): Promise<Paginated<ServiceItem>> {
    const { rows, total } = await this.tariffs.listServiceItems(hospitalOf(auth), query, query, todayIst(now));
    return paged(rows.map(toServiceItem), total, query);
  }

  async createServiceItem(auth: AuthContext, input: CreateServiceItem, meta: RequestMeta, now: Date = new Date()): Promise<ServiceItem> {
    const hospitalId = hospitalOf(auth);
    if (input.doctorId != null && !(await this.tariffs.activeDoctorExists(hospitalId, input.doctorId))) {
      throw Errors.referenceInvalid('doctor');
    }
    if (input.roomCategoryId != null && !(await this.tariffs.activeRoomCategoryExists(hospitalId, input.roomCategoryId))) {
      throw Errors.referenceInvalid('room category');
    }
    try {
      return await this.transactions.run(async (tx) => {
        const row = await this.tariffs.createServiceItem(
          hospitalId,
          { code: input.code, name: input.name, kind: input.kind, doctorId: input.doctorId ?? null, roomCategoryId: input.roomCategoryId ?? null },
          todayIst(now),
          tx,
        );
        await this.audit.record(
          {
            action: 'tariffs.service-item.created',
            hospitalId,
            actorUserId: auth.userId,
            entityType: 'service_item',
            entityId: row.id,
            meta,
            details: { code: row.code, kind: row.kind },
          },
          tx,
        );
        return toServiceItem(row);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw Errors.conflict('A service item with this code already exists.');
      throw error;
    }
  }

  async updateServiceItem(
    auth: AuthContext,
    id: string,
    input: UpdateServiceItem,
    meta: RequestMeta,
    now: Date = new Date(),
  ): Promise<ServiceItem> {
    const hospitalId = hospitalOf(auth);
    const today = todayIst(now);
    if ((await this.tariffs.findServiceItem(hospitalId, id, today)) === null) throw Errors.notFound('service item');
    return this.transactions.run(async (tx) => {
      const row = await this.tariffs.updateServiceItem(hospitalId, id, input, today, tx);
      await this.audit.record(
        {
          action: 'tariffs.service-item.updated',
          hospitalId,
          actorUserId: auth.userId,
          entityType: 'service_item',
          entityId: id,
          meta,
          details: { fields: Object.keys(input).filter((key) => input[key as keyof UpdateServiceItem] !== undefined).sort().join(',') },
        },
        tx,
      );
      return toServiceItem(row);
    });
  }

  async listRates(auth: AuthContext, serviceItemId: string, now: Date = new Date()): Promise<TariffRate[]> {
    const hospitalId = hospitalOf(auth);
    if ((await this.tariffs.findServiceItem(hospitalId, serviceItemId, todayIst(now))) === null) throw Errors.notFound('service item');
    return (await this.tariffs.listRates(hospitalId, serviceItemId)).map(toTariffRate);
  }

  /**
   * Sets the price of a service item from a date. The current rate is closed the day before, and
   * history is never rewritten: no backdating, and no start on or before the current rate's start.
   */
  async createRate(
    auth: AuthContext,
    serviceItemId: string,
    input: CreateTariffRate,
    meta: RequestMeta,
    now: Date = new Date(),
  ): Promise<TariffRate> {
    const hospitalId = hospitalOf(auth);
    const today = todayIst(now);
    const item = await this.tariffs.findServiceItem(hospitalId, serviceItemId, today);
    if (item === null) throw Errors.notFound('service item');
    if (!item.isActive) throw Errors.referenceInvalid('service item');
    if (input.effectiveFrom < today) {
      throw Errors.rateDateInvalid('A new rate cannot start in the past. Past bills keep the rates they were charged at.');
    }

    try {
      return await this.transactions.run(async (tx) => {
        await this.tariffs.lockServiceItem(hospitalId, serviceItemId, tx);
        const open = await this.tariffs.openRate(hospitalId, serviceItemId, tx);
        if (open !== null) {
          const openFrom = toDateOnly(open.effectiveFrom);
          if (input.effectiveFrom <= openFrom) {
            throw Errors.rateDateInvalid(`The latest rate starts on ${openFrom}. Choose a later date for the new rate.`);
          }
          await this.tariffs.closeRate(open.id, addDays(input.effectiveFrom, -1), tx);
        }
        const rate = await this.tariffs.insertRate(
          {
            hospitalId,
            serviceItemId,
            ratePaise: BigInt(input.ratePaise),
            taxRateBp: input.taxRateBp,
            effectiveFrom: input.effectiveFrom,
            createdById: auth.userId,
          },
          tx,
        );
        await this.audit.record(
          {
            action: 'tariffs.rate.created',
            hospitalId,
            actorUserId: auth.userId,
            entityType: 'service_item',
            entityId: serviceItemId,
            meta,
            details: { ratePaise: input.ratePaise, taxRateBp: input.taxRateBp, effectiveFrom: input.effectiveFrom },
          },
          tx,
        );
        return toTariffRate(rate);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw Errors.conflict('Another rate change for this item was saved at the same moment. Reload and try again.');
      throw error;
    }
  }

  /**
   * Cancels the latest rate before it starts, for a rate entered by mistake. The rate is kept and
   * marked cancelled; the rate it would have replaced is reopened so it carries on. A rate that has
   * started, or one followed by a later rate, cannot be cancelled: cancel the later one first.
   */
  async cancelRate(
    auth: AuthContext,
    serviceItemId: string,
    rateId: string,
    input: CancelTariffRate,
    meta: RequestMeta,
    now: Date = new Date(),
  ): Promise<TariffRate> {
    const hospitalId = hospitalOf(auth);
    const today = todayIst(now);
    if ((await this.tariffs.findServiceItem(hospitalId, serviceItemId, today)) === null) throw Errors.notFound('service item');

    return this.transactions.run(async (tx) => {
      await this.tariffs.lockServiceItem(hospitalId, serviceItemId, tx);
      const rate = await this.tariffs.findRate(hospitalId, serviceItemId, rateId, tx);
      if (rate === null) throw Errors.notFound('rate');
      if (rate.cancelledAt !== null) throw Errors.rateNotCancellable('This rate is already cancelled.');
      const from = toDateOnly(rate.effectiveFrom);
      if (from <= today) {
        throw Errors.rateNotCancellable('This rate has already started. Set a new rate from a later date instead.');
      }
      const open = await this.tariffs.openRate(hospitalId, serviceItemId, tx);
      if (open?.id !== rate.id) throw Errors.rateNotCancellable('A later rate follows this one. Cancel the later rate first.');

      // Cancel first: the rate before it can only be reopened once no open rate follows it.
      const cancelled = await this.tariffs.cancelRate(rate.id, { cancelledAt: now, cancelledById: auth.userId, cancelReason: input.reason }, tx);
      const previous = await this.tariffs.rateEndingOn(hospitalId, serviceItemId, addDays(from, -1), tx);
      if (previous !== null) await this.tariffs.reopenRate(previous.id, tx);
      await this.audit.record(
        {
          action: 'tariffs.rate.cancelled',
          hospitalId,
          actorUserId: auth.userId,
          entityType: 'service_item',
          entityId: serviceItemId,
          meta,
          details: { rateId: rate.id, effectiveFrom: from, reason: input.reason, reopenedRateId: previous?.id ?? null },
        },
        tx,
      );
      return toTariffRate(cancelled);
    });
  }
}
