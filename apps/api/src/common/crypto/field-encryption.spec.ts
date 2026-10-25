import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFieldCipher, maskAadhaar, maskAbhaNumber } from './field-encryption.js';

const cipher = createFieldCipher(randomBytes(32).toString('base64'));
// Fake test numbers: real Aadhaar numbers never start with 0 or 1.
const AADHAAR = '0123 4567 8901';

describe('createFieldCipher', () => {
  it('round-trips a value and keeps only the digits', () => {
    const stored = cipher.protect('aadhaar', AADHAAR);
    expect(cipher.reveal('aadhaar', stored.encrypted)).toBe('012345678901');
    expect(stored.last4).toBe('8901');
  });

  it('never stores the plain number', () => {
    const stored = cipher.protect('aadhaar', AADHAAR);
    expect(stored.encrypted).not.toContain('012345678901');
    expect(stored.blindIndex).not.toContain('012345678901');
  });

  it('uses a fresh IV, so the same number encrypts differently each time', () => {
    expect(cipher.protect('aadhaar', AADHAAR).encrypted).not.toBe(cipher.protect('aadhaar', AADHAAR).encrypted);
  });

  it('gives a stable blind index for duplicate checks, ignoring spaces', () => {
    expect(cipher.protect('aadhaar', AADHAAR).blindIndex).toBe(cipher.blindIndex('aadhaar', '012345678901'));
  });

  it('separates fields: the same digits index differently as Aadhaar and as ABHA', () => {
    expect(cipher.blindIndex('aadhaar', '012345678901')).not.toBe(cipher.blindIndex('abha_number', '012345678901'));
  });

  it('refuses to decrypt a value moved to another field', () => {
    const stored = cipher.protect('aadhaar', AADHAAR);
    expect(() => cipher.reveal('abha_number', stored.encrypted)).toThrow();
  });

  it('refuses tampered ciphertext', () => {
    const [version, iv, , tag] = cipher.protect('aadhaar', AADHAAR).encrypted.split(':');
    const forged = [version, iv, Buffer.from('999999999999').toString('base64url'), tag].join(':');
    expect(() => cipher.reveal('aadhaar', forged)).toThrow();
  });

  it('seals a secret as given, not reduced to digits, and opens it only for its own field', () => {
    const sealed = cipher.seal('totp_secret', 'JBSWY3DPEHPK3PXP');
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(cipher.open('totp_secret', sealed)).toBe('JBSWY3DPEHPK3PXP');
    expect(() => cipher.reveal('aadhaar', sealed)).toThrow();
  });

  it('hashes recovery codes with a key, so equal codes match and the code is not stored', () => {
    expect(cipher.keyedHash('recovery_code', 'ABCD2345EFGH')).toBe(cipher.keyedHash('recovery_code', 'ABCD2345EFGH'));
    expect(cipher.keyedHash('recovery_code', 'ABCD2345EFGH')).not.toBe(
      createFieldCipher(randomBytes(32).toString('base64')).keyedHash('recovery_code', 'ABCD2345EFGH'),
    );
  });

  it('refuses a key of the wrong length', () => {
    expect(() => createFieldCipher(randomBytes(16).toString('base64'))).toThrow('exactly 32 bytes');
  });
});

describe('masking', () => {
  it('shows the last 4 digits only', () => {
    expect(maskAadhaar('8901')).toBe('XXXX XXXX 8901');
    expect(maskAbhaNumber('4321')).toBe('XX-XXXX-XXXX-4321');
  });
});
