import { Module } from '@nestjs/common';
import { TariffsController } from './tariffs.controller.js';
import { TariffsRepository } from './tariffs.repository.js';
import { TariffsService } from './tariffs.service.js';

/** Service items and their dated rates, entered by the hospital's finance team. */
@Module({
  controllers: [TariffsController],
  providers: [TariffsService, TariffsRepository],
  exports: [TariffsService],
})
export class TariffsModule {}
