import { generate } from 'otplib';
import { describe, expect, it } from 'vitest';
import { newRecoveryCode, newTotpSecret, normalizeRecoveryCode, totpSetup, verifyTotp } from './two-factor.js';

const NOW = new Date('2026-10-25T10:00:15.000Z');
const STEP = Math.floor(NOW.getTime() / 30_000);

function codeAt(secret: string, at: Date): Promise<string> {
  return generate({ secret, epoch: Math.floor(at.getTime() / 1000) });
}

describe('two-factor codes', () => {
  it('accepts the current code and returns its 30 second step', async () => {
    const secret = newTotpSecret();
    expect(await verifyTotp(secret, await codeAt(secret, NOW), null, NOW)).toBe(STEP);
  });

  it('accepts one step either side for clock drift, but not two', async () => {
    const secret = newTotpSecret();
    expect(await verifyTotp(secret, await codeAt(secret, new Date(NOW.getTime() - 30_000)), null, NOW)).toBe(STEP - 1);
    expect(await verifyTotp(secret, await codeAt(secret, new Date(NOW.getTime() + 30_000)), null, NOW)).toBe(STEP + 1);
    expect(await verifyTotp(secret, await codeAt(secret, new Date(NOW.getTime() - 90_000)), null, NOW)).toBeNull();
  });

  it('never accepts a code from a step already used', async () => {
    const secret = newTotpSecret();
    const code = await codeAt(secret, NOW);
    expect(await verifyTotp(secret, code, STEP, NOW)).toBeNull();
    expect(await verifyTotp(secret, code, STEP - 1, NOW)).toBe(STEP);
  });

  it('rejects a wrong code and a code for another secret', async () => {
    const secret = newTotpSecret();
    expect(await verifyTotp(secret, '000000', null, NOW)).toBeNull();
    expect(await verifyTotp(secret, await codeAt(newTotpSecret(), NOW), null, NOW)).toBeNull();
  });

  it('gives the app a 160-bit base32 secret, an otpauth URI and a QR code image', async () => {
    const secret = newTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    const setup = await totpSetup(secret, 'DEMO:admin');
    expect(setup.otpauthUri).toMatch(/^otpauth:\/\/totp\/DevMSR%20HMS:DEMO(%3A|:)admin\?/);
    expect(setup.otpauthUri).toContain(`secret=${secret}`);
    expect(setup.qrCode).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(Buffer.from(setup.qrCode.split(',')[1] ?? '', 'base64').toString()).toContain('<svg');
  });
});

describe('recovery codes', () => {
  it('are 12 unambiguous characters in groups of 4, different every time', () => {
    const codes = new Set(Array.from({ length: 50 }, () => newRecoveryCode()));
    expect(codes.size).toBe(50);
    for (const code of codes) expect(code).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  });

  it('match however they are typed', () => {
    expect(normalizeRecoveryCode(' 7kq2 m9xd-4tpa ')).toBe('7KQ2M9XD4TPA');
  });
});
