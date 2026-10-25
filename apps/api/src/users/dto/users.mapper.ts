import type { Role, StaffUser } from '@devmsr/validation';
import type { RoleRow, StaffUserRow } from '../users.repository.js';

export function toStaffUser(row: StaffUserRow, now: Date = new Date()): StaffUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    isActive: row.isActive,
    locked: row.lockedUntil !== null && row.lockedUntil > now,
    mustChangePassword: row.mustChangePassword,
    twoFactorEnabled: row.totpEnabledAt !== null,
    roles: row.userRoles.map(({ role }) => role).sort((a, b) => a.name.localeCompare(b.name)),
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toRole(row: RoleRow): Role {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isSystem: row.isSystem,
    permissions: row.rolePermissions.map(({ permission }) => permission.code).sort(),
  };
}
