import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsRepository } from './reports.repository.js';
import { ReportsService } from './reports.service.js';

/** Day-end collection, the Tally day book and basic counts. */
@Module({
  imports: [BillingModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsRepository],
})
export class ReportsModule {}
