import { Controller, Get, Patch, Post } from '@nestjs/common';
import type { Paginated } from '@devmsr/types';
import {
  createDepartmentSchema,
  createDoctorSchema,
  departmentListSchema,
  departmentSchema,
  doctorListQuerySchema,
  doctorListSchema,
  doctorSchema,
  hospitalProfileSchema,
  idParamsSchema,
  listQuerySchema,
  updateDepartmentSchema,
  updateDoctorSchema,
  updateHospitalProfileSchema,
  type CreateDepartment,
  type CreateDoctor,
  type Department,
  type Doctor,
  type DoctorListQuery,
  type HospitalProfile,
  type ListQuery,
  type UpdateDepartment,
  type UpdateDoctor,
  type UpdateHospitalProfile,
} from '@devmsr/validation';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth, RequirePermission } from '../auth/decorators.js';
import { ApiContract, ValidBody, ValidParams, ValidQuery } from '../common/contract/api-contract.js';
import { ReqMeta, type RequestMeta } from '../common/http/app-request.js';
import { SettingsService } from './settings.service.js';

@Controller('hospital-profile')
export class HospitalProfileController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @RequirePermission('masters.data.read')
  @ApiContract({ summary: 'Hospital name, address and contacts, as printed on bills', response: hospitalProfileSchema })
  get(@CurrentAuth() auth: AuthContext): Promise<HospitalProfile> {
    return this.settings.hospitalProfile(auth);
  }

  @Patch()
  @RequirePermission('settings.hospital.manage')
  @ApiContract({ summary: 'Change hospital name, address and contacts', body: updateHospitalProfileSchema, response: hospitalProfileSchema })
  update(@CurrentAuth() auth: AuthContext, @ValidBody() body: UpdateHospitalProfile, @ReqMeta() meta: RequestMeta): Promise<HospitalProfile> {
    return this.settings.updateHospitalProfile(auth, body, meta);
  }
}

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @RequirePermission('masters.data.read')
  @ApiContract({ summary: 'List departments', query: listQuerySchema, response: departmentListSchema })
  list(@CurrentAuth() auth: AuthContext, @ValidQuery() query: ListQuery): Promise<Paginated<Department>> {
    return this.settings.listDepartments(auth, query);
  }

  @Post()
  @RequirePermission('masters.data.manage')
  @ApiContract({ summary: 'Add a department', body: createDepartmentSchema, response: departmentSchema })
  create(@CurrentAuth() auth: AuthContext, @ValidBody() body: CreateDepartment, @ReqMeta() meta: RequestMeta): Promise<Department> {
    return this.settings.createDepartment(auth, body, meta);
  }

  @Patch(':id')
  @RequirePermission('masters.data.manage')
  @ApiContract({ summary: 'Rename, retire or restore a department', params: idParamsSchema, body: updateDepartmentSchema, response: departmentSchema })
  update(
    @CurrentAuth() auth: AuthContext,
    @ValidParams() params: { id: string },
    @ValidBody() body: UpdateDepartment,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Department> {
    return this.settings.updateDepartment(auth, params.id, body, meta);
  }
}

@Controller('doctors')
export class DoctorsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @RequirePermission('masters.data.read')
  @ApiContract({ summary: 'List doctors, optionally of one department', query: doctorListQuerySchema, response: doctorListSchema })
  list(@CurrentAuth() auth: AuthContext, @ValidQuery() query: DoctorListQuery): Promise<Paginated<Doctor>> {
    return this.settings.listDoctors(auth, query);
  }

  @Post()
  @RequirePermission('masters.data.manage')
  @ApiContract({ summary: 'Add a doctor, optionally linked to their login', body: createDoctorSchema, response: doctorSchema })
  create(@CurrentAuth() auth: AuthContext, @ValidBody() body: CreateDoctor, @ReqMeta() meta: RequestMeta): Promise<Doctor> {
    return this.settings.createDoctor(auth, body, meta);
  }

  @Patch(':id')
  @RequirePermission('masters.data.manage')
  @ApiContract({ summary: 'Change a doctor', params: idParamsSchema, body: updateDoctorSchema, response: doctorSchema })
  update(
    @CurrentAuth() auth: AuthContext,
    @ValidParams() params: { id: string },
    @ValidBody() body: UpdateDoctor,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Doctor> {
    return this.settings.updateDoctor(auth, params.id, body, meta);
  }
}
