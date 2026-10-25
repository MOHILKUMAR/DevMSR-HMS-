import { Module } from '@nestjs/common';
import { NumberingModule } from '../numbering/numbering.module.js';
import { PatientsController } from './patients.controller.js';
import { PatientsRepository } from './patients.repository.js';
import { PatientsService } from './patients.service.js';

/** Patient registration, search and records. */
@Module({
  imports: [NumberingModule],
  controllers: [PatientsController],
  providers: [PatientsService, PatientsRepository],
  exports: [PatientsService],
})
export class PatientsModule {}
