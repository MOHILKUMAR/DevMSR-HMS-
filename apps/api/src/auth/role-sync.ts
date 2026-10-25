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

/** One seeded role whose grants or name differ from the permission matrix. */
export interface RoleDifference {
  hospitalId: string | null;
  /** Null for platform roles. */
  hospitalCode: string | null;
  roleCode: RoleCode;
  /** Null when the role does not exist yet. */
  roleId: string | null;
  added: string[];
  removed: string[];
  renamed: boolean;
}

export interface RoleSyncPlan {
  /** Matrix codes not yet in the permissions table. */
  missingPermissions: string[];
  /** Codes in the table that the matrix no longer has. Reported only: custom roles may still hold them. */
  unknownPermissions: string[];
  roles: RoleDifference[];
}

export function isInSync(plan: RoleSyncPlan): boolean {
  return plan.missingPermissions.length === 0 && plan.roles.length === 0;
}

/**
 * Compares the seeded (system) roles of every hospital and the platform with the permission matrix.
 * Read only. Custom roles made by a hospital admin are never compared or changed.
 */
export async function planRoleSync(db: Db): Promise<RoleSyncPlan> {
  const [permissions, hospitals, systemRoles] = await Promise.all([
    db.permission.findMany({ select: { code: true } }),
    db.hospital.findMany({ select: { id: true, code: true }, orderBy: { code: 'asc' } }),
    db.role.findMany({
      where: { isSystem: true },
      select: { id: true, hospitalId: true, code: true, name: true, rolePermissions: { select: { permission: { select: { code: true } } } } },
    }),
  ]);
  const known = new Set(permissions.map((row) => row.code));
  const byKey = new Map(systemRoles.map((role) => [`${role.hospitalId ?? 'platform'}|${role.code}`, role]));

  const roles: RoleDifference[] = [];
  const compare = (hospital: { id: string; code: string } | null, code: RoleCode, definition: RoleDefinition): void => {
    const existing = byKey.get(`${hospital?.id ?? 'platform'}|${code}`);
    const held = new Set(existing?.rolePermissions.map((grant) => grant.permission.code) ?? []);
    const wanted = new Set<string>(definition.permissions);
    const added = [...wanted].filter((permission) => !held.has(permission)).sort();
    const removed = [...held].filter((permission) => !wanted.has(permission)).sort();
    const renamed = existing !== undefined && existing.name !== definition.name;
    if (existing === undefined || added.length > 0 || removed.length > 0 || renamed) {
      roles.push({ hospitalId: hospital?.id ?? null, hospitalCode: hospital?.code ?? null, roleCode: code, roleId: existing?.id ?? null, added, removed, renamed });
    }
  };
  for (const [code, definition] of Object.entries(ROLES) as [RoleCode, RoleDefinition][]) {
    if (definition.scope === 'platform') compare(null, code, definition);
  }
  for (const hospital of hospitals) {
    for (const [code, definition] of Object.entries(ROLES) as [RoleCode, RoleDefinition][]) {
      if (definition.scope === 'hospital') compare(hospital, code, definition);
    }
  }

  return {
    missingPermissions: Object.keys(PERMISSIONS)
      .filter((code) => !known.has(code))
      .sort(),
    unknownPermissions: [...known].filter((code) => !Object.hasOwn(PERMISSIONS, code)).sort(),
    roles,
  };
}

/**
 * Brings every hospital's seeded roles and the platform roles in line with the matrix, and writes one
 * audit event per changed role. Runs in the caller's transaction, under an advisory lock so two runs
 * never interleave. Returns the plan that was applied.
 */
export async function applyRoleSync(tx: Tx, now: Date = new Date()): Promise<RoleSyncPlan> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('hms.role-sync'))`;
  const plan = await planRoleSync(tx);
  if (isInSync(plan)) return plan;

  const permissionIds = await syncPermissions(tx);
  const platformRoleIds = await syncPlatformRoles(tx, permissionIds);
  const hospitalRoleIds = new Map<string, Map<RoleCode, string>>();
  for (const hospitalId of new Set(plan.roles.flatMap((role) => (role.hospitalId === null ? [] : [role.hospitalId])))) {
    hospitalRoleIds.set(hospitalId, await syncHospitalRoles(tx, hospitalId, permissionIds));
  }

  await tx.auditEvent.createMany({
    data: plan.roles.map((role) => ({
      action: 'auth.role.synced',
      hospitalId: role.hospitalId,
      actorUserId: null,
      entityType: 'role',
      entityId: role.hospitalId === null ? platformRoleIds.get(role.roleCode) : hospitalRoleIds.get(role.hospitalId)?.get(role.roleCode),
      metadata: { roleCode: role.roleCode, created: role.roleId === null, added: role.added, removed: role.removed },
      createdAt: now,
    })),
  });
  return plan;
}

/** Plain text summary for the CLI and start-up logs. Codes and role names only. */
export function describePlan(plan: RoleSyncPlan): string[] {
  const lines: string[] = [];
  if (plan.missingPermissions.length > 0) lines.push(`New permission codes: ${plan.missingPermissions.join(', ')}`);
  for (const role of plan.roles) {
    const where = role.hospitalCode === null ? 'platform' : `hospital ${role.hospitalCode}`;
    const parts = [
      role.roleId === null ? 'create role' : null,
      role.added.length > 0 ? `grant ${role.added.join(', ')}` : null,
      role.removed.length > 0 ? `revoke ${role.removed.join(', ')}` : null,
      role.renamed ? 'rename' : null,
    ].filter((part) => part !== null);
    lines.push(`${where}, ${role.roleCode}: ${parts.join('; ')}`);
  }
  if (plan.unknownPermissions.length > 0) {
    lines.push(`Codes no longer in the matrix (left in place for custom roles): ${plan.unknownPermissions.join(', ')}`);
  }
  return lines;
}
