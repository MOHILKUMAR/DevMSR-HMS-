import { Injectable } from '@nestjs/common';
import type { HealthStatusDto } from './dto/health-status.dto.js';

@Injectable()
export class HealthService {
  check(): HealthStatusDto {
    return { status: 'ok' };
  }
}
