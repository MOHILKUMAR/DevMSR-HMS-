import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { NumberingModule } from '../numbering/numbering.module.js';
import { CashShiftsController, PaymentsController } from './payments.controller.js';
import { PaymentsRepository } from './payments.repository.js';
import { PaymentsService } from './payments.service.js';

/** Cash shifts, receipts, deposits, and setting money against bills. */
@Module({
  imports: [BillingModule, NumberingModule],
  controllers: [CashShiftsController, PaymentsController],
  providers: [PaymentsService, PaymentsRepository],
})
export class PaymentsModule {}
