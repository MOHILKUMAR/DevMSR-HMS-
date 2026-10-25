import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { BreakGlassController } from './break-glass.controller.js';
import { BreakGlassRepository } from './break-glass.repository.js';
import { BreakGlassService } from './break-glass.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [BreakGlassController],
  providers: [BreakGlassService, BreakGlassRepository],
})
export class BreakGlassModule {}
