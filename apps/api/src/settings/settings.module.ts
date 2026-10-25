import { Module } from '@nestjs/common';
import { DepartmentsController, DoctorsController, HospitalProfileController } from './settings.controller.js';
import { SettingsRepository } from './settings.repository.js';
import { SettingsService } from './settings.service.js';

/** Hospital details, departments and doctors: the masters every other module reads. */
@Module({
  controllers: [HospitalProfileController, DepartmentsController, DoctorsController],
  providers: [SettingsService, SettingsRepository],
})
export class SettingsModule {}
