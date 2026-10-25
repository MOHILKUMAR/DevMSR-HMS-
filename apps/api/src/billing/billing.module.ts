import { Module } from '@nestjs/common';
import { NumberingModule } from '../numbering/numbering.module.js';
import { InvoicesController, PatientBillingController } from './billing.controller.js';
import { BillingRepository } from './billing.repository.js';
import { BillingService } from './billing.service.js';

/** Charges and bills: posting, drafting, issuing and the patient's account. */
@Module({
  imports: [NumberingModule],
  controllers: [PatientBillingController, InvoicesController],
  providers: [BillingService, BillingRepository],
  exports: [BillingService, BillingRepository],
})
export class BillingModule {}
