import type { PrismaClient } from '../../generated/prisma/client.js';

interface RoleFacts {
  privileged: boolean;
  owned_tables: number;
  can_create: boolean;
  can_change_audit: boolean;
  can_change_logins: boolean;
}

/**
 * What is wrong with the database user the API connected as, for production start-up. The API must
 * run as a user that owns no table (owners can switch triggers off), cannot create objects and
 * cannot change audit rows. Migrations run as the owner through DIRECT_URL instead.
 */
export async function databaseRoleProblems(db: Pick<PrismaClient, '$queryRaw'>): Promise<string[]> {
  const [facts] = await db.$queryRaw<RoleFacts[]>`
    SELECT
      (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user) AS privileged,
      (SELECT count(*)::int FROM pg_tables
        WHERE schemaname = 'public' AND pg_has_role(current_user, tableowner, 'USAGE')) AS owned_tables,
      has_schema_privilege(current_user, 'public', 'CREATE') AS can_create,
      has_table_privilege(current_user, 'audit_events', 'UPDATE, DELETE, TRUNCATE') AS can_change_audit,
      has_table_privilege(current_user, 'login_events', 'UPDATE, DELETE, TRUNCATE') AS can_change_logins`;
  if (facts === undefined) return ['could not read the database role'];

  const problems: string[] = [];
  if (facts.privileged) problems.push('DATABASE_URL connects as a superuser or a role that bypasses row security');
  if (facts.owned_tables > 0) problems.push(`DATABASE_URL connects as the owner of ${facts.owned_tables} tables; use a member of hms_api`);
  if (facts.can_create) problems.push('DATABASE_URL can create objects in the public schema');
  if (facts.can_change_audit || facts.can_change_logins) problems.push('DATABASE_URL can change or delete audit rows');
  return problems;
}
