import type { ServiceItem, TariffRate } from '@devmsr/validation';
import { toDateOnly } from '../../common/dates.js';
import type { ServiceItemRow, TariffRateRow } from '../tariffs.repository.js';

/** Paise leave the database as BigInt; they are validated to fit exactly in a JSON number. */
function paiseToNumber(value: bigint): number {
  return Number(value);
}

export function toTariffRate(row: TariffRateRow): TariffRate {
  return {
    id: row.id,
    ratePaise: paiseToNumber(row.ratePaise),
    taxRateBp: row.taxRateBp,
    effectiveFrom: toDateOnly(row.effectiveFrom),
    effectiveTo: row.effectiveTo === null ? null : toDateOnly(row.effectiveTo),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toServiceItem(row: ServiceItemRow): ServiceItem {
  const current = row.rates[0];
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    kind: row.kind,
    doctorId: row.doctorId,
    doctorName: row.doctor?.fullName ?? null,
    roomCategoryId: row.roomCategoryId,
    roomCategoryName: row.roomCategory?.name ?? null,
    isActive: row.isActive,
    currentRate:
      current === undefined
        ? null
        : { ratePaise: paiseToNumber(current.ratePaise), taxRateBp: current.taxRateBp, effectiveFrom: toDateOnly(current.effectiveFrom) },
  };
}
