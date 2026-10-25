import { z, type ZodType } from 'zod';
import { paginationQuerySchema } from './pagination.js';

/** Record IDs in URLs and bodies are always UUIDs, never names or phone numbers. */
export const uuidSchema = z.uuid();

/** Route params for `/:id` routes. */
export const idParamsSchema = z.object({ id: uuidSchema });

/** Short codes for masters (departments, wards, service items): `GEN-M`, `ICU`, `CONS-01`. */
export const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{1,15}$/, 'Use 2 to 16 letters, digits or -');

export const nameSchema = z.string().trim().min(2).max(120);

/** Optional free text: an empty value is stored as null. */
export function optionalTextSchema(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();
}

/** `YYYY-MM-DD`, a calendar date in IST. */
export const isoDateSchema = z.iso.date();

/** Money is integer paise. JSON numbers are exact up to 2^53, far beyond any hospital amount. */
export const paiseSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/** Lists: `?page=1&pageSize=50&q=text&includeInactive=true`. */
export const listQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(60).optional(),
  includeInactive: z.stringbool().optional(),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

/** `{ data, page, pageSize, total }`, the shape of every paginated list (CLAUDE.md section 10). */
export function listResponseSchema<T extends ZodType>(item: T) {
  return z.object({
    data: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  });
}

/** Short lists that are never paginated, such as the beds of one ward. */
export function itemsResponseSchema<T extends ZodType>(item: T) {
  return z.object({ data: z.array(item) });
}

/** Update bodies must change something. */
export function atLeastOneField(value: Record<string, unknown>): boolean {
  return Object.values(value).some((field) => field !== undefined);
}

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** Body of every API error response. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
