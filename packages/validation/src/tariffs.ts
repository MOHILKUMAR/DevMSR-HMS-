import { z } from 'zod';
import {
  atLeastOneField,
  codeSchema,
  isoDateSchema,
  itemsResponseSchema,
  listQuerySchema,
  listResponseSchema,
  nameSchema,
  paiseSchema,
} from './common.js';

export const SERVICE_KINDS = ['consultation', 'room', 'nursing', 'procedure', 'investigation', 'other'] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];

/** Tax in basis points: 1800 is 18%. Entered by the hospital. */
export const taxRateBpSchema = z.number().int().min(0).max(10_000);

export const currentRateSchema = z.object({
  ratePaise: z.number().int(),
  taxRateBp: z.number().int(),
  effectiveFrom: isoDateSchema,
});

export const serviceItemSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  kind: z.enum(SERVICE_KINDS),
  doctorId: z.uuid().nullable(),
  doctorName: z.string().nullable(),
  roomCategoryId: z.uuid().nullable(),
  roomCategoryName: z.string().nullable(),
  isActive: z.boolean(),
  /** The rate that applies today, if any. */
  currentRate: currentRateSchema.nullable(),
});

export type ServiceItem = z.infer<typeof serviceItemSchema>;
export const serviceItemListSchema = listResponseSchema(serviceItemSchema);

export const serviceItemListQuerySchema = listQuerySchema.extend({
  kind: z.enum(SERVICE_KINDS).optional(),
  doctorId: z.uuid().optional(),
});
export type ServiceItemListQuery = z.infer<typeof serviceItemListQuerySchema>;

export const createServiceItemSchema = z
  .object({
    code: codeSchema,
    name: nameSchema,
    kind: z.enum(SERVICE_KINDS),
    doctorId: z.uuid().nullable().optional(),
    roomCategoryId: z.uuid().nullable().optional(),
  })
  .refine((item) => item.doctorId == null || item.kind === 'consultation', {
    message: 'Only a consultation belongs to a doctor',
    path: ['doctorId'],
  })
  .refine((item) => item.roomCategoryId == null || item.kind === 'room' || item.kind === 'nursing', {
    message: 'Only room rent and nursing belong to a room category',
    path: ['roomCategoryId'],
  });

export type CreateServiceItem = z.infer<typeof createServiceItemSchema>;

export const updateServiceItemSchema = z
  .object({ name: nameSchema.optional(), isActive: z.boolean().optional() })
  .refine(atLeastOneField, 'Change at least one field');

export type UpdateServiceItem = z.infer<typeof updateServiceItemSchema>;

export const tariffRateSchema = z.object({
  id: z.uuid(),
  ratePaise: z.number().int(),
  taxRateBp: z.number().int(),
  effectiveFrom: isoDateSchema,
  effectiveTo: isoDateSchema.nullable(),
  createdAt: z.iso.datetime(),
});

export type TariffRate = z.infer<typeof tariffRateSchema>;
export const tariffRateListSchema = itemsResponseSchema(tariffRateSchema);

/** A new rate from a date. It closes the current rate the day before. */
export const createTariffRateSchema = z.object({
  ratePaise: paiseSchema,
  taxRateBp: taxRateBpSchema,
  effectiveFrom: isoDateSchema,
});

export type CreateTariffRate = z.infer<typeof createTariffRateSchema>;
