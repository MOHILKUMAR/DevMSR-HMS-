import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { Paginated } from '@devmsr/types';
import {
  idParamsSchema,
  markAllReadResponseSchema,
  notificationListQuerySchema,
  notificationListSchema,
  unreadCountSchema,
  type MarkAllReadResponse,
  type Notification,
  type NotificationListQuery,
  type UnreadCount,
} from '@devmsr/validation';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth, RequirePermission } from '../auth/decorators.js';
import { ApiContract, ValidParams, ValidQuery } from '../common/contract/api-contract.js';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @RequirePermission('notifications.notification.read-own')
  @ApiContract({ summary: 'Your own notifications, newest first; ?unread=true for unread only', query: notificationListQuerySchema, response: notificationListSchema })
  list(@CurrentAuth() auth: AuthContext, @ValidQuery() query: NotificationListQuery): Promise<Paginated<Notification>> {
    return this.notifications.list(auth, query);
  }

  @Get('unread-count')
  @RequirePermission('notifications.notification.read-own')
  @ApiContract({ summary: 'How many of your notifications are unread, for the top bar', response: unreadCountSchema })
  unreadCount(@CurrentAuth() auth: AuthContext): Promise<UnreadCount> {
    return this.notifications.unreadCount(auth);
  }

  @Post('read-all')
  @RequirePermission('notifications.notification.read-own')
  @HttpCode(200)
  @ApiContract({ summary: 'Mark all your notifications read', response: markAllReadResponseSchema })
  markAllRead(@CurrentAuth() auth: AuthContext): Promise<MarkAllReadResponse> {
    return this.notifications.markAllRead(auth);
  }

  @Post(':id/read')
  @RequirePermission('notifications.notification.read-own')
  @HttpCode(204)
  @ApiContract({ summary: 'Mark one of your notifications read', params: idParamsSchema })
  markRead(@CurrentAuth() auth: AuthContext, @ValidParams() params: { id: string }): Promise<void> {
    return this.notifications.markRead(auth, params.id);
  }
}
