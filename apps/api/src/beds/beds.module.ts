import { Module } from '@nestjs/common';
import { BedsController, RoomCategoriesController, WardsController } from './beds.controller.js';
import { BedsRepository } from './beds.repository.js';
import { BedsService } from './beds.service.js';

/** Room categories, wards and beds. The bed board and assignments come with IPD. */
@Module({
  controllers: [RoomCategoriesController, WardsController, BedsController],
  providers: [BedsService, BedsRepository],
})
export class BedsModule {}
