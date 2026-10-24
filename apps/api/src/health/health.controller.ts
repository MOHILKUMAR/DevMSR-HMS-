import { Controller, Get } from '@nestjs/common';
import { healthResponseSchema, type HealthResponse } from '@devmsr/validation';
import { Public } from '../auth/decorators.js';
import { ApiContract } from '../common/contract/api-contract.js';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** Reviewed public route: used by the Docker health check and uptime monitoring. Returns no data. */
  @Get()
  @Public()
  @ApiContract({ summary: 'Liveness and database check', response: healthResponseSchema })
  check(): Promise<HealthResponse> {
    return this.healthService.check();
  }
}
