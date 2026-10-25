import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { DischargeModule } from '../discharge/discharge.module.js';
import { NumberingModule } from '../numbering/numbering.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import {
  AdjustmentDocumentsController,
  ApprovalRequestsController,
  ClearanceRequestsController,
  CreditNoteRequestsController,
  DiscountRequestsController,
  RefundRequestsController,
  VoidRequestsController,
} from './approvals.controller.js';
import { ApprovalsRepository } from './approvals.repository.js';
import { ApprovalsService } from './approvals.service.js';

/** Maker-checker money changes: discounts, credit notes, refunds, receipt voids and clearance with dues. */
@Module({
  imports: [BillingModule, PaymentsModule, NumberingModule, DischargeModule],
  controllers: [
    DiscountRequestsController,
    CreditNoteRequestsController,
    RefundRequestsController,
    VoidRequestsController,
    ClearanceRequestsController,
    ApprovalRequestsController,
    AdjustmentDocumentsController,
  ],
  providers: [ApprovalsService, ApprovalsRepository],
})
export class ApprovalsModule {}
