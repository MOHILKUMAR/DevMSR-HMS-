import { Injectable } from '@nestjs/common';
import type { Paginated } from '@devmsr/types';
import type { MarkAllReadResponse, Notification, NotificationListQuery, UnreadCount } from '@devmsr/validation';
import type { AuthContext } from '../auth/auth-context.js';
import { Errors } from '../common/errors/app-error.js';
import { paged } from '../common/http/pagination.js';
import type { Tx } from '../common/prisma/tx.js';
import type { NotificationKind } from '../generated/prisma/client.js';
import { NotificationsRepository, type NotificationRow, type Recipient } from './notifications.repository.js';

/** Flat facts only: IDs, staff names, counts and times. Never patient data. */
export type NotificationDetails = Record<string, string | number | boolean | null>;

function toNotification(row: NotificationRow): Notification {
  const metadata = row.metadata;
  const details: NotificationDetails = {};
  if (typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)) {
    for (const [key, value] of Object.entries(metadata)) {
      if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') details[key] = value;
    }
  }
  return {
    id: row.id,
    kind: row.kind,
    details,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  };
}

/**
 * In-app notifications. Each user sees only their own, from their own hospital, even during
 * break-glass access to another one. Sending by email or SMS comes later through the outbox.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly notifications: NotificationsRepository) {}

  async list(auth: AuthContext, query: NotificationListQuery): Promise<Paginated<Notification>> {
    const { rows, total } = await this.notifications.list(this.owner(auth), query.unread === true, query);
    return paged(rows.map(toNotification), total, query);
  }

  async unreadCount(auth: AuthContext): Promise<UnreadCount> {
    return { unread: await this.notifications.countUnread(this.owner(auth)) };
  }

  /** Reading one twice is fine; someone else's is a 404. */
  async markRead(auth: AuthContext, id: string, now: Date = new Date()): Promise<void> {
    if ((await this.notifications.markRead(this.owner(auth), id, now)) === 0 && !(await this.notifications.exists(this.owner(auth), id))) {
      throw Errors.notFound('notification');
    }
  }

  async markAllRead(auth: AuthContext, now: Date = new Date()): Promise<MarkAllReadResponse> {
    return { updated: await this.notifications.markAllRead(this.owner(auth), now) };
  }

  /** Notifies everyone in a hospital (or on the platform, with null) who holds a permission code. */
  async notifyHolders(
    hospitalId: string | null,
    permission: string,
    kind: NotificationKind,
    details: NotificationDetails,
    now: Date,
    tx: Tx,
  ): Promise<number> {
    const recipients: Recipient[] = await this.notifications.holdersOf(hospitalId, permission, tx);
    await this.notifications.createMany(recipients, kind, details, now, tx);
    return recipients.length;
  }

  private owner(auth: AuthContext): Recipient {
    return { userId: auth.userId, hospitalId: auth.userHospitalId };
  }
}
