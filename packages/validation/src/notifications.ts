import { z } from 'zod';
import { listResponseSchema } from './common.js';
import { paginationQuerySchema } from './pagination.js';

export const notificationKindSchema = z.enum(['break_glass_started', 'failed_logins']);

export type NotificationKind = z.infer<typeof notificationKindSchema>;

/** The words come from the web app's messages per kind; `details` holds the facts (IDs, staff names, counts). */
export const notificationSchema = z.object({
  id: z.uuid(),
  kind: notificationKindSchema,
  details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  createdAt: z.iso.datetime(),
  readAt: z.iso.datetime().nullable(),
});

export type Notification = z.infer<typeof notificationSchema>;

export const notificationListSchema = listResponseSchema(notificationSchema);

export const notificationListQuerySchema = paginationQuerySchema.extend({
  unread: z.stringbool().optional(),
});

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export const unreadCountSchema = z.object({ unread: z.number().int().min(0) });

export type UnreadCount = z.infer<typeof unreadCountSchema>;

export const markAllReadResponseSchema = z.object({ updated: z.number().int().min(0) });

export type MarkAllReadResponse = z.infer<typeof markAllReadResponseSchema>;
