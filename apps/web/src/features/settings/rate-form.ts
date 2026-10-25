import { isoDateSchema, type CreateTariffRate, type TariffRate } from '@devmsr/validation';
import { z } from 'zod';
import { parsePercentToBp, parseRupeesToPaise } from '@/lib/money';

/** What staff type in the change rate form: rupees and a percentage as text, and a start date. */
export const rateFormSchema = z.object({
  rupees: z.string().refine((value) => parseRupeesToPaise(value) !== null),
  taxPercent: z.string().refine((value) => parsePercentToBp(value) !== null),
  effectiveFrom: isoDateSchema,
});

export type RateFormValues = z.infer<typeof rateFormSchema>;

/** The API body in paise and basis points, or null if the text is not a valid amount or rate. */
export function toRateBody(values: RateFormValues): CreateTariffRate | null {
  const ratePaise = parseRupeesToPaise(values.rupees);
  const taxRateBp = parsePercentToBp(values.taxPercent);
  return ratePaise === null || taxRateBp === null ? null : { ratePaise, taxRateBp, effectiveFrom: values.effectiveFrom };
}

export type RateStatus = 'inForce' | 'scheduled' | 'ended' | 'cancelled';

/** Where a rate stands on `today` (an IST date). */
export function rateStatus(rate: Pick<TariffRate, 'effectiveFrom' | 'effectiveTo' | 'cancelledAt'>, today: string): RateStatus {
  if (rate.cancelledAt !== null) return 'cancelled';
  if (rate.effectiveFrom > today) return 'scheduled';
  if (rate.effectiveTo !== null && rate.effectiveTo < today) return 'ended';
  return 'inForce';
}

/** The one rate that may be cancelled: the latest one, if it has not started. Mirrors the API rule. */
export function cancellableRateId(rates: readonly TariffRate[], today: string): string | null {
  const latest = rates.find((rate) => rate.cancelledAt === null && rate.effectiveTo === null);
  return latest !== undefined && latest.effectiveFrom > today ? latest.id : null;
}
