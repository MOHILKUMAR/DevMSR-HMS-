import { Global, Module } from '@nestjs/common';
import { IdempotencyRepository } from './idempotency.repository.js';

@Global()
@Module({
  providers: [IdempotencyRepository],
  exports: [IdempotencyRepository],
})
export class IdempotencyModule {}
