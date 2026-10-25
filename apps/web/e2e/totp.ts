import { createHmac } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): Buffer {
  let bits = '';
  for (const char of input.replace(/=+$/, '').toUpperCase()) {
    const value = BASE32.indexOf(char);
    if (value === -1) throw new Error('SEED_TOTP_SECRET is not base32');
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((byte) => parseInt(byte, 2)));
}

/** The authenticator app's code (RFC 6238: SHA-1, 6 digits, 30 seconds), so tests need no extra library. */
export function totpCode(secret: string, at: number = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const value = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return value.toString().padStart(6, '0');
}

/** The secret the seed gave the demo users whose roles need two-factor (admin, accounts, superadmin). */
export function seedTotpSecret(): string {
  const secret = process.env['SEED_TOTP_SECRET'];
  if (secret === undefined || secret === '') throw new Error('SEED_TOTP_SECRET is not set, so admin and accounts cannot sign in');
  return secret;
}

// Test files share one worker, so this remembers the last 30 second window used across all of them.
let lastWindow = -1;

/**
 * A code the API will take: it refuses a code already used, so when the last sign-in used this
 * window's code, wait for the next window first.
 */
export async function freshTotpCode(secret: string): Promise<string> {
  let window = Math.floor(Date.now() / 30_000);
  if (window <= lastWindow) {
    await new Promise((resolve) => setTimeout(resolve, (lastWindow + 1) * 30_000 - Date.now() + 250));
    window = Math.floor(Date.now() / 30_000);
  }
  lastWindow = window;
  return totpCode(secret, window * 30_000);
}
