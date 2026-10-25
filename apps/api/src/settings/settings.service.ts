import { Injectable } from '@nestjs/common';
import type { Paginated } from '@devmsr/types';
import type {
  CreateDepartment,
  CreateDoctor,
  Department,
  Doctor,
  DoctorListQuery,
  HospitalProfile,
  ListQuery,
  UpdateDepartment,
  UpdateDoctor,
  UpdateHospitalProfile,
} from '@devmsr/validation';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth-context.js';
import { Errors } from '../common/errors/app-error.js';
import type { RequestMeta } from '../common/http/app-request.js';
import { hospitalOf } from '../common/http/hospital-scope.js';
import { paged } from '../common/http/pagination.js';
import { TransactionRunner } from '../common/prisma/transaction-runner.js';
import type { Tx } from '../common/prisma/tx.js';
import { Prisma } from '../generated/prisma/client.js';
import { toDepartment, toDoctor, toHospitalProfile } from './dto/settings.mapper.js';
import { SettingsRepository } from './settings.repository.js';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** The names of the fields an update actually sets, for the audit log. Values are never logged. */
function changedFields(input: Record<string, unknown>): string {
  return Object.keys(input)
    .filter((key) => input[key] !== undefined)
    .sort()
    .join(',');
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly audit: AuditService,
    private readonly transactions: TransactionRunner,
  ) {}

  async hospitalProfile(auth: AuthContext): Promise<HospitalProfile> {
    const row = await this.settings.hospitalProfile(hospitalOf(auth));
    if (row === null) throw Errors.notFound('hospital');
    return toHospitalProfile(row);
  }

  async updateHospitalProfile(auth: AuthContext, input: UpdateHospitalProfile, meta: RequestMeta): Promise<HospitalProfile> {
    const hospitalId = hospitalOf(auth);
    return this.transactions.run(async (tx) => {
      const row = await this.settings.updateHospitalProfile(hospitalId, input, tx);
      await this.record(auth, 'settings.hospital.updated', 'hospital', hospitalId, meta, tx, { fields: changedFields(input) });
      return toHospitalProfile(row);
    });
  }

  async listDepartments(auth: AuthContext, query: ListQuery): Promise<Paginated<Department>> {
    const { rows, total } = await this.settings.listDepartments(hospitalOf(auth), query, query);
    return paged(rows.map(toDepartment), total, query);
  }

  async createDepartment(auth: AuthContext, input: CreateDepartment, meta: RequestMeta): Promise<Department> {
    const hospitalId = hospitalOf(auth);
    try {
      return await this.transactions.run(async (tx) => {
        const row = await this.settings.createDepartment(hospitalId, input, tx);
        await this.record(auth, 'masters.department.created', 'department', row.id, meta, tx, { code: row.code });
        return toDepartment(row);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw Errors.conflict('A department with this code already exists.');
      throw error;
    }
  }

  async updateDepartment(auth: AuthContext, id: string, input: UpdateDepartment, meta: RequestMeta): Promise<Department> {
    const hospitalId = hospitalOf(auth);
    if ((await this.settings.findDepartment(hospitalId, id)) === null) throw Errors.notFound('department');
    return this.transactions.run(async (tx) => {
      const row = await this.settings.updateDepartment(hospitalId, id, input, tx);
      await this.record(auth, 'masters.department.updated', 'department', id, meta, tx, { fields: changedFields(input) });
      return toDepartment(row);
    });
  }

  async listDoctors(auth: AuthContext, query: DoctorListQuery): Promise<Paginated<Doctor>> {
    const { rows, total } = await this.settings.listDoctors(hospitalOf(auth), query, query);
    return paged(rows.map(toDoctor), total, query);
  }

  async createDoctor(auth: AuthContext, input: CreateDoctor, meta: RequestMeta): Promise<Doctor> {
    const hospitalId = hospitalOf(auth);
    await this.checkDepartment(hospitalId, input.departmentId);
    if (input.userId != null) await this.checkDoctorLogin(hospitalId, input.userId);
    try {
      return await this.transactions.run(async (tx) => {
        const row = await this.settings.createDoctor(
          hospitalId,
          {
            fullName: input.fullName,
            departmentId: input.departmentId,
            qualification: input.qualification ?? null,
            registrationNumber: input.registrationNumber ?? null,
            userId: input.userId ?? null,
            isVisiting: input.isVisiting ?? false,
          },
          tx,
        );
        await this.record(auth, 'masters.doctor.created', 'doctor', row.id, meta, tx, {});
        return toDoctor(row);
      });
    } catch (error) {
      // The only unique column is the login: it is already linked to another doctor.
      if (isUniqueViolation(error)) throw Errors.doctorLoginInvalid();
      throw error;
    }
  }

  async updateDoctor(auth: AuthContext, id: string, input: UpdateDoctor, meta: RequestMeta): Promise<Doctor> {
    const hospitalId = hospitalOf(auth);
    if ((await this.settings.findDoctor(hospitalId, id)) === null) throw Errors.notFound('doctor');
    if (input.departmentId !== undefined) await this.checkDepartment(hospitalId, input.departmentId);
    if (input.userId != null) await this.checkDoctorLogin(hospitalId, input.userId);
    try {
      return await this.transactions.run(async (tx) => {
        const row = await this.settings.updateDoctor(hospitalId, id, input, tx);
        await this.record(auth, 'masters.doctor.updated', 'doctor', id, meta, tx, { fields: changedFields(input) });
        return toDoctor(row);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw Errors.doctorLoginInvalid();
      throw error;
    }
  }

  private async checkDepartment(hospitalId: string, departmentId: string): Promise<void> {
    const department = await this.settings.findDepartment(hospitalId, departmentId);
    if (department === null || !department.isActive) throw Errors.referenceInvalid('department');
  }

  private async checkDoctorLogin(hospitalId: string, userId: string): Promise<void> {
    if (!(await this.settings.isDoctorLogin(hospitalId, userId))) throw Errors.doctorLoginInvalid();
  }

  private record(
    auth: AuthContext,
    action: string,
    entityType: string,
    entityId: string,
    meta: RequestMeta,
    tx: Tx,
    details: Record<string, string>,
  ): Promise<void> {
    return this.audit.record({ action, hospitalId: auth.hospitalId, actorUserId: auth.userId, entityType, entityId, meta, details }, tx);
  }
}
