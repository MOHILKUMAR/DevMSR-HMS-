import argon2 from 'argon2';
import { randomToken } from '../common/crypto/tokens.js';

export interface PasswordHashCost {
  memoryCost: number;
  timeCost: number;
  parallelism: number;
}

/**
 * Argon2id at the OWASP baseline (19 MiB, 2 passes, 1 lane). Light enough that a shift change with
 * many logins at once does not exhaust a small server's memory.
 */
export const PASSWORD_HASH_COST: PasswordHashCost = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export function hashPassword(password: string, cost: PasswordHashCost = PASSWORD_HASH_COST): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id, ...cost });
}

/** Never throws: a malformed hash simply fails verification. */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/** A real hash of a random secret, so an unknown username takes as long to reject as a wrong password. */
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomToken());
  return dummyHash;
}
