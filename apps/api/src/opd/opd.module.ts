import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { NumberingModule } from '../numbering/numbering.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { OpdController } from './opd.controller.js';
import { OpdRepository } from './opd.repository.js';
import { OpdService } from './opd.service.js';

/** Walk-in OPD: tokens, the consultation fee, the doctor's queue, notes and orders. */
@Module({
  imports: [BillingModule, PaymentsModule, NumberingModule],
  controllers: [OpdController],
  providers: [OpdService, OpdRepository],
})
export class OpdModule {}
