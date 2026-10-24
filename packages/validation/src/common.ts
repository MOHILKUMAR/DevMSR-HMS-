import { z } from 'zod';

/** Record IDs in URLs and bodies are always UUIDs, never names or phone numbers. */
export const uuidSchema = z.uuid();

/** Route params for `/:id` routes. */
export const idParamsSchema = z.object({ id: uuidSchema });

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
