import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';

/**
 * Prisma 7 talks to PostgreSQL through the node-postgres driver adapter.
 *
 * Every connection runs in UTC. The adapter sends dates as UTC clock time with no offset
 * (`2026-10-25 00:26:51`), and PostgreSQL reads that in the session time zone. On a server set to
 * IST every timestamp would be stored 5.5 hours early.
 */
export function prismaAdapter(databaseUrl: string): PrismaPg {
  return new PrismaPg({ connectionString: databaseUrl, options: '-c TimeZone=UTC' });
}

/** A standalone client for scripts such as the seed. The API itself uses PrismaService. */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: prismaAdapter(databaseUrl) });
}
