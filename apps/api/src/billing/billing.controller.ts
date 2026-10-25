import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { Paginated } from '@devmsr/types';
import {
  chargeListQuerySchema,
  chargeListSchema,
  chargeSchema,
  createInvoiceSchema,
  idParamsSchema,
  invoiceListQuerySchema,
  invoiceListSchema,
  invoiceSchema,
  patientAccountSchema,
  postChargeSchema,
  type Charge,
  type ChargeListQuery,
  type CreateInvoice,
  type Invoice,
  type InvoiceListQuery,
  type InvoiceSummary,
  type PatientAccount,
  type PostCharge,
} from '@devmsr/validation';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth, RequirePermission } from '../auth/decorators.js';
import { ApiContract, ValidBody, ValidParams, ValidQuery } from '../common/contract/api-contract.js';
import { ReqMeta, type RequestMeta } from '../common/http/app-request.js';
import { Idempotent } from '../common/idempotency/idempotent.decorator.js';
import { BillingService } from './billing.service.js';

/** A patient's charges and account. */
@Controller('patients')
export class PatientBillingController {
  constructor(private readonly billing: BillingService) {}

  @Post(':id/charges')
  @Idempotent()
  @RequirePermission('billing.charge.create')
  @ApiContract({ summary: 'Post a charge at the rate in force on the service date', params: idParamsSchema, body: postChargeSchema, response: chargeSchema })
  postCharge(
    @CurrentAuth() auth: AuthContext,
    @ValidParams() params: { id: string },
    @ValidBody() body: PostCharge,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Charge> {
    return this.billing.postCharge(auth, params.id, body, meta);
  }

  @Get(':id/charges')
  @RequirePermission('billing.account.read')
  @ApiContract({ summary: "A patient's charges", params: idParamsSchema, query: chargeListQuerySchema, response: chargeListSchema })
  listCharges(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ValidQuery() query: ChargeListQuery): Promise<{ data: Charge[] }> {
    return this.billing.listCharges(auth, params.id, query);
  }

  @Get(':id/account')
  @RequirePermission('billing.account.read')
  @ApiContract({ summary: "A patient's unbilled charges, bills, receipts and deposit held (audited)", params: idParamsSchema, response: patientAccountSchema })
  account(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ReqMeta() meta: RequestMeta): Promise<PatientAccount> {
    return this.billing.account(auth, params.id, meta);
  }
}

/** Bills: drafted from charges, then issued (numbered and locked) or discarded. */
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly billing: BillingService) {}

  @Post()
  @Idempotent()
  @RequirePermission('billing.invoice.create')
  @ApiContract({ summary: "Draft a bill from a patient's unbilled charges", body: createInvoiceSchema, response: invoiceSchema })
  create(@CurrentAuth() auth: AuthContext, @ValidBody() body: CreateInvoice, @ReqMeta() meta: RequestMeta): Promise<Invoice> {
    return this.billing.createDraft(auth, body, meta);
  }

  @Get()
  @RequirePermission('billing.account.read')
  @ApiContract({ summary: 'Bills, newest first; drafts and issued, never discarded unless asked', query: invoiceListQuerySchema, response: invoiceListSchema })
  list(@CurrentAuth() auth: AuthContext, @ValidQuery() query: InvoiceListQuery): Promise<Paginated<InvoiceSummary>> {
    return this.billing.listInvoices(auth, query);
  }

  @Get(':id')
  @RequirePermission('billing.account.read')
  @ApiContract({ summary: 'A bill with its lines (audited)', params: idParamsSchema, response: invoiceSchema })
  get(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ReqMeta() meta: RequestMeta): Promise<Invoice> {
    return this.billing.getInvoice(auth, params.id, meta);
  }

  @Post(':id/issue')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('billing.invoice.issue')
  @ApiContract({ summary: 'Issue a draft: the next bill number, then locked for good', params: idParamsSchema, response: invoiceSchema })
  issue(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ReqMeta() meta: RequestMeta): Promise<Invoice> {
    return this.billing.issue(auth, params.id, meta);
  }

  @Post(':id/discard')
  @HttpCode(200)
  @RequirePermission('billing.invoice.create')
  @ApiContract({ summary: 'Discard a draft; its charges can go on another bill', params: idParamsSchema, response: invoiceSchema })
  discard(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ReqMeta() meta: RequestMeta): Promise<Invoice> {
    return this.billing.discard(auth, params.id, meta);
  }
}
