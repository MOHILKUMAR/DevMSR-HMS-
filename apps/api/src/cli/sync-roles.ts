// Applies permission matrix changes to every hospital's seeded roles and the platform roles.
// Part of every deploy, after `prisma migrate deploy` and before the new API starts:
//   pnpm db:sync-roles            shows what would change
//   pnpm db:sync-roles --apply    changes it, with one audit event per changed role
// In the API container: node dist/cli/sync-roles.js --apply
// Safe in production: it only touches seeded (system) roles, never custom roles or users.

import { applyRoleSync, describePlan, isInSync, planRoleSync } from '../auth/role-sync.js';
import { createPrismaClient } from '../common/prisma/create-prisma-client.js';
import { loadCliEnv, print, requiredEnv } from './cli-env.js';

loadCliEnv();
const apply = process.argv.includes('--apply');
const prisma = createPrismaClient(requiredEnv('DATABASE_URL'));

try {
  const plan = apply ? await prisma.$transaction((tx) => applyRoleSync(tx), { timeout: 60_000 }) : await planRoleSync(prisma);
  const lines = describePlan(plan);
  if (isInSync(plan)) {
    print('Seeded roles already match the permission matrix.');
    for (const line of lines) print(line);
  } else {
    print(apply ? 'Applied:' : 'Would change (run again with --apply):');
    for (const line of lines) print(`  ${line}`);
  }
} finally {
  await prisma.$disconnect();
}
