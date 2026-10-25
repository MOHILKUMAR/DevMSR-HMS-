import { Inject, Injectable, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { describePlan, isInSync, planRoleSync } from '../../auth/role-sync.js';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { databaseRoleProblems } from './database-role-check.js';

/**
 * Database checks at start-up. In production the API refuses to start when it connects as a role
 * that could change audit rows or the schema, or when the seeded roles differ from the permission
 * matrix (run `pnpm db:sync-roles` first). Elsewhere a stale matrix is only a warning.
 */
@Injectable()
export class StartupChecks implements OnApplicationBootstrap {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    @InjectPinoLogger(StartupChecks.name) private readonly logger: PinoLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.env.APP_ENV !== 'production') {
      await this.warnAboutRoles();
      return;
    }
    // In production any error here, an unreachable database included, stops the start.
    const problems = await databaseRoleProblems(this.prisma);
    const plan = await planRoleSync(this.prisma);
    if (!isInSync(plan)) {
      problems.push(`Seeded roles differ from the permission matrix. Run pnpm db:sync-roles --apply:\n  ${describePlan(plan).join('\n  ')}`);
    }
    if (problems.length > 0) {
      throw new Error(`Refusing to start in production:\n- ${problems.join('\n- ')}`);
    }
  }

  /** Outside production the API also starts without a database (the OpenAPI generator does), so this never throws. */
  private async warnAboutRoles(): Promise<void> {
    try {
      const plan = await planRoleSync(this.prisma);
      if (!isInSync(plan)) {
        this.logger.warn({ roleSync: describePlan(plan) }, 'Seeded roles differ from the permission matrix. Run pnpm db:sync-roles --apply');
      }
    } catch (error) {
      this.logger.warn({ err: error }, 'Could not compare seeded roles with the permission matrix');
    }
  }
}

@Module({ providers: [StartupChecks] })
export class StartupChecksModule {}
