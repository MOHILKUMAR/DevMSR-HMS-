import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { PgBoss } from 'pg-boss';
import { ENV, type Env } from '../common/config/env.js';

/** A job that runs on a schedule, and once when the API starts so a missed run is caught up. */
export interface ScheduledJob {
  /** pg-boss queue name, for example `ipd-midnight-charges`. */
  name: string;
  /** Cron in IST, for example `5 0 * * *` for 00:05 every day. */
  cron: string;
  run: () => Promise<void>;
}

/**
 * Background jobs on pg-boss (CLAUDE.md section 3). pg-boss keeps its own tables in the `pgboss`
 * schema, through JOBS_DATABASE_URL, a login that owns only that schema (docs/decisions.md). Each job
 * must be safe to run more than once: pg-boss runs a scheduled job once across API instances, but a
 * job can still be retried after a crash.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private readonly jobs: ScheduledJob[] = [];
  private boss: PgBoss | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {}

  /** Called by feature modules while the app starts, before the jobs are scheduled. */
  register(job: ScheduledJob): void {
    this.jobs.push(job);
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.env.JOBS_ENABLED || this.jobs.length === 0) return;
    const boss = new PgBoss({
      connectionString: this.env.JOBS_DATABASE_URL ?? this.env.DATABASE_URL,
      schema: 'pgboss',
      // `pnpm db:api-user` creates the schema for the jobs login, which may not create schemas itself.
      createSchema: this.env.JOBS_DATABASE_URL === undefined,
      application_name: 'hms-jobs',
    });
    boss.on('error', (error: unknown) => {
      this.logger.error(`pg-boss error: ${error instanceof Error ? error.message : String(error)}`);
    });
    await boss.start();
    this.boss = boss;
    for (const job of this.jobs) {
      await boss.createQueue(job.name);
      await boss.schedule(job.name, job.cron, null, { tz: 'Asia/Kolkata' });
      await boss.work(job.name, async () => {
        await job.run();
      });
      // Catch up anything missed while the API was down. The job itself skips work already done.
      await boss.send(job.name);
    }
    this.logger.log(`Scheduled ${String(this.jobs.length)} background job(s)`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss?.stop({ graceful: true });
    this.boss = null;
  }
}
