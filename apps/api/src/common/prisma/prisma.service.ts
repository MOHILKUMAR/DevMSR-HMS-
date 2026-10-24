import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { PrismaClient } from '../../generated/prisma/client.js';
import { prismaAdapter } from './create-prisma-client.js';

/** The only database client. Only repositories use it, and they always filter by hospital_id. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({ adapter: prismaAdapter(env.DATABASE_URL) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
