import { Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import type { Paginated } from '@devmsr/types';
import {
  cancelVisitSchema,
  consultationNotesSchema,
  consultationSchema,
  idParamsSchema,
  issueTokenSchema,
  opdQueueSchema,
  opdVisitListQuerySchema,
  opdVisitListSchema,
  opdVisitSchema,
  payOpdFeeSchema,
  placeOrderSchema,
  receiptSchema,
  type CancelVisit,
  type Consultation,
  type ConsultationNotes,
  type IssueToken,
  type OpdQueue,
  type OpdVisit,
  type OpdVisitListQuery,
  type PayOpdFee,
  type PlaceOrder,
  type Receipt,
} from '@devmsr/validation';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth, RequirePermission } from '../auth/decorators.js';
import { ApiContract, ValidBody, ValidParams, ValidQuery } from '../common/contract/api-contract.js';
import { ReqMeta, type RequestMeta } from '../common/http/app-request.js';
import { Idempotent } from '../common/idempotency/idempotent.decorator.js';
import { OpdService } from './opd.service.js';

/**
 * Walk-in OPD: reception issues tokens, the cashier takes the consultation fee, and the doctor sees
 * their own queue, writes notes and orders tests. Doctors reach only their own visits.
 */
@Controller('opd-visits')
export class OpdController {
  constructor(private readonly opd: OpdService) {}

  @Post()
  @Idempotent()
  @RequirePermission('opd.appointment.manage')
  @ApiContract({ summary: "Issue today's next OPD token for a patient to see a doctor", body: issueTokenSchema, response: opdVisitSchema })
  issue(@CurrentAuth() auth: AuthContext, @ValidBody() body: IssueToken, @ReqMeta() meta: RequestMeta): Promise<OpdVisit> {
    return this.opd.issueToken(auth, body, meta);
  }

  @Get()
  @RequirePermission('opd.visit.read')
  @ApiContract({ summary: "A day's OPD visits in token order, without clinical notes", query: opdVisitListQuerySchema, response: opdVisitListSchema })
  list(@CurrentAuth() auth: AuthContext, @ValidQuery() query: OpdVisitListQuery): Promise<Paginated<OpdVisit>> {
    return this.opd.listVisits(auth, query);
  }

  // Before ':id', so "queue" is never read as an id.
  @Get('queue')
  @RequirePermission('opd.queue.read-own')
  @ApiContract({ summary: "The signed-in doctor's paid visits for today, in token order", response: opdQueueSchema })
  queue(@CurrentAuth() auth: AuthContext): Promise<OpdQueue> {
    return this.opd.queue(auth);
  }

  @Get(':id')
  @RequirePermission('opd.visit.read')
  @ApiContract({ summary: 'One OPD visit, without clinical notes (the token slip)', params: idParamsSchema, response: opdVisitSchema })
  get(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }): Promise<OpdVisit> {
    return this.opd.getVisit(auth, params.id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('opd.appointment.manage')
  @ApiContract({ summary: 'Cancel a token that has not been paid for', params: idParamsSchema, body: cancelVisitSchema, response: opdVisitSchema })
  cancel(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ValidBody() body: CancelVisit, @ReqMeta() meta: RequestMeta): Promise<OpdVisit> {
    return this.opd.cancel(auth, params.id, body, meta);
  }

  @Post(':id/fee')
  @Idempotent()
  @RequirePermission('payments.receipt.create')
  @ApiContract({
    summary: 'Take the consultation fee: a bill issued for it and a receipt in your open shift. The token then joins the queue',
    params: idParamsSchema,
    body: payOpdFeeSchema,
    response: receiptSchema,
  })
  payFee(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ValidBody() body: PayOpdFee, @ReqMeta() meta: RequestMeta): Promise<Receipt> {
    return this.opd.payFee(auth, params.id, body, meta);
  }

  @Post(':id/call')
  @HttpCode(200)
  @RequirePermission('clinical.note.write')
  @ApiContract({ summary: 'Call your next patient in', params: idParamsSchema, response: consultationSchema })
  call(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ReqMeta() meta: RequestMeta): Promise<Consultation> {
    return this.opd.call(auth, params.id, meta);
  }

  @Get(':id/consultation')
  @RequirePermission('clinical.note.write')
  @ApiContract({ summary: 'Your visit with its notes and orders (audited)', params: idParamsSchema, response: consultationSchema })
  consultation(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ReqMeta() meta: RequestMeta): Promise<Consultation> {
    return this.opd.consultation(auth, params.id, meta);
  }

  @Put(':id/notes')
  @RequirePermission('clinical.note.write')
  @ApiContract({ summary: 'Save your notes while the patient is with you', params: idParamsSchema, body: consultationNotesSchema, response: consultationSchema })
  notes(
    @CurrentAuth() auth: AuthContext,
    @ValidParams() params: { id: string },
    @ValidBody() body: ConsultationNotes,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Consultation> {
    return this.opd.saveNotes(auth, params.id, body, meta);
  }

  @Post(':id/orders')
  @Idempotent()
  @RequirePermission('clinical.order.create')
  @ApiContract({ summary: 'Order a test or procedure; its charge is posted for billing', params: idParamsSchema, body: placeOrderSchema, response: consultationSchema })
  order(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ValidBody() body: PlaceOrder, @ReqMeta() meta: RequestMeta): Promise<Consultation> {
    return this.opd.placeOrder(auth, params.id, body, meta);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @RequirePermission('clinical.note.write')
  @ApiContract({ summary: 'Complete the visit; its notes are locked from then on', params: idParamsSchema, response: consultationSchema })
  complete(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ReqMeta() meta: RequestMeta): Promise<Consultation> {
    return this.opd.complete(auth, params.id, meta);
  }
}
