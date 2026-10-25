import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';

@Injectable()
export class HealthRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Touches no table, so no hospital filter applies. */
  async ping(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}
