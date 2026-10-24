import { z } from 'zod';

export const PAGE_SIZE_DEFAULT = 50;
export const PAGE_SIZE_MAX = 100;

/** `?page=1&pageSize=50&sort=createdAt:desc`, shared by every list endpoint. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
  sort: z
    .string()
    .regex(/^[a-zA-Z]+:(asc|desc)$/, 'Use field:asc or field:desc')
    .optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
