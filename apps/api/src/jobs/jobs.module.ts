import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service.js';

/** Scheduled background jobs (pg-boss). Feature modules register their jobs with JobsService. */
@Module({
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
