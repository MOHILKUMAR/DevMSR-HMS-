import { Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import type { Paginated } from '@devmsr/types';
import {
  duplicateCheckResponseSchema,
  duplicateCheckSchema,
  idParamsSchema,
  patientSchema,
  patientSearchResponseSchema,
  patientSearchSchema,
  registerPatientSchema,
  updatePatientSchema,
  type DuplicateCheck,
  type DuplicateCheckResponse,
  type Patient,
  type PatientSearch,
  type PatientSummary,
  type RegisterPatient,
  type UpdatePatient,
} from '@devmsr/validation';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth, RequirePermission } from '../auth/decorators.js';
import { ApiContract, ValidBody, ValidParams } from '../common/contract/api-contract.js';
import { ReqMeta, type RequestMeta } from '../common/http/app-request.js';
import { Idempotent } from '../common/idempotency/idempotent.decorator.js';
import { PatientsService } from './patients.service.js';

@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  // A POST so that names and phone numbers never appear in a URL (CLAUDE.md, section 7).
  @Post('search')
  @HttpCode(200)
  @RequirePermission('patients.patient.read')
  @ApiContract({
    summary: 'Find patients by UHID, mobile, name, Aadhaar or ABHA number',
    body: patientSearchSchema,
    response: patientSearchResponseSchema,
  })
  search(@CurrentAuth() auth: AuthContext, @ValidBody() body: PatientSearch, @ReqMeta() meta: RequestMeta): Promise<Paginated<PatientSummary>> {
    return this.patients.search(auth, body, meta);
  }

  @Post('duplicate-check')
  @HttpCode(200)
  @RequirePermission('patients.patient.create')
  @ApiContract({
    summary: 'Find registered patients who look like a new registration',
    body: duplicateCheckSchema,
    response: duplicateCheckResponseSchema,
  })
  duplicateCheck(@CurrentAuth() auth: AuthContext, @ValidBody() body: DuplicateCheck): Promise<DuplicateCheckResponse> {
    return this.patients.duplicateCheck(auth, body);
  }

  @Post()
  @Idempotent()
  @RequirePermission('patients.patient.create')
  @ApiContract({ summary: 'Register a patient and give them the next UHID', body: registerPatientSchema, response: patientSchema })
  register(@CurrentAuth() auth: AuthContext, @ValidBody() body: RegisterPatient, @ReqMeta() meta: RequestMeta): Promise<Patient> {
    return this.patients.register(auth, body, meta);
  }

  @Get(':id')
  @RequirePermission('patients.patient.read')
  @ApiContract({ summary: 'Open a patient record (audited)', params: idParamsSchema, response: patientSchema })
  get(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ReqMeta() meta: RequestMeta): Promise<Patient> {
    return this.patients.get(auth, params.id, meta);
  }

  @Patch(':id')
  @RequirePermission('patients.patient.update')
  @ApiContract({ summary: 'Edit patient details; the UHID never changes', params: idParamsSchema, body: updatePatientSchema, response: patientSchema })
  update(
    @CurrentAuth() auth: AuthContext,
    @ValidParams() params: { id: string },
    @ValidBody() body: UpdatePatient,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Patient> {
    return this.patients.update(auth, params.id, body, meta);
  }
}
