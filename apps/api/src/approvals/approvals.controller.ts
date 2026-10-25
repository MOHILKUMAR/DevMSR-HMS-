import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { Paginated } from '@devmsr/types';
import {
  approvalListQuerySchema,
  approvalListSchema,
  approvalRequestSchema,
  approveRequestSchema,
  creditNoteSchema,
  idParamsSchema,
  payRefundSchema,
  refundSchema,
  rejectRequestSchema,
  requestClearanceDuesSchema,
  requestCreditNoteSchema,
  requestDiscountSchema,
  requestReceiptVoidSchema,
  requestRefundSchema,
  type ApprovalListQuery,
  type ApprovalRequest,
  type ApproveRequest,
  type CreditNote,
  type PayRefund,
  type Refund,
  type RejectRequest,
  type RequestClearanceDues,
  type RequestCreditNote,
  type RequestDiscount,
  type RequestReceiptVoid,
  type RequestRefund,
} from '@devmsr/validation';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth, RequirePermission } from '../auth/decorators.js';
import { ApiContract, ValidBody, ValidParams, ValidQuery } from '../common/contract/api-contract.js';
import { ReqMeta, type RequestMeta } from '../common/http/app-request.js';
import { Idempotent } from '../common/idempotency/idempotent.decorator.js';
import { ApprovalsService } from './approvals.service.js';

// Each kind of request has its own routes, so the guard checks the right permission before
// anything is read. Whoever asked can never decide: the service and the database both refuse it.

@Controller('discount-requests')
export class DiscountRequestsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Post()
  @RequirePermission('billing.discount.request')
  @ApiContract({ summary: 'Ask for a discount on a draft bill, for someone else to approve', body: requestDiscountSchema, response: approvalRequestSchema })
  request(@CurrentAuth() auth: AuthContext, @ValidBody() body: RequestDiscount, @ReqMeta() meta: RequestMeta): Promise<ApprovalRequest> {
    return this.approvals.requestDiscount(auth, body, meta);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('billing.discount.approve')
  @ApiContract({
    summary: 'Approve a discount: the draft is replaced by one with the discount. Above the finance limit, MD only',
    params: idParamsSchema,
    body: approveRequestSchema,
    response: approvalRequestSchema,
  })
  approve(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ValidBody() body: ApproveRequest, @ReqMeta() meta: RequestMeta): Promise<ApprovalRequest> {
    return this.approvals.approve(auth, 'discount', params.id, body, meta);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission('billing.discount.approve')
  @ApiContract({ summary: 'Reject a discount, with a reason', params: idParamsSchema, body: rejectRequestSchema, response: approvalRequestSchema })
  reject(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ValidBody() body: RejectRequest, @ReqMeta() meta: RequestMeta): Promise<ApprovalRequest> {
    return this.approvals.reject(auth, 'discount', params.id, body, meta);
  }
}

@Controller('credit-note-requests')
export class CreditNoteRequestsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Post()
  @RequirePermission('billing.credit-note.request')
  @ApiContract({ summary: 'Ask for a credit note on an issued bill: chosen lines, or the whole bill', body: requestCreditNoteSchema, response: approvalRequestSchema })
  request(@CurrentAuth() auth: AuthContext, @ValidBody() body: RequestCreditNote, @ReqMeta() meta: RequestMeta): Promise<ApprovalRequest> {
    return this.approvals.requestCreditNote(auth, body, meta);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('billing.credit-note.approve')
  @ApiContract({
    summary: 'Approve a credit note: it gets the next CN number. A whole bill also needs billing.void.approve',
    params: idParamsSchema,
    body: approveRequestSchema,
    response: approvalRequestSchema,
  })
  approve(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ValidBody() body: ApproveRequest, @ReqMeta() meta: RequestMeta): Promise<ApprovalRequest> {
    return this.approvals.approve(auth, 'credit_note', params.id, body, meta);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission('billing.credit-note.approve')
  @ApiContract({ summary: 'Reject a credit note, with a reason', params: idParamsSchema, body: rejectRequestSchema, response: approvalRequestSchema })
  reject(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ValidBody() body: RejectRequest, @ReqMeta() meta: RequestMeta): Promise<ApprovalRequest> {
    return this.approvals.reject(auth, 'credit_note', params.id, body, meta);
  }
}

@Controller('refund-requests')
export class RefundRequestsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Post()
  @RequirePermission('billing.refund.request')
  @ApiContract({ summary: 'Ask for a refund of excess deposit or of an overpaid bill', body: requestRefundSchema, response: approvalRequestSchema })
  request(@CurrentAuth() auth: AuthContext, @ValidBody() body: RequestRefund, @ReqMeta() meta: RequestMeta): Promise<ApprovalRequest> {
    return this.approvals.requestRefund(auth, body, meta);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('billing.refund.approve')
  @ApiContract({ summary: 'Approve a refund (MD only). A cashier then pays it out', params: idParamsSchema, body: approveRequestSchema, response: approvalRequestSchema })
  approve(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ValidBody() body: ApproveRequest, @ReqMeta() meta: RequestMeta): Promise<ApprovalRequest> {
    return this.approvals.approve(auth, 'refund', params.id, body, meta);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission('billing.refund.approve')
  @ApiContract({ summary: 'Reject a refund, with a reason', params: idParamsSchema, body: rejectRequestSchema, response: approvalRequestSchema })
  reject(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ValidBody() body: RejectRequest, @ReqMeta() meta: RequestMeta): Promise<ApprovalRequest> {
    return this.approvals.reject(auth, 'refund', params.id, body, meta);
  }

  @Post(':id/pay')
  @Idempotent()
  @RequirePermission('payments.refund.pay')
  @ApiContract({ summary: 'Pay out an approved refund from your open shift: gives the next RF number', params: idParamsSchema, body: payRefundSchema, response: refundSchema })
  pay(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ValidBody() body: PayRefund, @ReqMeta() meta: RequestMeta): Promise<Refund> {
    return this.approvals.payRefund(auth, params.id, body, meta);
  }
}

@Controller('void-requests')
export class VoidRequestsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Post()
  @RequirePermission('payments.receipt.void-request')
  @ApiContract({ summary: 'Ask for a receipt entered by mistake to be voided, while its shift is open', body: requestReceiptVoidSchema, response: approvalRequestSchema })
  request(@CurrentAuth() auth: AuthContext, @ValidBody() body: RequestReceiptVoid, @ReqMeta() meta: RequestMeta): Promise<ApprovalRequest> {
    return this.approvals.requestVoid(auth, body, meta);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('billing.void.approve')
  @ApiContract({ summary: 'Approve a receipt void: its money stops counting', params: idParamsSchema, body: approveRequestSchema, response: approvalRequestSchema })
  approve(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ValidBody() body: ApproveRequest, @ReqMeta() meta: RequestMeta): Promise<ApprovalRequest> {
    return this.approvals.approve(auth, 'receipt_void', params.id, body, meta);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission('billing.void.approve')
  @ApiContract({ summary: 'Reject a receipt void, with a reason', params: idParamsSchema, body: rejectRequestSchema, response: approvalRequestSchema })
  reject(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ValidBody() body: RejectRequest, @ReqMeta() meta: RequestMeta): Promise<ApprovalRequest> {
    return this.approvals.reject(auth, 'receipt_void', params.id, body, meta);
  }
}

@Controller('clearance-requests')
export class ClearanceRequestsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Post()
  @RequirePermission('billing.clearance.grant')
  @ApiContract({
    summary: 'Ask the MD to clear a discharge while money is still due; everything else must be settled',
    body: requestClearanceDuesSchema,
    response: approvalRequestSchema,
  })
  request(@CurrentAuth() auth: AuthContext, @ValidBody() body: RequestClearanceDues, @ReqMeta() meta: RequestMeta): Promise<ApprovalRequest> {
    return this.approvals.requestClearanceDues(auth, body, meta);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('billing.clearance.approve-dues')
  @ApiContract({ summary: 'Approve: billing clearance is given for what is due now', params: idParamsSchema, body: approveRequestSchema, response: approvalRequestSchema })
  approve(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ValidBody() body: ApproveRequest, @ReqMeta() meta: RequestMeta): Promise<ApprovalRequest> {
    return this.approvals.approve(auth, 'clearance_dues', params.id, body, meta);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermission('billing.clearance.approve-dues')
  @ApiContract({ summary: 'Reject a clearance with dues, with a reason', params: idParamsSchema, body: rejectRequestSchema, response: approvalRequestSchema })
  reject(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ValidBody() body: RejectRequest, @ReqMeta() meta: RequestMeta): Promise<ApprovalRequest> {
    return this.approvals.reject(auth, 'clearance_dues', params.id, body, meta);
  }
}

/** Every kind of request, for the approvals inbox and for showing what is waiting on a bill. */
@Controller('approval-requests')
export class ApprovalRequestsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  @RequirePermission('billing.account.read')
  @ApiContract({ summary: 'Approval requests, newest first. Filter by status, kind, patient or bill', query: approvalListQuerySchema, response: approvalListSchema })
  list(@CurrentAuth() auth: AuthContext, @ValidQuery() query: ApprovalListQuery): Promise<Paginated<ApprovalRequest>> {
    return this.approvals.list(auth, query);
  }

  @Get(':id')
  @RequirePermission('billing.account.read')
  @ApiContract({ summary: 'One approval request', params: idParamsSchema, response: approvalRequestSchema })
  get(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }): Promise<ApprovalRequest> {
    return this.approvals.get(auth, params.id);
  }
}

/** Credit notes and refunds as printed documents. */
@Controller()
export class AdjustmentDocumentsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get('credit-notes/:id')
  @RequirePermission('billing.account.read')
  @ApiContract({ summary: 'A credit note, for printing (audited)', params: idParamsSchema, response: creditNoteSchema })
  creditNote(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ReqMeta() meta: RequestMeta): Promise<CreditNote> {
    return this.approvals.getCreditNote(auth, params.id, meta);
  }

  @Get('refunds/:id')
  @RequirePermission('billing.account.read')
  @ApiContract({ summary: 'A refund, for printing (audited)', params: idParamsSchema, response: refundSchema })
  refund(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ReqMeta() meta: RequestMeta): Promise<Refund> {
    return this.approvals.getRefund(auth, params.id, meta);
  }
}
