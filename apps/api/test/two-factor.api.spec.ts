import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonymousBrowser,
  as,
  awaitFreshStep,
  createHospital,
  createUser,
  enableTwoFactor,
  signIn,
  TEST_PASSWORD,
  totpCode,
  withChallenge,
  type Browser,
  type TestHospital,
} from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';

interface ErrorBody {
  error: { code: string };
}

function errorCode(response: request.Response): string {
  return (response.body as ErrorBody).error.code;
}

/** Signs in with the password and returns the browser holding the challenge cookie. */
async function startSignIn(http: Server, username: string, password = TEST_PASSWORD): Promise<{ browser: Browser; body: unknown }> {
  const browser = await anonymousBrowser(http);
  const response = await as(request(http).post('/api/v1/auth/login'), browser).send({ username, password });
  expect(response.status).toBe(200);
  const body: unknown = response.body;
  return { browser: (body as { status: string }).status === 'challenge' ? withChallenge(browser, response) : browser, body };
}

describe('two-factor sign-in', () => {
  let t: TestApp;
  let hospital: TestHospital;
  let otherHospital: TestHospital;

  beforeAll(async () => {
    t = await createTestApp({ env: { RATE_LIMIT_LOGIN_PER_MINUTE: '100' } });
    hospital = await createHospital(t.prisma);
    otherHospital = await createHospital(t.prisma);
  });

  afterAll(async () => {
    await t.close();
  });

  describe('setup at sign-in, for roles that need it', () => {
    it('asks a hospital admin to set it up, then switches it on with a code and shows recovery codes once', async () => {
      const admin = await createUser(t.prisma, hospital, 'hospital_admin');
      const { browser, body } = await startSignIn(t.http, admin.username);
      expect(body).toMatchObject({ status: 'challenge', step: 'totp_setup' });

      const setup = await as(request(t.http).get('/api/v1/auth/login/totp/setup'), browser);
      expect(setup.status).toBe(200);
      const { secret, otpauthUri, qrCode } = setup.body as { secret: string; otpauthUri: string; qrCode: string };
      expect(otpauthUri).toContain(`secret=${secret}`);
      expect(otpauthUri).toContain(encodeURIComponent(admin.username));
      expect(qrCode).toMatch(/^data:image\/svg\+xml;base64,/);

      const wrong = await as(request(t.http).post('/api/v1/auth/login/totp/setup'), browser).send({ code: '000000' });
      expect(wrong.status).toBe(422);
      expect(errorCode(wrong)).toBe('TOTP_INVALID');
      expect(await t.prisma.loginEvent.count({ where: { userId: admin.id, outcome: 'wrong_totp' } })).toBe(1);

      const done = await as(request(t.http).post('/api/v1/auth/login/totp/setup'), browser).send({ code: await totpCode(secret) });
      expect(done.status).toBe(200);
      const signedIn = done.body as { status: string; recoveryCodes: string[]; permissions: string[] };
      expect(signedIn.status).toBe('signed_in');
      expect(signedIn.recoveryCodes).toHaveLength(10);
      expect(new Set(signedIn.recoveryCodes).size).toBe(10);
      expect(signedIn.permissions).toContain('users.user.manage');

      const row = await t.prisma.user.findUniqueOrThrow({ where: { id: admin.id }, select: { totpEnabledAt: true, totpSecretEncrypted: true } });
      expect(row.totpEnabledAt).not.toBeNull();
      expect(row.totpSecretEncrypted).not.toContain(secret);
      const stored = await t.prisma.recoveryCode.findMany({ where: { userId: admin.id }, select: { codeHash: true } });
      expect(stored).toHaveLength(10);
      for (const code of signedIn.recoveryCodes) expect(JSON.stringify(stored)).not.toContain(code.replace(/-/g, ''));
      expect(await t.prisma.auditEvent.count({ where: { entityId: admin.id, action: 'auth.two-factor.enabled' } })).toBe(1);

      // The challenge is used up.
      expect((await as(request(t.http).get('/api/v1/auth/login/totp/setup'), browser)).status).toBe(401);
      // From now on sign-in asks for a code.
      expect((await startSignIn(t.http, admin.username)).body).toMatchObject({ status: 'challenge', step: 'totp_verify' });
    });

    it('keeps the same secret if sign-in is started again before setup is finished', async () => {
      const accountant = await createUser(t.prisma, hospital, 'accountant');
      const first = await startSignIn(t.http, accountant.username);
      const second = await startSignIn(t.http, accountant.username);
      const secretOf = async (browser: Browser) =>
        ((await as(request(t.http).get('/api/v1/auth/login/totp/setup'), browser)).body as { secret: string }).secret;
      expect(await secretOf(second.browser)).toBe(await secretOf(first.browser));
    });

    it('lets a nurse, whose role does not need it, sign in with the password alone', async () => {
      const nurse = await createUser(t.prisma, hospital, 'nurse');
      expect((await startSignIn(t.http, nurse.username)).body).toMatchObject({ status: 'signed_in' });
    });

    it('asks for the new password first, then two-factor setup', async () => {
      const admin = await createUser(t.prisma, hospital, 'hospital_admin');
      await t.prisma.user.update({ where: { id: admin.id }, data: { mustChangePassword: true, passwordChangedAt: new Date(Date.now() - 60_000) } });
      const { browser, body } = await startSignIn(t.http, admin.username);
      expect(body).toMatchObject({ step: 'change_password' });
      const changed = await as(request(t.http).post('/api/v1/auth/login/password'), browser).send({ newPassword: 'admin-own-Passw0rd' });
      expect(changed.body).toMatchObject({ status: 'challenge', step: 'totp_setup' });
    });

    it('needs the challenge cookie', async () => {
      expect((await request(t.http).get('/api/v1/auth/login/totp/setup')).status).toBe(401);
    });
  });

  describe('codes at sign-in when two-factor is on', () => {
    it('accepts a code once, never the same code again', async () => {
      await awaitFreshStep();
      const nurse = await createUser(t.prisma, hospital, 'nurse');
      const secret = await enableTwoFactor(t, nurse);
      const code = await totpCode(secret);

      const first = await startSignIn(t.http, nurse.username);
      expect(first.body).toMatchObject({ step: 'totp_verify' });
      const ok = await as(request(t.http).post('/api/v1/auth/login/totp'), first.browser).send({ code });
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ status: 'signed_in' });
      expect((ok.body as { recoveryCodes?: unknown }).recoveryCodes).toBeUndefined();

      const second = await startSignIn(t.http, nurse.username);
      const replay = await as(request(t.http).post('/api/v1/auth/login/totp'), second.browser).send({ code });
      expect(replay.status).toBe(422);
      expect(errorCode(replay)).toBe('TOTP_INVALID');
      // The next code still works on the same challenge.
      expect((await as(request(t.http).post('/api/v1/auth/login/totp'), second.browser).send({ code: await totpCode(secret, 1) })).status).toBe(200);
    });

    it('accepts each recovery code once', async () => {
      const admin = await createUser(t.prisma, hospital, 'hospital_admin');
      const setupBrowser = (await startSignIn(t.http, admin.username)).browser;
      const { secret } = (await as(request(t.http).get('/api/v1/auth/login/totp/setup'), setupBrowser)).body as { secret: string };
      const done = await as(request(t.http).post('/api/v1/auth/login/totp/setup'), setupBrowser).send({ code: await totpCode(secret) });
      const [recoveryCode] = (done.body as { recoveryCodes: string[] }).recoveryCodes;

      const first = await startSignIn(t.http, admin.username);
      const used = await as(request(t.http).post('/api/v1/auth/login/totp'), first.browser).send({ recoveryCode: recoveryCode?.toLowerCase() });
      expect(used.status).toBe(200);
      const event = await t.prisma.auditEvent.findFirstOrThrow({ where: { entityId: admin.id, action: 'auth.recovery-code.used' } });
      expect(event.metadata).toMatchObject({ left: 9 });

      const second = await startSignIn(t.http, admin.username);
      const again = await as(request(t.http).post('/api/v1/auth/login/totp'), second.browser).send({ recoveryCode });
      expect(errorCode(again)).toBe('TOTP_INVALID');
    });

    it('locks the account after 5 wrong codes, like wrong passwords', async () => {
      const nurse = await createUser(t.prisma, hospital, 'nurse');
      await enableTwoFactor(t, nurse);
      const { browser } = await startSignIn(t.http, nurse.username);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect((await as(request(t.http).post('/api/v1/auth/login/totp'), browser).send({ code: '000000' })).status).toBe(422);
      }
      expect((await as(request(t.http).post('/api/v1/auth/login/totp'), browser).send({ code: '000000' })).status).toBe(401);
      const login = await as(request(t.http).post('/api/v1/auth/login'), await anonymousBrowser(t.http)).send({ username: nurse.username, password: TEST_PASSWORD });
      expect(errorCode(login)).toBe('LOGIN_FAILED');
      expect(await t.prisma.auditEvent.count({ where: { entityId: nurse.id, action: 'auth.account.locked' } })).toBe(1);
    });

    it('validates the body: a code or a recovery code, exactly one', async () => {
      const nurse = await createUser(t.prisma, hospital, 'nurse');
      await enableTwoFactor(t, nurse);
      const { browser } = await startSignIn(t.http, nurse.username);
      expect((await as(request(t.http).post('/api/v1/auth/login/totp'), browser).send({})).status).toBe(400);
      expect((await as(request(t.http).post('/api/v1/auth/login/totp'), browser).send({ code: '12345' })).status).toBe(400);
    });

    it('keeps recovery codes: using or revoking once is the only change, even for the table owner', async () => {
      const nurse = await createUser(t.prisma, hospital, 'nurse');
      const browser = await signIn(t, nurse);
      const secret = (await as(request(t.http).post('/api/v1/auth/two-factor/setup'), browser)).body as { secret: string };
      await as(request(t.http).post('/api/v1/auth/two-factor/enable'), browser).send({ code: await totpCode(secret.secret) });
      const code = await t.prisma.recoveryCode.findFirstOrThrow({ where: { userId: nurse.id } });
      await expect(t.owner.recoveryCode.update({ where: { id: code.id }, data: { codeHash: 'x' } })).rejects.toThrow(/not allowed/);
      await expect(t.owner.recoveryCode.delete({ where: { id: code.id } })).rejects.toThrow(/not allowed/);
    });
  });

  describe('My account', () => {
    it('shows whether two-factor is on and required', async () => {
      const nurse = await signIn(t, await createUser(t.prisma, hospital, 'nurse'));
      expect((await as(request(t.http).get('/api/v1/auth/two-factor'), nurse)).body).toEqual({ enabled: false, required: false, recoveryCodesLeft: 0 });
      const admin = await signIn(t, await createUser(t.prisma, hospital, 'hospital_admin'));
      expect((await as(request(t.http).get('/api/v1/auth/two-factor'), admin)).body).toMatchObject({ required: true });
    });

    it('sets up, replaces recovery codes and switches off for a role that does not need it', async () => {
      await awaitFreshStep();
      const user = await createUser(t.prisma, hospital, 'nurse');
      const browser = await signIn(t, user);
      const { secret } = (await as(request(t.http).post('/api/v1/auth/two-factor/setup'), browser)).body as { secret: string };

      const wrong = await as(request(t.http).post('/api/v1/auth/two-factor/enable'), browser).send({ code: '000000' });
      expect(errorCode(wrong)).toBe('TOTP_INVALID');
      expect(await t.prisma.auditEvent.count({ where: { entityId: user.id, action: 'auth.two-factor.code-refused' } })).toBe(1);

      // Each code works once, so this uses the previous, current and next 30 second steps in turn.
      const enabled = await as(request(t.http).post('/api/v1/auth/two-factor/enable'), browser).send({ code: await totpCode(secret, -1) });
      expect(enabled.status).toBe(200);
      const firstCodes = (enabled.body as { recoveryCodes: string[] }).recoveryCodes;
      expect(firstCodes).toHaveLength(10);
      expect((await as(request(t.http).get('/api/v1/auth/two-factor'), browser)).body).toEqual({ enabled: true, required: false, recoveryCodesLeft: 10 });
      expect(errorCode(await as(request(t.http).post('/api/v1/auth/two-factor/setup'), browser))).toBe('TWO_FACTOR_STATE');

      const replaced = await as(request(t.http).post('/api/v1/auth/two-factor/recovery-codes'), browser).send({ code: await totpCode(secret) });
      expect(replaced.status).toBe(200);
      expect((replaced.body as { recoveryCodes: string[] }).recoveryCodes).not.toContain(firstCodes[0]);
      // An old code no longer signs in.
      const { browser: signingIn } = await startSignIn(t.http, user.username);
      expect(errorCode(await as(request(t.http).post('/api/v1/auth/login/totp'), signingIn).send({ recoveryCode: firstCodes[0] }))).toBe('TOTP_INVALID');

      // A code from a step already used is refused; the next step's code works.
      expect((await as(request(t.http).post('/api/v1/auth/two-factor/disable'), browser).send({ code: await totpCode(secret) })).status).toBe(422);
      expect((await as(request(t.http).post('/api/v1/auth/two-factor/disable'), browser).send({ code: await totpCode(secret, 1) })).status).toBe(204);
      expect((await as(request(t.http).get('/api/v1/auth/two-factor'), browser)).body).toEqual({ enabled: false, required: false, recoveryCodesLeft: 0 });
      expect((await startSignIn(t.http, user.username)).body).toMatchObject({ status: 'signed_in' });
    });

    it('never switches off two-factor for a role that needs it', async () => {
      const admin = await createUser(t.prisma, hospital, 'hospital_admin');
      const secret = await enableTwoFactor(t, admin);
      const browser = await signIn(t, admin);
      const refused = await as(request(t.http).post('/api/v1/auth/two-factor/disable'), browser).send({ code: await totpCode(secret) });
      expect(refused.status).toBe(422);
      expect(errorCode(refused)).toBe('TWO_FACTOR_REQUIRED');
    });

    it('needs a session', async () => {
      expect((await request(t.http).get('/api/v1/auth/two-factor')).status).toBe(401);
    });
  });

  describe('POST /users/:id/two-factor/reset', () => {
    it('switches another user off, revokes their codes and signs them out; they set it up again', async () => {
      const admin = await signIn(t, await createUser(t.prisma, hospital, 'hospital_admin'));
      const accountant = await createUser(t.prisma, hospital, 'accountant');
      await enableTwoFactor(t, accountant);
      const theirSession = await signIn(t, accountant);

      const response = await as(request(t.http).post(`/api/v1/users/${accountant.id}/two-factor/reset`), admin);
      expect(response.status).toBe(204);
      expect((await as(request(t.http).get('/api/v1/auth/me'), theirSession)).status).toBe(401);
      expect(await t.prisma.auditEvent.count({ where: { entityId: accountant.id, action: 'users.user.two-factor-reset' } })).toBe(1);
      const listed = (await as(request(t.http).get(`/api/v1/users?q=${accountant.username}`), admin)).body as { data: { twoFactorEnabled: boolean }[] };
      expect(listed.data[0]?.twoFactorEnabled).toBe(false);
      expect((await startSignIn(t.http, accountant.username)).body).toMatchObject({ step: 'totp_setup' });
    });

    it('refuses your own account, hides other hospitals and needs the permission', async () => {
      const adminUser = await createUser(t.prisma, hospital, 'hospital_admin');
      const admin = await signIn(t, adminUser);
      expect(errorCode(await as(request(t.http).post(`/api/v1/users/${adminUser.id}/two-factor/reset`), admin))).toBe('SELF_CHANGE_NOT_ALLOWED');
      const stranger = await createUser(t.prisma, otherHospital, 'nurse');
      expect((await as(request(t.http).post(`/api/v1/users/${stranger.id}/two-factor/reset`), admin)).status).toBe(404);
      const nurse = await signIn(t, await createUser(t.prisma, hospital, 'nurse'));
      expect((await as(request(t.http).post(`/api/v1/users/${adminUser.id}/two-factor/reset`), nurse)).status).toBe(403);
    });
  });
});

describe('two-factor code limits', () => {
  it('allows 5 code tries per minute per sign-in, then 429', async () => {
    const t = await createTestApp();
    try {
      const hospital = await createHospital(t.prisma);
      const nurse = await createUser(t.prisma, hospital, 'nurse');
      await enableTwoFactor(t, nurse);
      const { browser } = await startSignIn(t.http, nurse.username);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await as(request(t.http).post('/api/v1/auth/login/totp'), browser).send({ code: '000000' });
      }
      const limited = await as(request(t.http).post('/api/v1/auth/login/totp'), browser).send({ code: '000000' });
      expect(limited.status).toBe(429);
      expect(limited.headers['retry-after']).toBeDefined();
    } finally {
      await t.close();
    }
  });
});
