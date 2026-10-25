import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { pageArgs, type PageRequest } from '../common/http/pagination.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import type { Tx } from '../common/prisma/tx.js';

export const STAFF_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  isActive: true,
  lockedUntil: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
  userRoles: { select: { role: { select: { code: true, name: true } } } },
} as const satisfies Prisma.UserSelect;

export type StaffUserRow = Prisma.UserGetPayload<{ select: typeof STAFF_USER_SELECT }>;

export interface StaffUserFilter {
  q?: string | undefined;
  includeInactive?: boolean | undefined;
  permission?: string | undefined;
}

const ROLE_SELECT = {
  id: true,
  code: true,
  name: true,
  isSystem: true,
  rolePermissions: { select: { permission: { select: { code: true } } } },
} as const satisfies Prisma.RoleSelect;

export type RoleRow = Prisma.RoleGetPayload<{ select: typeof ROLE_SELECT }>;

/** Staff users of one hospital. Platform users (super admin) never appear here. */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(hospitalId: string, filter: StaffUserFilter, page: PageRequest): Promise<{ rows: StaffUserRow[]; total: number }> {
    const where: Prisma.UserWhereInput = {
      hospitalId,
      kind: 'staff',
      ...(filter.includeInactive === true ? {} : { isActive: true }),
      ...(filter.q === undefined || filter.q === ''
        ? {}
        : {
            OR: [
              { username: { contains: filter.q.toLowerCase() } },
              { displayName: { contains: filter.q, mode: 'insensitive' } },
            ],
          }),
      ...(filter.permission === undefined
        ? {}
        : { userRoles: { some: { role: { hospitalId, rolePermissions: { some: { permission: { code: filter.permission } } } } } } }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, select: STAFF_USER_SELECT, orderBy: { username: 'asc' }, ...pageArgs(page) }),
      this.prisma.user.count({ where }),
    ]);
    return { rows, total };
  }

  findById(hospitalId: string, id: string, tx?: Tx): Promise<StaffUserRow | null> {
    return (tx ?? this.prisma).user.findFirst({ where: { id, hospitalId, kind: 'staff' }, select: STAFF_USER_SELECT });
  }

  rolesByCodes(hospitalId: string, codes: readonly string[], tx?: Tx): Promise<{ id: string; code: string }[]> {
    return (tx ?? this.prisma).role.findMany({ where: { hospitalId, code: { in: [...codes] } }, select: { id: true, code: true } });
  }

  create(
    data: { hospitalId: string; username: string; displayName: string; passwordHash: string; roleIds: string[] },
    tx: Tx,
  ): Promise<StaffUserRow> {
    return tx.user.create({
      data: {
        hospitalId: data.hospitalId,
        kind: 'staff',
        username: data.username,
        displayName: data.displayName,
        passwordHash: data.passwordHash,
        // The admin chose this password, so the user replaces it at first sign-in.
        mustChangePassword: true,
        userRoles: { create: data.roleIds.map((roleId) => ({ roleId })) },
      },
      select: STAFF_USER_SELECT,
    });
  }

  async update(hospitalId: string, id: string, data: { displayName?: string; isActive?: boolean }, tx: Tx): Promise<void> {
    await tx.user.update({ where: { id, hospitalId }, data, select: { id: true } });
  }

  async replaceRoles(userId: string, roleIds: readonly string[], tx: Tx): Promise<void> {
    await tx.userRole.deleteMany({ where: { userId } });
    await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId, roleId })) });
  }

  /** A new password also unlocks the account, and the user must replace it at the next sign-in. */
  async setPassword(hospitalId: string, id: string, passwordHash: string, now: Date, tx: Tx): Promise<void> {
    await tx.user.update({
      where: { id, hospitalId },
      data: { passwordHash, passwordChangedAt: now, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null },
      select: { id: true },
    });
  }

  roles(hospitalId: string): Promise<RoleRow[]> {
    return this.prisma.role.findMany({ where: { hospitalId }, select: ROLE_SELECT, orderBy: { name: 'asc' } });
  }
}
