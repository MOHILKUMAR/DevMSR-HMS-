import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsRepository } from './notifications.repository.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsRepository],
  // Break-glass access and sign-in alerts notify admins.
  exports: [NotificationsService],
})
export class NotificationsModule {}
