// Creates (or resets the password of) the database login the API uses, as a member of the restricted
// hms_api role from the migrations. Run once per environment after `pnpm db:deploy`:
//   pnpm db:api-user
// It connects as the owner through DIRECT_URL, and takes the login's name and password from
// DATABASE_URL, so the password is typed into the environment once and never printed.

import { createPrismaClient } from '../common/prisma/create-prisma-client.js';
import { loadCliEnv, print, requiredEnv } from './cli-env.js';

loadCliEnv();
const owner = new URL(requiredEnv('DIRECT_URL'));
const api = new URL(requiredEnv('DATABASE_URL'));
const user = decodeURIComponent(api.username);
const password = decodeURIComponent(api.password);

if (user === decodeURIComponent(owner.username)) {
  throw new Error('DATABASE_URL uses the same user as DIRECT_URL. Give the API its own user, for example hms_app.');
}
if (!/^[a-z_][a-z0-9_]{0,62}$/.test(user)) {
  throw new Error('The DATABASE_URL user must be lowercase letters, digits and underscores.');
}
if (password.length < 16) {
  throw new Error('The DATABASE_URL password must be at least 16 characters.');
}

const prisma = createPrismaClient(owner.toString());
try {
  const [group] = await prisma.$queryRaw<{ exists: boolean }[]>`SELECT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hms_api') AS exists`;
  if (group?.exists !== true) {
    throw new Error('The hms_api role does not exist yet. Run pnpm db:deploy first.');
  }
  const [existing] = await prisma.$queryRaw<{ exists: boolean }[]>`SELECT EXISTS (SELECT FROM pg_roles WHERE rolname = ${user}) AS exists`;
  const verb = existing?.exists === true ? 'ALTER' : 'CREATE';
  // Role statements take no bind parameters, so format() quotes the name and password server side.
  const [statements] = await prisma.$queryRaw<{ role_sql: string; grant_sql: string }[]>`
    SELECT format(${`${verb} ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L`}, ${user}::text, ${password}::text) AS role_sql,
           format('GRANT hms_api TO %I', ${user}::text) AS grant_sql`;
  if (statements === undefined) throw new Error('Could not build the role statements');
  await prisma.$transaction([prisma.$executeRawUnsafe(statements.role_sql), prisma.$executeRawUnsafe(statements.grant_sql)]);
  print(`${verb === 'ALTER' ? 'Updated' : 'Created'} database login ${user} as a member of hms_api.`);
} finally {
  await prisma.$disconnect();
}
