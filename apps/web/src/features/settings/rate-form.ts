import { isoDateSchema, type CreateTariffRate } from '@devmsr/validation';
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
