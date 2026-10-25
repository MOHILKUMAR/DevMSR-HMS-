import { Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import type { Paginated } from '@devmsr/types';
import {
  dischargeListQuerySchema,
  dischargeListSchema,
  dischargeSchema,
  dischargeSummaryDocumentSchema,
  dischargeSummaryInputSchema,
  idParamsSchema,
  invoiceSchema,
  markFitSchema,
  type Discharge,
  type DischargeListQuery,
  type DischargeRow,
  type DischargeSummaryDocument,
  type DischargeSummaryInput,
  type Invoice,
  type MarkFit,
} from '@devmsr/validation';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth, RequirePermission } from '../auth/decorators.js';
import { ApiContract, ValidBody, ValidParams, ValidQuery } from '../common/contract/api-contract.js';
import { ReqMeta, type RequestMeta } from '../common/http/app-request.js';
import { Idempotent } from '../common/idempotency/idempotent.decorator.js';
import { DischargeService } from './discharge.service.js';

/** Discharges: fit, final bill, billing clearance, the summary and completion (CLAUDE.md section 12). */
@Controller('discharges')
export class DischargesController {
  constructor(private readonly discharges: DischargeService) {}

  @Post()
  @RequirePermission('ipd.discharge.mark-fit')
  @ApiContract({ summary: 'The treating doctor marks the patient fit for discharge, which starts the discharge', body: markFitSchema, response: dischargeSchema })
  markFit(@CurrentAuth() auth: AuthContext, @ValidBody() body: MarkFit, @ReqMeta() meta: RequestMeta): Promise<Discharge> {
    return this.discharges.markFit(auth, body, meta);
  }

  @Get()
  @RequirePermission('ipd.admission.read')
  @ApiContract({ summary: 'Discharges, latest first. ?status=open for those still in progress', query: dischargeListQuerySchema, response: dischargeListSchema })
  list(@CurrentAuth() auth: AuthContext, @ValidQuery() query: DischargeListQuery): Promise<Paginated<DischargeRow>> {
    return this.discharges.list(auth, query);
  }

  @Get(':id')
  @RequirePermission('ipd.admission.read')
  @ApiContract({ summary: "One discharge with the stay's bills and where the account stands (audited)", params: idParamsSchema, response: dischargeSchema })
  get(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ReqMeta() meta: RequestMeta): Promise<Discharge> {
    return this.discharges.get(auth, params.id, meta);
  }

  @Post(':id/final-bill')
  @Idempotent()
  @RequirePermission('billing.invoice.create')
  @ApiContract({
    summary: 'Post any room and nursing charges due, then draft a bill of every unbilled charge',
    params: idParamsSchema,
    response: invoiceSchema,
  })
  finalBill(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ReqMeta() meta: RequestMeta): Promise<Invoice> {
    return this.discharges.prepareFinalBill(auth, params.id, meta);
  }

  @Post(':id/clearance')
  @RequirePermission('billing.clearance.grant')
  @ApiContract({ summary: 'Billing clearance at a zero balance, with every day charged', params: idParamsSchema, response: dischargeSchema })
  clear(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ReqMeta() meta: RequestMeta): Promise<Discharge> {
    return this.discharges.clear(auth, params.id, meta);
  }

  @Get(':id/summary')
  @RequirePermission('ipd.discharge-summary.read')
  @ApiContract({ summary: 'The discharge summary, for reading and printing (audited)', params: idParamsSchema, response: dischargeSummaryDocumentSchema })
  summary(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ReqMeta() meta: RequestMeta): Promise<DischargeSummaryDocument> {
    return this.discharges.getSummary(auth, params.id, meta);
  }

  @Put(':id/summary')
  @RequirePermission('ipd.discharge-summary.write')
  @ApiContract({
    summary: 'The treating doctor writes or rewrites the summary, until it is signed',
    params: idParamsSchema,
    body: dischargeSummaryInputSchema,
    response: dischargeSummaryDocumentSchema,
  })
  saveSummary(
    @CurrentAuth() auth: AuthContext,
    @ValidParams() params: { id: string },
    @ValidBody() body: DischargeSummaryInput,
    @ReqMeta() meta: RequestMeta,
  ): Promise<DischargeSummaryDocument> {
    return this.discharges.saveSummary(auth, params.id, body, meta);
  }

  @Post(':id/summary/sign')
  @HttpCode(200)
  @RequirePermission('ipd.discharge-summary.sign')
  @ApiContract({ summary: 'The MD signs the summary off; it never changes after this', params: idParamsSchema, response: dischargeSummaryDocumentSchema })
  signSummary(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ReqMeta() meta: RequestMeta): Promise<DischargeSummaryDocument> {
    return this.discharges.signSummary(auth, params.id, meta);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @RequirePermission('ipd.discharge.complete')
  @ApiContract({ summary: 'The patient leaves: the bed goes to cleaning and the admission closes', params: idParamsSchema, response: dischargeSchema })
  complete(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ReqMeta() meta: RequestMeta): Promise<Discharge> {
    return this.discharges.complete(auth, params.id, meta);
  }
}
