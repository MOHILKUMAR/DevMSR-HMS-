import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { deriveKey } from './tokens.js';

/** Which identifier a value is. Also bound into the ciphertext, so an Aadhaar value cannot be pasted into the ABHA column. */
export type ProtectedField = 'aadhaar' | 'abha_number';

/** Secrets stored as given (not reduced to digits), such as a two-factor key. */
export type SealedField = 'totp_secret';

/** Values only ever compared, never read back, such as recovery codes. */
export type HashedField = 'recovery_code';

/** What is stored for one protected identifier. */
export interface ProtectedValue {
  /** AES-256-GCM ciphertext: `v1:<iv>:<ciphertext>:<tag>`, base64url parts. */
  encrypted: string;
  /** For masked display. */
  last4: string;
  /** HMAC-SHA256 of the digits, for duplicate checks without decrypting. */
  blindIndex: string;
}

export interface FieldCipher {
  protect(field: ProtectedField, value: string): ProtectedValue;
  reveal(field: ProtectedField, encrypted: string): string;
  blindIndex(field: ProtectedField, value: string): string;
  seal(field: SealedField, value: string): string;
  open(field: SealedField, sealed: string): string;
  keyedHash(field: HashedField, value: string): string;
}

const VERSION = 'v1';

/** Aadhaar and ABHA numbers are compared on digits only, so "1234 5678 9012" and "123456789012" match. */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export function createFieldCipher(keyBase64: string): FieldCipher {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) {
    throw new Error('FIELD_ENCRYPTION_KEY must be base64 of exactly 32 bytes');
  }
  const indexKey = deriveKey(keyBase64, 'devmsr-hms/blind-index/v1');

  const blindIndex = (field: ProtectedField, value: string): string =>
    createHmac('sha256', indexKey).update(`${field}:${digitsOnly(value)}`).digest('hex');

  // The field name is the additional data, so a value sealed for one field never opens as another.
  const encrypt = (field: string, plaintext: string): string => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(field));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [VERSION, iv, ciphertext, cipher.getAuthTag()]
      .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
      .join(':');
  };

  const decrypt = (field: string, encrypted: string): string => {
    const [version, iv, ciphertext, tag] = encrypted.split(':');
    if (version !== VERSION || iv === undefined || ciphertext === undefined || tag === undefined) {
      throw new Error('Unsupported ciphertext format');
    }
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(field));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
  };

  return {
    protect(field, value) {
      const digits = digitsOnly(value);
      return { encrypted: encrypt(field, digits), last4: digits.slice(-4), blindIndex: blindIndex(field, digits) };
    },
    reveal: decrypt,
    blindIndex,
    seal: encrypt,
    open: decrypt,
    keyedHash: (field, value) => createHmac('sha256', indexKey).update(`${field}:${value}`).digest('hex'),
  };
}

/** Aadhaar shown to staff: last 4 digits only. */
export function maskAadhaar(last4: string): string {
  return `XXXX XXXX ${last4}`;
}

/** ABHA number shown to staff: last 4 digits only. */
export function maskAbhaNumber(last4: string): string {
  return `XX-XXXX-XXXX-${last4}`;
}
