import { createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

/** URL-safe random token, 32 bytes (256 bits) by default. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hmacBase64Url(key: Buffer, value: string): string {
  return createHmac('sha256', key).update(value).digest('base64url');
}

/** Constant-time string comparison, so response timing does not reveal how much of a token matched. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Derives a purpose-specific key, so one secret never signs two kinds of data. */
export function deriveKey(secretBase64: string, purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.from(secretBase64, 'base64'), Buffer.alloc(0), purpose, 32));
}
