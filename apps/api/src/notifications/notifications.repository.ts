import { Injectable } from '@nestjs/common';
import type { NotificationKind, Prisma } from '../generated/prisma/client.js';
import { pageArgs, type PageRequest } from '../common/http/pagination.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Tx } from '../common/prisma/tx.js';

/** A notification's owner. Notifications are always read through their recipient. */
export interface Recipient {
  userId: string;
  hospitalId: string | null;
}

const NOTIFICATION_SELECT = { id: true, kind: true, metadata: true, createdAt: true, readAt: true } as const satisfies Prisma.NotificationSelect;

export type NotificationRow = Prisma.NotificationGetPayload<{ select: typeof NOTIFICATION_SELECT }>;

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(owner: Recipient, unreadOnly: boolean, page: PageRequest): Promise<{ rows: NotificationRow[]; total: number }> {
    const where: Prisma.NotificationWhereInput = { ...owner, ...(unreadOnly ? { readAt: null } : {}) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({ where, select: NOTIFICATION_SELECT, orderBy: { createdAt: 'desc' }, ...pageArgs(page) }),
      this.prisma.notification.count({ where }),
    ]);
    return { rows, total };
  }

  countUnread(owner: Recipient): Promise<number> {
    return this.prisma.notification.count({ where: { ...owner, readAt: null } });
  }

  /** Counts 1 only for the owner's own unread notification. */
  async markRead(owner: Recipient, id: string, at: Date): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({ where: { ...owner, id, readAt: null }, data: { readAt: at } });
    return count;
  }

  async exists(owner: Recipient, id: string): Promise<boolean> {
    return (await this.prisma.notification.count({ where: { ...owner, id } })) === 1;
  }

  async markAllRead(owner: Recipient, at: Date): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({ where: { ...owner, readAt: null }, data: { readAt: at } });
    return count;
  }

  /**
   * Active users of a hospital (or, with null, of the platform) whose own roles there hold a
   * permission code. Code checks permission codes, never role names.
   */
  async holdersOf(hospitalId: string | null, permission: string, tx: Tx): Promise<Recipient[]> {
    const rows = await tx.user.findMany({
      where: {
        hospitalId,
        isActive: true,
        userRoles: { some: { role: { hospitalId, rolePermissions: { some: { permission: { code: permission } } } } } },
      },
      select: { id: true, hospitalId: true },
    });
    return rows.map((row) => ({ userId: row.id, hospitalId: row.hospitalId }));
  }

  async createMany(recipients: readonly Recipient[], kind: NotificationKind, metadata: Prisma.InputJsonObject, at: Date, tx: Tx): Promise<void> {
    if (recipients.length === 0) return;
    await tx.notification.createMany({ data: recipients.map((recipient) => ({ ...recipient, kind, metadata, createdAt: at })) });
  }
}
