import type { Prisma } from '../../generated/prisma/client.js';

/** A Prisma client bound to one transaction. Repositories accept it as an optional last argument. */
export type Tx = Prisma.TransactionClient;
