import type { PrismaClient } from '../generated/prisma/client.js';
import type { Tx } from '../common/prisma/tx.js';
import { PERMISSIONS, ROLES, type RoleCode, type RoleDefinition } from './permission-matrix.js';

type Db = PrismaClient | Tx;
export type PermissionIds = ReadonlyMap<string, string>;

/** Inserts any permission codes missing from the database. Safe to run concurrently. */
export async function syncPermissions(db: Db): Promise<PermissionIds> {
  await db.permission.createMany({
    data: Object.entries(PERMISSIONS).map(([code, description]) => ({ code, description })),
    skipDuplicates: true,
  });
  const rows = await db.permission.findMany({ select: { id: true, code: true } });
  return new Map(rows.map((row) => [row.code, row.id]));
}

/** Makes a system role hold exactly the permissions the matrix gives it. */
async function syncGrants(db: Db, roleId: string, role: RoleDefinition, permissionIds: PermissionIds): Promise<void> {
  const ids = role.permissions.map((code) => {
    const id = permissionIds.get(code);
    if (id === undefined) throw new Error(`Permission ${code} is not in the database`);
    return id;
  });
  await db.rolePermission.deleteMany({ where: { roleId, permissionId: { notIn: ids } } });
  await db.rolePermission.createMany({ data: ids.map((permissionId) => ({ roleId, permissionId })), skipDuplicates: true });
}

/** Creates or updates the seeded hospital roles for one hospital. */
export async function syncHospitalRoles(db: Db, hospitalId: string, permissionIds: PermissionIds): Promise<Map<RoleCode, string>> {
  const roleIds = new Map<RoleCode, string>();
  for (const [code, role] of Object.entries(ROLES) as [RoleCode, RoleDefinition][]) {
    if (role.scope !== 'hospital') continue;
    const { id } = await db.role.upsert({
      where: { hospitalId_code: { hospitalId, code } },
      create: { hospitalId, code, name: role.name, isSystem: true },
      update: { name: role.name, isSystem: true },
      select: { id: true },
    });
    await syncGrants(db, id, role, permissionIds);
    roleIds.set(code, id);
  }
  return roleIds;
}

/** Creates or updates the platform roles (no hospital). Safe to run concurrently. */
export async function syncPlatformRoles(db: Db, permissionIds: PermissionIds): Promise<Map<RoleCode, string>> {
  const roleIds = new Map<RoleCode, string>();
  for (const [code, role] of Object.entries(ROLES) as [RoleCode, RoleDefinition][]) {
    if (role.scope !== 'platform') continue;
    // ON CONFLICT DO NOTHING against the partial unique index on platform role codes.
    await db.role.createMany({ data: [{ hospitalId: null, code, name: role.name, isSystem: true }], skipDuplicates: true });
    const { id } = await db.role.findFirstOrThrow({ where: { hospitalId: null, code }, select: { id: true } });
    await syncGrants(db, id, role, permissionIds);
    roleIds.set(code, id);
  }
  return roleIds;
}
