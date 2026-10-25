import { z } from 'zod';
import { itemsResponseSchema } from './common.js';
import { newPasswordSchema } from './users.js';

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
  /** A super admin's open break-glass access; `hospital` is then the hospital opened. */
  breakGlass: z
    .object({
      grantId: z.uuid(),
      expiresAt: z.iso.datetime(),
    })
    .nullable(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;

export const csrfResponseSchema = z.object({
  csrfToken: z.string(),
});

export type CsrfResponse = z.infer<typeof csrfResponseSchema>;

/** What a user must do after a correct password and before a session starts. */
export const loginStepSchema = z.enum(['change_password', 'totp_setup', 'totp_verify']);

export type LoginStep = z.infer<typeof loginStepSchema>;

const signedInSchema = meResponseSchema.extend({
  status: z.literal('signed_in'),
  csrfToken: z.string(),
  /** Only right after two-factor was set up at sign-in: shown once, never again. */
  recoveryCodes: z.array(z.string()).optional(),
});

/** The password was right, but sign-in needs another step. The challenge itself is an httpOnly cookie. */
const loginChallengeSchema = z.object({
  status: z.literal('challenge'),
  step: loginStepSchema,
  expiresAt: z.iso.datetime(),
});

export const loginResponseSchema = z.discriminatedUnion('status', [signedInSchema, loginChallengeSchema]);

export type LoginResponse = z.infer<typeof loginResponseSchema>;

/** The `change_password` step: an admin set the password, so the user chooses their own. */
export const loginPasswordChangeSchema = z.object({
  newPassword: newPasswordSchema,
});

export type LoginPasswordChange = z.infer<typeof loginPasswordChangeSchema>;

export const changeOwnPasswordSchema = z.object({
  // Same bound as login, so the hasher is never handed a huge string.
  currentPassword: z.string().min(1).max(256),
  newPassword: newPasswordSchema,
});

export type ChangeOwnPassword = z.infer<typeof changeOwnPasswordSchema>;

/** One of the signed-in user's own open sessions, for My account. */
export const ownSessionSchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  /** The session making this request. */
  current: z.boolean(),
});

export type OwnSession = z.infer<typeof ownSessionSchema>;

export const ownSessionListSchema = itemsResponseSchema(ownSessionSchema);

export const endOtherSessionsResponseSchema = z.object({
  ended: z.number().int().min(0),
});

export type EndOtherSessionsResponse = z.infer<typeof endOtherSessionsResponseSchema>;

/** A 6 digit code from the authenticator app. Spaces are ignored, as apps show "123 456". */
export const totpCodeSchema = z
  .string()
  .transform((value) => value.replace(/\s/g, ''))
  .pipe(z.string().regex(/^\d{6}$/));

export const totpCodeBodySchema = z.object({ code: totpCodeSchema });

export type TotpCodeBody = z.infer<typeof totpCodeBodySchema>;

/** The totp_verify step: a code from the app, or one of the recovery codes. Exactly one. */
export const loginTotpSchema = z
  .object({
    code: totpCodeSchema.optional(),
    recoveryCode: z.string().trim().min(10).max(20).optional(),
  })
  .refine((body) => (body.code === undefined) !== (body.recoveryCode === undefined), 'Send a code or a recovery code');

export type LoginTotp = z.infer<typeof loginTotpSchema>;

/** What an authenticator app needs: scan the QR code, or type the secret. */
export const totpSetupSchema = z.object({
  secret: z.string(),
  otpauthUri: z.string(),
  /** An SVG image as a data URL. */
  qrCode: z.string(),
});

export type TotpSetupResponse = z.infer<typeof totpSetupSchema>;

export const twoFactorStatusSchema = z.object({
  enabled: z.boolean(),
  /** The user's permissions make two-factor compulsory, so it cannot be turned off. */
  required: z.boolean(),
  recoveryCodesLeft: z.number().int().min(0),
});

export type TwoFactorStatus = z.infer<typeof twoFactorStatusSchema>;

export const recoveryCodesResponseSchema = z.object({
  recoveryCodes: z.array(z.string()),
});

export type RecoveryCodesResponse = z.infer<typeof recoveryCodesResponseSchema>;
