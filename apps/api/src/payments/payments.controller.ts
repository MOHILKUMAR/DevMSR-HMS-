import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { Paginated } from '@devmsr/types';
import {
  applyDepositSchema,
  closeShiftSchema,
  currentShiftSchema,
  idParamsSchema,
  invoiceSchema,
  openShiftSchema,
  paginationQuerySchema,
  receiptSchema,
  shiftListSchema,
  shiftSchema,
  takeDepositSchema,
  takePaymentSchema,
  type ApplyDeposit,
  type CloseShift,
  type Invoice,
  type OpenShift,
  type PaginationQuery,
  type Receipt,
  type Shift,
  type TakeDeposit,
  type TakePayment,
} from '@devmsr/validation';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth, RequirePermission } from '../auth/decorators.js';
import { ApiContract, ValidBody, ValidParams, ValidQuery } from '../common/contract/api-contract.js';
import { ReqMeta, type RequestMeta } from '../common/http/app-request.js';
import { Idempotent } from '../common/idempotency/idempotent.decorator.js';
import { PaymentsService } from './payments.service.js';

/** A cashier's own shift; finance sees every shift. */
@Controller('cash-shifts')
export class CashShiftsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @RequirePermission('payments.shift.manage-own')
  @ApiContract({ summary: 'Open your cash shift with the opening cash', body: openShiftSchema, response: shiftSchema })
  open(@CurrentAuth() auth: AuthContext, @ValidBody() body: OpenShift, @ReqMeta() meta: RequestMeta): Promise<Shift> {
    return this.payments.openShift(auth, body, meta);
  }

  @Get('current')
  @RequirePermission('payments.shift.manage-own')
  @ApiContract({ summary: 'Your open shift with its takings so far, or null', response: currentShiftSchema })
  current(@CurrentAuth() auth: AuthContext): Promise<{ shift: Shift | null }> {
    return this.payments.currentShift(auth);
  }

  @Post(':id/close')
  @HttpCode(200)
  @RequirePermission('payments.shift.manage-own')
  @ApiContract({ summary: 'Close your shift with the counted cash; a difference needs a reason', params: idParamsSchema, body: closeShiftSchema, response: shiftSchema })
  close(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ValidBody() body: CloseShift, @ReqMeta() meta: RequestMeta): Promise<Shift> {
    return this.payments.closeShift(auth, params.id, body, meta);
  }

  @Get()
  @RequirePermission('reports.collection.read')
  @ApiContract({ summary: 'Every cashier shift, newest first, with takings and differences', query: paginationQuerySchema, response: shiftListSchema })
  list(@CurrentAuth() auth: AuthContext, @ValidQuery() query: PaginationQuery): Promise<Paginated<Shift>> {
    return this.payments.listShifts(auth, query);
  }
}

/** Money in: bill payments, deposits, and deposits set against bills. */
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('payments')
  @Idempotent()
  @RequirePermission('payments.receipt.create')
  @ApiContract({ summary: 'Take a payment against an issued bill, up to what is due', body: takePaymentSchema, response: receiptSchema })
  pay(@CurrentAuth() auth: AuthContext, @ValidBody() body: TakePayment, @ReqMeta() meta: RequestMeta): Promise<Receipt> {
    return this.payments.takePayment(auth, body, meta);
  }

  @Post('deposits')
  @Idempotent()
  @RequirePermission('payments.deposit.create')
  @ApiContract({ summary: 'Take an advance deposit, held for the patient', body: takeDepositSchema, response: receiptSchema })
  deposit(@CurrentAuth() auth: AuthContext, @ValidBody() body: TakeDeposit, @ReqMeta() meta: RequestMeta): Promise<Receipt> {
    return this.payments.takeDeposit(auth, body, meta);
  }

  @Post('invoices/:id/apply-deposit')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('payments.receipt.create')
  @ApiContract({ summary: 'Set held deposit against an issued bill, oldest deposit first', params: idParamsSchema, body: applyDepositSchema, response: invoiceSchema })
  applyDeposit(
    @CurrentAuth() auth: AuthContext,
    @ValidParams() params: { id: string },
    @ValidBody() body: ApplyDeposit,
    @ReqMeta() meta: RequestMeta,
  ): Promise<Invoice> {
    return this.payments.applyDeposit(auth, params.id, body, meta);
  }

  @Get('receipts/:id')
  @RequirePermission('billing.account.read')
  @ApiContract({ summary: 'A receipt, for printing (audited)', params: idParamsSchema, response: receiptSchema })
  receipt(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }, @ReqMeta() meta: RequestMeta): Promise<Receipt> {
    return this.payments.getReceipt(auth, params.id, meta);
  }
}
