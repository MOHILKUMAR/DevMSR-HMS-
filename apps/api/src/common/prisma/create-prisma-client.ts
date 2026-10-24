import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';

/** Prisma 7 talks to PostgreSQL through the node-postgres driver adapter. */
export function prismaAdapter(databaseUrl: string): PrismaPg {
  return new PrismaPg({ connectionString: databaseUrl });
}

/** A standalone client for scripts such as the seed. The API itself uses PrismaService. */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: prismaAdapter(databaseUrl) });
}
