import { z } from 'zod';
import { atLeastOneField, listQuerySchema, listResponseSchema, nameSchema } from './common.js';

/** Staff usernames: lowercase, 3 to 40 characters, starting with a letter or digit. */
export const staffUsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{2,39}$/, 'Use 3 to 40 letters, digits, . _ or -');

/** New passwords set by an admin. Length matters more than character rules. */
export const newPasswordSchema = z.string().min(10).max(256);

const roleCodesSchema = z.array(z.string().trim().min(1)).min(1).max(5);

export const roleSummarySchema = z.object({ code: z.string(), name: z.string() });

export const staffUserSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  displayName: z.string(),
  isActive: z.boolean(),
  /** Locked after 5 failed sign-ins; setting a new password unlocks it. */
  locked: z.boolean(),
  /** An admin set the password, and the user has not yet chosen their own at sign-in. */
  mustChangePassword: z.boolean(),
  roles: z.array(roleSummarySchema),
  lastLoginAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export type StaffUser = z.infer<typeof staffUserSchema>;

export const staffUserListSchema = listResponseSchema(staffUserSchema);

/** `?permission=opd.queue.read-own` lists only users who hold that permission, such as doctor logins. */
export const staffUserListQuerySchema = listQuerySchema.extend({
  permission: z
    .string()
    .regex(/^[a-z]+.[a-z-]+.[a-z-]+$/)
    .optional(),
});

export type StaffUserListQuery = z.infer<typeof staffUserListQuerySchema>;

export const createStaffUserSchema = z.object({
  username: staffUsernameSchema,
  displayName: nameSchema,
  password: newPasswordSchema,
  roleCodes: roleCodesSchema,
});

export type CreateStaffUser = z.infer<typeof createStaffUserSchema>;

export const updateStaffUserSchema = z
  .object({
    displayName: nameSchema.optional(),
    isActive: z.boolean().optional(),
    roleCodes: roleCodesSchema.optional(),
  })
  .refine(atLeastOneField, 'Change at least one field');

export type UpdateStaffUser = z.infer<typeof updateStaffUserSchema>;

export const setStaffPasswordSchema = z.object({ password: newPasswordSchema });

export type SetStaffPassword = z.infer<typeof setStaffPasswordSchema>;

export const roleSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  isSystem: z.boolean(),
  permissions: z.array(z.string()),
});

export type Role = z.infer<typeof roleSchema>;

export const roleListSchema = z.object({ data: z.array(roleSchema) });
