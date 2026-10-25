import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { IpdModule } from '../ipd/ipd.module.js';
import { DischargesController } from './discharge.controller.js';
import { DischargeRepository } from './discharge.repository.js';
import { DischargeService } from './discharge.service.js';

/** Discharge: fit for discharge, the final bill, billing clearance, the summary and completion. */
@Module({
  imports: [BillingModule, IpdModule],
  controllers: [DischargesController],
  providers: [DischargeService, DischargeRepository],
  exports: [DischargeService],
})
export class DischargeModule {}
