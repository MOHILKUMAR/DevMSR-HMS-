import { Module } from '@nestjs/common';
import { NumberingRepository } from './numbering.repository.js';
import { NumberingService } from './numbering.service.js';

@Module({
  providers: [NumberingRepository, NumberingService],
  exports: [NumberingService],
})
export class NumberingModule {}
