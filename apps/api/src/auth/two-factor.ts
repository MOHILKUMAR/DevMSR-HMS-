import { randomBytes } from 'node:crypto';
import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';

/** Shown as the account's name in the authenticator app. */
export const TOTP_ISSUER = 'DevMSR HMS';
/** RFC 6238 defaults, which every authenticator app supports: SHA-1, 6 digits, 30 seconds. */
const PERIOD_SECONDS = 30;

export const RECOVERY_CODE_COUNT = 10;
// No 0, 1, I or O, which are easy to misread on paper.
const RECOVERY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const RECOVERY_CODE_LENGTH = 12;

/** A new 160-bit secret, base32 as authenticator apps expect. */
export function newTotpSecret(): string {
  return generateSecret();
}

export interface TotpSetup {
  /** For typing into the app when the camera cannot scan. */
  secret: string;
  otpauthUri: string;
  /** The URI as a QR code, an SVG data URL the browser shows as an image. */
  qrCode: string;
}

export async function totpSetup(secret: string, account: string): Promise<TotpSetup> {
  const otpauthUri = generateURI({ issuer: TOTP_ISSUER, label: account, secret, period: PERIOD_SECONDS });
  const svg = await QRCode.toString(otpauthUri, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 });
  return { secret, otpauthUri, qrCode: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` };
}

/**
 * The 30 second step a code belongs to, or null if it is wrong. One step either side is accepted for
 * phone clocks that drift, and never a step at or before `afterTimeStep`, so a code works only once.
 */
export async function verifyTotp(secret: string, code: string, afterTimeStep: number | null, now: Date): Promise<number | null> {
  const result = await verify({
    secret,
    token: code,
    period: PERIOD_SECONDS,
    epoch: Math.floor(now.getTime() / 1000),
    epochTolerance: PERIOD_SECONDS,
    ...(afterTimeStep === null ? {} : { afterTimeStep }),
  });
  return result.valid && 'timeStep' in result ? result.timeStep : null;
}

/** `7KQ2-M9XD-4TPA`: 60 random bits, grouped for reading off paper. */
export function newRecoveryCode(): string {
  const chars = [...randomBytes(RECOVERY_CODE_LENGTH)].map((byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length] ?? '');
  return [0, 4, 8].map((start) => chars.slice(start, start + 4).join('')).join('-');
}

/** Codes are compared without spaces, hyphens or case, as people type them. */
export function normalizeRecoveryCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}
