import { Module, type OnModuleInit } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { JobsService } from '../jobs/jobs.service.js';
import { NumberingModule } from '../numbering/numbering.module.js';
import { IpdChargesService } from './ipd-charges.service.js';
import { AdmissionsController, BedBoardController } from './ipd.controller.js';
import { IpdRepository } from './ipd.repository.js';
import { IpdService } from './ipd.service.js';

/** IPD: admissions, beds and transfers, and the room and nursing charges posted each midnight. */
@Module({
  imports: [BillingModule, NumberingModule, JobsModule],
  controllers: [AdmissionsController, BedBoardController],
  providers: [IpdService, IpdChargesService, IpdRepository],
  exports: [IpdService, IpdChargesService, IpdRepository],
})
export class IpdModule implements OnModuleInit {
  constructor(
    private readonly jobs: JobsService,
    private readonly charges: IpdChargesService,
  ) {}

  onModuleInit(): void {
    // Five minutes after midnight IST, for the day that just ended (docs/billing-rules.md).
    this.jobs.register({
      name: 'ipd-midnight-charges',
      cron: '5 0 * * *',
      run: async () => {
        await this.charges.postDue(new Date());
      },
    });
  }
}
