import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomToken, sha256Hex } from '../src/common/crypto/tokens.js';
import {
  anonymousBrowser,
  as,
  cookiePairs,
  createHospital,
  createUser,
  signIn,
  TEST_PASSWORD,
  withChallenge,
  type Browser,
  type TestHospital,
  type TestUser,
} from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';

interface ErrorBody {
  error: { code: string };
}

function errorCode(response: request.Response): string {
  return (response.body as ErrorBody).error.code;
}

const NEW_PASSWORD = 'my-own-Passw0rd';

async function login(http: Server, username: string, password = TEST_PASSWORD): Promise<{ browser: Browser; response: request.Response }> {
  const browser = await anonymousBrowser(http);
  const response = await as(request(http).post('/api/v1/auth/login'), browser).send({ username, password });
  return { browser, response };
}

describe('account', () => {
  let t: TestApp;
  let hospital: TestHospital;

  beforeAll(async () => {
    t = await createTestApp({ env: { RATE_LIMIT_LOGIN_PER_MINUTE: '100' } });
    hospital = await createHospital(t.prisma);
  });

  afterAll(async () => {
    await t.close();
  });

  /** A user whose password an admin set, as after POST /users or POST /users/:id/password. */
  async function adminSetUser(): Promise<TestUser> {
    const user = await createUser(t.prisma, hospital, 'cashier');
    await t.prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true, passwordChangedAt: new Date(Date.now() - 60_000) } });
    return user;
  }

  describe('sign-in when an admin set the password', () => {
    it('answers with a challenge cookie limited to the sign-in routes, and no session', async () => {
      const user = await adminSetUser();
      const { response } = await login(t.http, user.username);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'challenge', step: 'change_password', expiresAt: expect.any(String) as string });
      const lines = response.headers['set-cookie'] as unknown as string[];
      const challenge = lines.find((line) => line.startsWith('hms_login='));
      expect(challenge).toMatch(/HttpOnly/i);
      expect(challenge).toMatch(/Path=\/api\/v1\/auth\/login/);
      expect(challenge).toMatch(/Max-Age=600/);
      expect(lines.some((line) => line.startsWith('hms_session='))).toBe(false);
      const token = cookiePairs(response).find((pair) => pair.startsWith('hms_login='))?.split('=')[1] ?? '';
      expect(await t.prisma.loginChallenge.count({ where: { tokenHash: sha256Hex(token), userId: user.id } })).toBe(1);
      expect(await t.prisma.loginChallenge.count({ where: { tokenHash: token } })).toBe(0);
      expect(await t.prisma.loginEvent.count({ where: { userId: user.id, outcome: 'challenge_started' } })).toBe(1);
    });

    it('starts a session once the user chooses a new password, which then works for sign-in', async () => {
      const user = await adminSetUser();
      const { browser, response } = await login(t.http, user.username);
      const changed = await as(request(t.http).post('/api/v1/auth/login/password'), withChallenge(browser, response)).send({
        newPassword: NEW_PASSWORD,
      });
      expect(changed.status).toBe(200);
      expect(changed.body).toMatchObject({ status: 'signed_in', user: { id: user.id }, csrfToken: expect.any(String) as string });
      const lines = changed.headers['set-cookie'] as unknown as string[];
      expect(lines.some((line) => line.startsWith('hms_session=') && /HttpOnly/i.test(line))).toBe(true);
      expect(lines.some((line) => /^hms_login=;/.test(line))).toBe(true);

      const row = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { mustChangePassword: true } });
      expect(row.mustChangePassword).toBe(false);
      expect(await t.prisma.auditEvent.count({ where: { entityId: user.id, action: 'auth.password.changed' } })).toBe(1);
      expect(await t.prisma.loginEvent.count({ where: { userId: user.id, outcome: 'succeeded' } })).toBe(1);

      expect((await login(t.http, user.username, NEW_PASSWORD)).response.body).toMatchObject({ status: 'signed_in' });
      expect((await login(t.http, user.username)).response.status).toBe(401);
    });

    it('uses a challenge once', async () => {
      const user = await adminSetUser();
      const { browser, response } = await login(t.http, user.username);
      const holder = withChallenge(browser, response);
      expect((await as(request(t.http).post('/api/v1/auth/login/password'), holder).send({ newPassword: NEW_PASSWORD })).status).toBe(200);
      const again = await as(request(t.http).post('/api/v1/auth/login/password'), holder).send({ newPassword: 'another-Passw0rd' });
      expect(again.status).toBe(401);
      expect(errorCode(again)).toBe('LOGIN_CHALLENGE_INVALID');
    });

    it('refuses the password the admin set', async () => {
      const user = await adminSetUser();
      const { browser, response } = await login(t.http, user.username);
      const same = await as(request(t.http).post('/api/v1/auth/login/password'), withChallenge(browser, response)).send({
        newPassword: TEST_PASSWORD,
      });
      expect(same.status).toBe(422);
      expect(errorCode(same)).toBe('PASSWORD_REUSED');
    });

    it('refuses a missing, expired or outdated challenge', async () => {
      const browser = await anonymousBrowser(t.http);
      const missing = await as(request(t.http).post('/api/v1/auth/login/password'), browser).send({ newPassword: NEW_PASSWORD });
      expect(missing.status).toBe(401);
      expect(errorCode(missing)).toBe('LOGIN_CHALLENGE_INVALID');

      const user = await adminSetUser();
      const expiredToken = randomToken();
      await t.prisma.loginChallenge.create({
        data: {
          tokenHash: sha256Hex(expiredToken),
          userId: user.id,
          hospitalId: user.hospitalId,
          step: 'change_password',
          // Started after the admin set the password, but more than 10 minutes ago.
          createdAt: new Date(Date.now() - 5_000),
          expiresAt: new Date(Date.now() - 1_000),
        },
      });
      const expired = await as(request(t.http).post('/api/v1/auth/login/password'), {
        ...browser,
        cookie: `${browser.cookie}; hms_login=${expiredToken}`,
      }).send({ newPassword: NEW_PASSWORD });
      expect(errorCode(expired)).toBe('LOGIN_CHALLENGE_INVALID');

      // An admin set yet another password after the challenge started.
      const { browser: started, response } = await login(t.http, user.username);
      await t.prisma.user.update({ where: { id: user.id }, data: { passwordChangedAt: new Date(Date.now() + 1000) } });
      const outdated = await as(request(t.http).post('/api/v1/auth/login/password'), withChallenge(started, response)).send({
        newPassword: NEW_PASSWORD,
      });
      expect(errorCode(outdated)).toBe('LOGIN_CHALLENGE_INVALID');
    });

    it('validates input and needs the CSRF token', async () => {
      const user = await adminSetUser();
      const { browser, response } = await login(t.http, user.username);
      const holder = withChallenge(browser, response);
      expect((await as(request(t.http).post('/api/v1/auth/login/password'), holder).send({ newPassword: 'short' })).status).toBe(400);
      const noCsrf = await request(t.http).post('/api/v1/auth/login/password').set('Cookie', holder.cookie).send({ newPassword: NEW_PASSWORD });
      expect(noCsrf.status).toBe(403);
    });

    it('keeps the challenge rows: only completing one is allowed, even for the table owner', async () => {
      const user = await adminSetUser();
      await login(t.http, user.username);
      const challenge = await t.prisma.loginChallenge.findFirstOrThrow({ where: { userId: user.id } });
      await expect(t.owner.loginChallenge.update({ where: { id: challenge.id }, data: { expiresAt: new Date(Date.now() + 86_400_000) } })).rejects.toThrow(
        /not allowed/,
      );
      await expect(t.owner.loginChallenge.delete({ where: { id: challenge.id } })).rejects.toThrow(/not allowed/);
    });
  });

  describe('POST /auth/password', () => {
    it('changes the password with the current one, ends the other sessions and keeps this one', async () => {
      const user = await createUser(t.prisma, hospital, 'nurse');
      const here = await signIn(t, user);
      const elsewhere = await signIn(t, user);
      const response = await as(request(t.http).post('/api/v1/auth/password'), here).send({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD });
      expect(response.status).toBe(204);
      expect((await as(request(t.http).get('/api/v1/auth/me'), here)).status).toBe(200);
      expect((await as(request(t.http).get('/api/v1/auth/me'), elsewhere)).status).toBe(401);
      expect((await login(t.http, user.username, NEW_PASSWORD)).response.body).toMatchObject({ status: 'signed_in' });
      const event = await t.prisma.auditEvent.findFirstOrThrow({ where: { entityId: user.id, action: 'auth.password.changed' } });
      expect(event.metadata).toMatchObject({ via: 'account', otherSessionsEnded: 1 });
    });

    it('refuses a wrong current password and records it, and refuses the same password', async () => {
      const user = await createUser(t.prisma, hospital, 'nurse');
      const browser = await signIn(t, user);
      const wrong = await as(request(t.http).post('/api/v1/auth/password'), browser).send({ currentPassword: 'not-it', newPassword: NEW_PASSWORD });
      expect(wrong.status).toBe(422);
      expect(errorCode(wrong)).toBe('CURRENT_PASSWORD_WRONG');
      expect(await t.prisma.auditEvent.count({ where: { entityId: user.id, action: 'auth.password.change-refused' } })).toBe(1);
      const same = await as(request(t.http).post('/api/v1/auth/password'), browser).send({ currentPassword: TEST_PASSWORD, newPassword: TEST_PASSWORD });
      expect(errorCode(same)).toBe('PASSWORD_REUSED');
    });

    it('returns 400 for invalid input and 401 without a session', async () => {
      const browser = await signIn(t, await createUser(t.prisma, hospital, 'nurse'));
      expect((await as(request(t.http).post('/api/v1/auth/password'), browser).send({ currentPassword: TEST_PASSWORD, newPassword: 'short' })).status).toBe(400);
      const anonymous = await anonymousBrowser(t.http);
      expect((await as(request(t.http).post('/api/v1/auth/password'), anonymous).send({ currentPassword: 'x', newPassword: NEW_PASSWORD })).status).toBe(401);
    });

    it('allows 3 tries per hour, then 429', async () => {
      const browser = await signIn(t, await createUser(t.prisma, hospital, 'nurse'));
      const attempt = () => as(request(t.http).post('/api/v1/auth/password'), browser).send({ currentPassword: 'not-it', newPassword: NEW_PASSWORD });
      for (let i = 0; i < 3; i += 1) expect((await attempt()).status).toBe(422);
      const limited = await attempt();
      expect(limited.status).toBe(429);
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(60);
    });
  });

  describe('own sessions', () => {
    it('lists only my open sessions, the current one marked', async () => {
      const user = await createUser(t.prisma, hospital, 'doctor');
      const here = await signIn(t, user);
      const elsewhere = await signIn(t, user);
      const ended = await signIn(t, user);
      await as(request(t.http).post('/api/v1/auth/logout'), ended).expect(204);
      const idle = await signIn(t, user);
      await t.prisma.session.update({ where: { id: idle.sessionId }, data: { lastSeenAt: new Date(Date.now() - 16 * 60_000) } });
      await signIn(t, await createUser(t.prisma, hospital, 'doctor'));

      const response = await as(request(t.http).get('/api/v1/auth/sessions'), here);
      expect(response.status).toBe(200);
      const sessions = (response.body as { data: { id: string; current: boolean }[] }).data;
      expect(sessions.map((s) => s.id).sort()).toEqual([here.sessionId, elsewhere.sessionId].sort());
      expect(sessions.find((s) => s.current)?.id).toBe(here.sessionId);
      expect(JSON.stringify(response.body)).not.toMatch(/token/i);
    });

    it('ends another of my sessions', async () => {
      const user = await createUser(t.prisma, hospital, 'doctor');
      const here = await signIn(t, user);
      const elsewhere = await signIn(t, user);
      expect((await as(request(t.http).post(`/api/v1/auth/sessions/${elsewhere.sessionId}/end`), here)).status).toBe(204);
      expect((await as(request(t.http).get('/api/v1/auth/me'), elsewhere)).status).toBe(401);
      expect((await as(request(t.http).get('/api/v1/auth/me'), here)).status).toBe(200);
      const row = await t.prisma.session.findUniqueOrThrow({ where: { id: elsewhere.sessionId }, select: { endReason: true } });
      expect(row.endReason).toBe('ended_by_user');
      expect(await t.prisma.auditEvent.count({ where: { entityId: elsewhere.sessionId, action: 'auth.session.ended' } })).toBe(1);
    });

    it('refuses to end the current session, and hides other users and ended sessions behind 404', async () => {
      const user = await createUser(t.prisma, hospital, 'doctor');
      const here = await signIn(t, user);
      const current = await as(request(t.http).post(`/api/v1/auth/sessions/${here.sessionId}/end`), here);
      expect(current.status).toBe(422);
      expect(errorCode(current)).toBe('CURRENT_SESSION');

      const colleague = await signIn(t, await createUser(t.prisma, hospital, 'doctor'));
      expect((await as(request(t.http).post(`/api/v1/auth/sessions/${colleague.sessionId}/end`), here)).status).toBe(404);
      expect((await as(request(t.http).get('/api/v1/auth/me'), colleague)).status).toBe(200);

      const otherHospital = await createHospital(t.prisma);
      const stranger = await signIn(t, await createUser(t.prisma, otherHospital, 'doctor'));
      expect((await as(request(t.http).post(`/api/v1/auth/sessions/${stranger.sessionId}/end`), here)).status).toBe(404);
      expect((await as(request(t.http).post('/api/v1/auth/sessions/not-a-uuid/end'), here)).status).toBe(400);
    });

    it('ends all my other sessions at once', async () => {
      const user = await createUser(t.prisma, hospital, 'doctor');
      const here = await signIn(t, user);
      const others = [await signIn(t, user), await signIn(t, user)];
      const response = await as(request(t.http).post('/api/v1/auth/sessions/end-others'), here);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ended: 2 });
      for (const other of others) expect((await as(request(t.http).get('/api/v1/auth/me'), other)).status).toBe(401);
      expect((await as(request(t.http).get('/api/v1/auth/me'), here)).status).toBe(200);
    });

    it('needs a session', async () => {
      expect((await request(t.http).get('/api/v1/auth/sessions')).status).toBe(401);
    });
  });
});
