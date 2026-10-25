// Creates (or resets the password of) the database logins the API uses. Run once per environment
// after `pnpm db:deploy`:
//   pnpm db:api-user
// It connects as the owner through DIRECT_URL, and takes each login's name and password from its own
// connection string, so passwords are typed into the environment once and never printed:
// - DATABASE_URL: the API's login, a member of the restricted hms_api role from the migrations.
// - JOBS_DATABASE_URL (when set): the background jobs login, which owns only the pgboss schema where
//   pg-boss keeps its queue tables, and has no access to the hospital's tables.

import { createPrismaClient } from '../common/prisma/create-prisma-client.js';
import { loadCliEnv, print, requiredEnv } from './cli-env.js';

// Enough of a Prisma client or transaction to run raw statements.
type Raw = Pick<ReturnType<typeof createPrismaClient>, '$queryRaw' | '$executeRawUnsafe'>;

loadCliEnv();
const owner = new URL(requiredEnv('DIRECT_URL'));
const ownerUser = decodeURIComponent(owner.username);

/** The login's name and password from a connection string, checked before anything is created. */
function loginFrom(name: string, url: string, suggestion: string): { user: string; password: string } {
  const parsed = new URL(url);
  const user = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  if (user === ownerUser) {
    throw new Error(`${name} uses the same user as DIRECT_URL. Give it its own user, for example ${suggestion}.`);
  }
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(user)) {
    throw new Error(`The ${name} user must be lowercase letters, digits and underscores.`);
  }
  if (password.length < 16) {
    throw new Error(`The ${name} password must be at least 16 characters.`);
  }
  return { user, password };
}

/** CREATE or ALTER a login with no special rights. Returns the verb used. */
async function upsertLogin(prisma: Raw, user: string, password: string): Promise<'CREATE' | 'ALTER'> {
  const [existing] = await prisma.$queryRaw<{ exists: boolean }[]>`SELECT EXISTS (SELECT FROM pg_roles WHERE rolname = ${user}) AS exists`;
  const verb = existing?.exists === true ? 'ALTER' : 'CREATE';
  // Role statements take no bind parameters, so format() quotes the name and password server side.
  const [statement] = await prisma.$queryRaw<{ sql: string }[]>`
    SELECT format(${`${verb} ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L`}, ${user}::text, ${password}::text) AS sql`;
  if (statement === undefined) throw new Error('Could not build the role statement');
  await prisma.$executeRawUnsafe(statement.sql);
  return verb;
}

const api = loginFrom('DATABASE_URL', requiredEnv('DATABASE_URL'), 'hms_app');
const jobsUrl = process.env['JOBS_DATABASE_URL'];
const jobs = jobsUrl === undefined || jobsUrl === '' ? null : loginFrom('JOBS_DATABASE_URL', jobsUrl, 'hms_jobs');
if (jobs !== null && jobs.user === api.user) {
  throw new Error('JOBS_DATABASE_URL uses the same user as DATABASE_URL. Give background jobs their own user, for example hms_jobs.');
}

const prisma = createPrismaClient(owner.toString());
try {
  const [group] = await prisma.$queryRaw<{ exists: boolean }[]>`SELECT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hms_api') AS exists`;
  if (group?.exists !== true) {
    throw new Error('The hms_api role does not exist yet. Run pnpm db:deploy first.');
  }
  await prisma.$transaction(async (tx) => {
    const verb = await upsertLogin(tx, api.user, api.password);
    const [grant] = await tx.$queryRaw<{ sql: string }[]>`SELECT format('GRANT hms_api TO %I', ${api.user}::text) AS sql`;
    if (grant === undefined) throw new Error('Could not build the grant statement');
    await tx.$executeRawUnsafe(grant.sql);
    print(`${verb === 'ALTER' ? 'Updated' : 'Created'} database login ${api.user} as a member of hms_api.`);
  });

  if (jobs !== null) {
    // pg-boss creates its tables at start-up, so its login owns the schema they live in, and nothing else.
    const [schema] = await prisma.$queryRaw<{ owner: string | null }[]>`
      SELECT (SELECT r.rolname FROM pg_namespace n JOIN pg_roles r ON r.oid = n.nspowner WHERE n.nspname = 'pgboss') AS owner`;
    const schemaOwner = schema?.owner ?? null;
    if (schemaOwner !== null && schemaOwner !== jobs.user) {
      throw new Error(
        `The pgboss schema belongs to ${schemaOwner}, not ${jobs.user}. Once no job is waiting, drop it (DROP SCHEMA pgboss CASCADE as the owner) and run this again; pg-boss recreates its tables at start-up.`,
      );
    }
    await prisma.$transaction(async (tx) => {
      const verb = await upsertLogin(tx, jobs.user, jobs.password);
      if (schemaOwner === null) {
        const [create] = await tx.$queryRaw<{ sql: string }[]>`SELECT format('CREATE SCHEMA pgboss AUTHORIZATION %I', ${jobs.user}::text) AS sql`;
        if (create === undefined) throw new Error('Could not build the schema statement');
        await tx.$executeRawUnsafe(create.sql);
      }
      print(`${verb === 'ALTER' ? 'Updated' : 'Created'} database login ${jobs.user}, owner of the pgboss schema.`);
    });
  }
} finally {
  await prisma.$disconnect();
}
