import { z } from 'zod';
import { itemsResponseSchema, listResponseSchema } from './common.js';

/** A written reason of 20 to 500 characters. It is shown to the hospital admin, so no patient details. */
export const startBreakGlassSchema = z.object({
  hospitalId: z.uuid(),
  reason: z.string().trim().min(20).max(500),
});

export type StartBreakGlass = z.infer<typeof startBreakGlassSchema>;

export const breakGlassHospitalSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
});

export const breakGlassHospitalListSchema = itemsResponseSchema(breakGlassHospitalSchema);

export const breakGlassGrantSchema = z.object({
  id: z.uuid(),
  hospital: breakGlassHospitalSchema,
  user: z.object({ id: z.uuid(), username: z.string(), displayName: z.string() }),
  reason: z.string(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  /** Ended early by the user or by signing out; null when it ran to its expiry or is still open. */
  endedAt: z.iso.datetime().nullable(),
  active: z.boolean(),
});

export type BreakGlassGrant = z.infer<typeof breakGlassGrantSchema>;

export const breakGlassGrantListSchema = listResponseSchema(breakGlassGrantSchema);
