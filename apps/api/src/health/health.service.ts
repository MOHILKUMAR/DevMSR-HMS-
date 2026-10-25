import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@devmsr/validation';
import { HealthRepository } from './health.repository.js';

@Injectable()
export class HealthService {
  constructor(private readonly repository: HealthRepository) {}

  /** Healthy only when the database answers, so Docker restarts a container that lost it. */
  async check(): Promise<HealthResponse> {
    await this.repository.ping();
    return { status: 'ok' };
  }
}
