import { z } from 'zod';
import {
  atLeastOneField,
  codeSchema,
  itemsResponseSchema,
  listQuerySchema,
  listResponseSchema,
  nameSchema,
  optionalTextSchema,
} from './common.js';

// Hospital details, printed on bills, receipts and discharge summaries.

export const hospitalProfileSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  addressLine: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  pincode: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
});

export type HospitalProfile = z.infer<typeof hospitalProfileSchema>;

export const updateHospitalProfileSchema = z
  .object({
    name: nameSchema.optional(),
    addressLine: optionalTextSchema(200),
    city: optionalTextSchema(80),
    state: optionalTextSchema(80),
    pincode: z
      .string()
      .trim()
      .regex(/^[1-9][0-9]{5}$/, 'Use a 6-digit PIN code')
      .nullable()
      .optional(),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{6,20}$/, 'Use digits, spaces and + ( ) -')
      .nullable()
      .optional(),
    email: z.email().nullable().optional(),
  })
  .refine(atLeastOneField, 'Change at least one field');

export type UpdateHospitalProfile = z.infer<typeof updateHospitalProfileSchema>;

// Departments and room categories: a code and a name.

const codedSchema = z.object({ id: z.uuid(), code: z.string(), name: z.string(), isActive: z.boolean() });
const createCodedSchema = z.object({ code: codeSchema, name: nameSchema });
const updateCodedSchema = z
  .object({ name: nameSchema.optional(), isActive: z.boolean().optional() })
  .refine(atLeastOneField, 'Change at least one field');

export const departmentSchema = codedSchema;
export type Department = z.infer<typeof departmentSchema>;
export const departmentListSchema = listResponseSchema(departmentSchema);
export const createDepartmentSchema = createCodedSchema;
export type CreateDepartment = z.infer<typeof createDepartmentSchema>;
export const updateDepartmentSchema = updateCodedSchema;
export type UpdateDepartment = z.infer<typeof updateDepartmentSchema>;

export const roomCategorySchema = codedSchema;
export type RoomCategory = z.infer<typeof roomCategorySchema>;
export const roomCategoryListSchema = listResponseSchema(roomCategorySchema);
export const createRoomCategorySchema = createCodedSchema;
export type CreateRoomCategory = z.infer<typeof createRoomCategorySchema>;
export const updateRoomCategorySchema = updateCodedSchema;
export type UpdateRoomCategory = z.infer<typeof updateRoomCategorySchema>;

// Doctors.

export const doctorSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  qualification: z.string().nullable(),
  registrationNumber: z.string().nullable(),
  departmentId: z.uuid(),
  departmentName: z.string(),
  /** The doctor's login, if they have one. */
  userId: z.uuid().nullable(),
  username: z.string().nullable(),
  isVisiting: z.boolean(),
  isActive: z.boolean(),
});

export type Doctor = z.infer<typeof doctorSchema>;
export const doctorListSchema = listResponseSchema(doctorSchema);

export const doctorListQuerySchema = listQuerySchema.extend({ departmentId: z.uuid().optional() });
export type DoctorListQuery = z.infer<typeof doctorListQuerySchema>;

export const createDoctorSchema = z.object({
  fullName: nameSchema,
  departmentId: z.uuid(),
  qualification: optionalTextSchema(120),
  registrationNumber: optionalTextSchema(40),
  userId: z.uuid().nullable().optional(),
  isVisiting: z.boolean().optional(),
});

export type CreateDoctor = z.infer<typeof createDoctorSchema>;

export const updateDoctorSchema = z
  .object({
    fullName: nameSchema.optional(),
    departmentId: z.uuid().optional(),
    qualification: optionalTextSchema(120),
    registrationNumber: optionalTextSchema(40),
    userId: z.uuid().nullable().optional(),
    isVisiting: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(atLeastOneField, 'Change at least one field');

export type UpdateDoctor = z.infer<typeof updateDoctorSchema>;

// Wards and beds.

export const BED_STATUSES = ['free', 'occupied', 'cleaning', 'reserved', 'blocked'] as const;

export const wardSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  roomCategoryId: z.uuid().nullable(),
  roomCategoryName: z.string().nullable(),
  isActive: z.boolean(),
  bedCount: z.number().int(),
});

export type Ward = z.infer<typeof wardSchema>;
export const wardListSchema = listResponseSchema(wardSchema);

export const createWardSchema = z.object({
  code: codeSchema,
  name: nameSchema,
  roomCategoryId: z.uuid().nullable().optional(),
});

export type CreateWard = z.infer<typeof createWardSchema>;

export const updateWardSchema = z
  .object({
    name: nameSchema.optional(),
    roomCategoryId: z.uuid().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(atLeastOneField, 'Change at least one field');

export type UpdateWard = z.infer<typeof updateWardSchema>;

export const bedSchema = z.object({
  id: z.uuid(),
  wardId: z.uuid(),
  code: z.string(),
  status: z.enum(BED_STATUSES),
  isActive: z.boolean(),
});

export type Bed = z.infer<typeof bedSchema>;
export const bedListSchema = itemsResponseSchema(bedSchema);

export const createBedSchema = z.object({ code: codeSchema });
export type CreateBed = z.infer<typeof createBedSchema>;

/** Masters only retire or restore a bed. Free, cleaning and blocked are set on the bed board. */
export const updateBedSchema = z.object({ isActive: z.boolean() });
export type UpdateBed = z.infer<typeof updateBedSchema>;
