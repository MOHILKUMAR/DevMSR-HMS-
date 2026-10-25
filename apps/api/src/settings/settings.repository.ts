import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { pageArgs, type PageRequest } from '../common/http/pagination.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Tx } from '../common/prisma/tx.js';

export const HOSPITAL_PROFILE_SELECT = {
  id: true,
  code: true,
  name: true,
  addressLine: true,
  city: true,
  state: true,
  pincode: true,
  phone: true,
  email: true,
} as const satisfies Prisma.HospitalSelect;

export type HospitalProfileRow = Prisma.HospitalGetPayload<{ select: typeof HOSPITAL_PROFILE_SELECT }>;

const DEPARTMENT_SELECT = { id: true, code: true, name: true, isActive: true } as const satisfies Prisma.DepartmentSelect;
export type DepartmentRow = Prisma.DepartmentGetPayload<{ select: typeof DEPARTMENT_SELECT }>;

const DOCTOR_SELECT = {
  id: true,
  fullName: true,
  qualification: true,
  registrationNumber: true,
  departmentId: true,
  userId: true,
  isVisiting: true,
  isActive: true,
  department: { select: { name: true } },
  user: { select: { username: true } },
} as const satisfies Prisma.DoctorSelect;
export type DoctorRow = Prisma.DoctorGetPayload<{ select: typeof DOCTOR_SELECT }>;

export interface MasterFilter {
  q?: string | undefined;
  includeInactive?: boolean | undefined;
}

function activeFilter(filter: MasterFilter): { isActive?: boolean } {
  return filter.includeInactive === true ? {} : { isActive: true };
}

function hasText(q: string | undefined): q is string {
  return q !== undefined && q !== '';
}

/** Hospital details, departments and doctors. Every query is limited to one hospital. */
@Injectable()
export class SettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  hospitalProfile(hospitalId: string): Promise<HospitalProfileRow | null> {
    return this.prisma.hospital.findUnique({ where: { id: hospitalId }, select: HOSPITAL_PROFILE_SELECT });
  }

  updateHospitalProfile(hospitalId: string, data: Prisma.HospitalUpdateInput, tx: Tx): Promise<HospitalProfileRow> {
    return tx.hospital.update({ where: { id: hospitalId }, data, select: HOSPITAL_PROFILE_SELECT });
  }

  async listDepartments(hospitalId: string, filter: MasterFilter, page: PageRequest): Promise<{ rows: DepartmentRow[]; total: number }> {
    const where: Prisma.DepartmentWhereInput = {
      hospitalId,
      ...activeFilter(filter),
      ...(hasText(filter.q)
        ? { OR: [{ code: { contains: filter.q.toUpperCase() } }, { name: { contains: filter.q, mode: 'insensitive' } }] }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.department.findMany({ where, select: DEPARTMENT_SELECT, orderBy: { name: 'asc' }, ...pageArgs(page) }),
      this.prisma.department.count({ where }),
    ]);
    return { rows, total };
  }

  findDepartment(hospitalId: string, id: string, tx?: Tx): Promise<DepartmentRow | null> {
    return (tx ?? this.prisma).department.findFirst({ where: { id, hospitalId }, select: DEPARTMENT_SELECT });
  }

  createDepartment(hospitalId: string, data: { code: string; name: string }, tx: Tx): Promise<DepartmentRow> {
    return tx.department.create({ data: { hospitalId, ...data }, select: DEPARTMENT_SELECT });
  }

  updateDepartment(hospitalId: string, id: string, data: { name?: string; isActive?: boolean }, tx: Tx): Promise<DepartmentRow> {
    return tx.department.update({ where: { id, hospitalId }, data, select: DEPARTMENT_SELECT });
  }

  async listDoctors(
    hospitalId: string,
    filter: MasterFilter & { departmentId?: string | undefined },
    page: PageRequest,
  ): Promise<{ rows: DoctorRow[]; total: number }> {
    const where: Prisma.DoctorWhereInput = {
      hospitalId,
      ...activeFilter(filter),
      ...(filter.departmentId === undefined ? {} : { departmentId: filter.departmentId }),
      ...(hasText(filter.q) ? { fullName: { contains: filter.q, mode: 'insensitive' } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.doctor.findMany({ where, select: DOCTOR_SELECT, orderBy: { fullName: 'asc' }, ...pageArgs(page) }),
      this.prisma.doctor.count({ where }),
    ]);
    return { rows, total };
  }

  findDoctor(hospitalId: string, id: string, tx?: Tx): Promise<DoctorRow | null> {
    return (tx ?? this.prisma).doctor.findFirst({ where: { id, hospitalId }, select: DOCTOR_SELECT });
  }

  createDoctor(hospitalId: string, data: Omit<Prisma.DoctorUncheckedCreateInput, 'hospitalId'>, tx: Tx): Promise<DoctorRow> {
    return tx.doctor.create({ data: { ...data, hospitalId }, select: DOCTOR_SELECT });
  }

  updateDoctor(hospitalId: string, id: string, data: Prisma.DoctorUncheckedUpdateInput, tx: Tx): Promise<DoctorRow> {
    return tx.doctor.update({ where: { id, hospitalId }, data, select: DOCTOR_SELECT });
  }

  /**
   * A login that may be linked to a doctor: an active staff user of this hospital who holds the
   * doctor's own-queue permission (checked by permission code, never by role name).
   */
  async isDoctorLogin(hospitalId: string, userId: string, tx?: Tx): Promise<boolean> {
    const count = await (tx ?? this.prisma).user.count({
      where: {
        id: userId,
        hospitalId,
        kind: 'staff',
        isActive: true,
        userRoles: {
          some: { role: { hospitalId, rolePermissions: { some: { permission: { code: 'opd.queue.read-own' } } } } },
        },
      },
    });
    return count === 1;
  }
}
