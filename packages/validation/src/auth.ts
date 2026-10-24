import { z } from 'zod';

export const loginRequestSchema = z.object({
  // Usernames are stored lowercase, so login is case-insensitive.
  username: z.string().trim().toLowerCase().min(1).max(64),
  // The upper bound stops a huge password from tying up the Argon2 hasher.
  password: z.string().min(1).max(256),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const authUserSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  displayName: z.string(),
  kind: z.enum(['staff', 'platform']),
});

export const authHospitalSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
});

export const meResponseSchema = z.object({
  user: authUserSchema,
  hospital: authHospitalSchema.nullable(),
  permissions: z.array(z.string()),
  session: z.object({
    expiresAt: z.iso.datetime(),
    idleTimeoutSeconds: z.number().int().positive(),
  }),
});

export type MeResponse = z.infer<typeof meResponseSchema>;

export const csrfResponseSchema = z.object({
  csrfToken: z.string(),
});

export type CsrfResponse = z.infer<typeof csrfResponseSchema>;

export const loginResponseSchema = meResponseSchema.extend({
  csrfToken: z.string(),
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;
