import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_IDLE_TIMEOUT_MS } from '../src/auth/sessions.service.js';
import { sha256Hex } from '../src/common/crypto/tokens.js';
import {
  anonymousBrowser,
  as,
  cookiePairs,
  createHospital,
  createUser,
  signIn,
  TEST_PASSWORD,
  type Browser,
  type TestHospital,
} from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

function errorCode(response: request.Response): string {
  return (response.body as ErrorBody).error.code;
}

async function login(http: Server, username: string, password = TEST_PASSWORD, browser?: Browser): Promise<request.Response> {
  const from = browser ?? (await anonymousBrowser(http));
  return as(request(http).post('/api/v1/auth/login'), from).send({ username, password });
}

function setCookieLine(response: request.Response, name: string): string {
  const header = response.headers['set-cookie'] as string[] | undefined;
  const line = header?.find((value) => value.startsWith(`${name}=`));
  if (line === undefined) throw new Error(`No Set-Cookie for ${name}`);
  return line;
}

describe('auth', () => {
  let t: TestApp;
  let hospital: TestHospital;

  beforeAll(async () => {
    // Login limit raised so lockout tests can make more than 5 attempts; the limit has its own test below.
    t = await createTestApp({ env: { RATE_LIMIT_LOGIN_PER_MINUTE: '100' } });
    hospital = await createHospital(t.prisma);
  });

  afterAll(async () => {
    await t.close();
  });

  describe('GET /auth/csrf', () => {
    it('issues a pre-login token and sets a readable CSRF cookie', async () => {
      const response = await request(t.http).get('/api/v1/auth/csrf').expect(200);
      const { csrfToken } = response.body as { csrfToken: string };
      expect(csrfToken).toMatch(/^[\w-]+\.[\w-]+$/);
      const cookie = setCookieLine(response, 'hms_csrf');
      expect(cookie).toContain(`hms_csrf=${csrfToken}`);
      expect(cookie).not.toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
    });
  });

  describe('POST /auth/login', () => {
    it('signs in, sets an httpOnly session cookie and returns the profile without secrets', async () => {
      const user = await createUser(t.prisma, hospital, 'receptionist');
      const response = await login(t.http, user.username.toUpperCase());
      expect(response.status).toBe(200);

      const body = response.body as { user: { id: string; username: string }; hospital: { id: string }; permissions: string[]; csrfToken: string };
      expect(body.user).toMatchObject({ id: user.id, username: user.username });
      expect(body.hospital.id).toBe(hospital.id);
      expect(body.permissions).toContain('patients.patient.create');
      expect(body.permissions).not.toContain('billing.invoice.issue');
      expect(JSON.stringify(body)).not.toMatch(/passwordHash|argon2/);

      const session = setCookieLine(response, 'hms_session');
      expect(session).toMatch(/HttpOnly/i);
      expect(session).toMatch(/SameSite=Lax/i);
      expect(session).not.toMatch(/Max-Age|Expires/i);
      expect(setCookieLine(response, 'hms_csrf')).toContain(body.csrfToken);
    });

    it('records the login and writes an audit event', async () => {
      const user = await createUser(t.prisma, hospital, 'nurse');
      expect((await login(t.http, user.username)).status).toBe(200);
      const events = await t.prisma.loginEvent.findMany({ where: { userId: user.id } });
      expect(events.map((e) => e.outcome)).toEqual(['succeeded']);
      const audit = await t.prisma.auditEvent.findMany({ where: { actorUserId: user.id, action: 'auth.session.created' } });
      expect(audit).toHaveLength(1);
    });

    it('requires the CSRF header and cookie to match', async () => {
      const user = await createUser(t.prisma, hospital, 'nurse');
      const noCsrf = await request(t.http).post('/api/v1/auth/login').send({ username: user.username, password: TEST_PASSWORD });
      expect(noCsrf.status).toBe(403);
      expect(errorCode(noCsrf)).toBe('CSRF_FAILED');

      const browser = await anonymousBrowser(t.http);
      const otherToken = (await anonymousBrowser(t.http)).csrfToken;
      const mismatch = await request(t.http)
        .post('/api/v1/auth/login')
        .set('Cookie', browser.cookie)
        .set('X-CSRF-Token', otherToken)
        .send({ username: user.username, password: TEST_PASSWORD });
      expect(mismatch.status).toBe(403);
    });

    it('returns 400 with field details for invalid input', async () => {
      const browser = await anonymousBrowser(t.http);
      const response = await as(request(t.http).post('/api/v1/auth/login'), browser).send({ username: '' });
      expect(response.status).toBe(400);
      const body = response.body as ErrorBody;
      expect(body.error.code).toBe('VALIDATION_FAILED');
      expect(body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ location: 'body', path: 'username' }),
          expect.objectContaining({ location: 'body', path: 'password' }),
        ]),
      );
    });

    it('gives the same answer for a wrong password and an unknown username', async () => {
      const user = await createUser(t.prisma, hospital, 'cashier');
      const wrong = await login(t.http, user.username, 'not-the-password');
      const unknown = await login(t.http, 'nobody-by-this-name');
      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(wrong.body).toEqual(unknown.body);
      expect(errorCode(wrong)).toBe('LOGIN_FAILED');

      const events = await t.prisma.loginEvent.findMany({ where: { username: { in: [user.username, 'nobody-by-this-name'] } } });
      expect(events.map((e) => e.outcome).sort()).toEqual(['unknown_user', 'wrong_password']);
    });

    it('locks the account for 15 minutes after 5 failed attempts', async () => {
      const user = await createUser(t.prisma, hospital, 'billing_clerk');
      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect((await login(t.http, user.username, 'wrong')).status).toBe(401);
      }
      const locked = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(locked.lockedUntil).not.toBeNull();
      const lockMinutes = ((locked.lockedUntil?.getTime() ?? 0) - Date.now()) / 60_000;
      expect(lockMinutes).toBeGreaterThan(14);
      expect(lockMinutes).toBeLessThanOrEqual(15);

      // Even the right password is refused while locked.
      const whileLocked = await login(t.http, user.username);
      expect(whileLocked.status).toBe(401);
      const outcomes = (await t.prisma.loginEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } })).map((e) => e.outcome);
      expect(outcomes.at(-1)).toBe('locked');
      expect(await t.prisma.auditEvent.count({ where: { entityId: user.id, action: 'auth.account.locked' } })).toBe(1);

      // After the lock expires, the right password works and the counter resets.
      await t.prisma.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
      expect((await login(t.http, user.username)).status).toBe(200);
      const after = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.failedLoginCount).toBe(0);
      expect(after.lockedUntil).toBeNull();
    });

    it('refuses an inactive user', async () => {
      const user = await createUser(t.prisma, hospital, 'doctor', { isActive: false });
      expect((await login(t.http, user.username)).status).toBe(401);
    });

    it('starts a new session at every login and ends the old one', async () => {
      const user = await createUser(t.prisma, hospital, 'doctor');
      const first = await login(t.http, user.username);
      const browser: Browser = { cookie: cookiePairs(first).join('; '), csrfToken: (first.body as { csrfToken: string }).csrfToken };
      const second = await login(t.http, user.username, TEST_PASSWORD, browser);
      expect(second.status).toBe(200);

      const sessions = await t.prisma.session.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } });
      expect(sessions).toHaveLength(2);
      expect(sessions[0]?.endReason).toBe('replaced');
      expect(sessions[1]?.endedAt).toBeNull();
    });

    it('stores only a hash of the session token', async () => {
      const user = await createUser(t.prisma, hospital, 'nurse');
      const response = await login(t.http, user.username);
      const token = cookiePairs(response).find((pair) => pair.startsWith('hms_session='))?.split('=')[1] ?? '';
      const stored = await t.prisma.session.findFirstOrThrow({ where: { userId: user.id } });
      expect(stored.tokenHash).toBe(sha256Hex(token));
      expect(await t.prisma.session.count({ where: { tokenHash: token } })).toBe(0);
    });
  });

  describe('GET /auth/me', () => {
    it('returns 401 without a session', async () => {
      const response = await request(t.http).get('/api/v1/auth/me');
      expect(response.status).toBe(401);
      expect(errorCode(response)).toBe('UNAUTHENTICATED');
    });

    it('returns the signed-in user', async () => {
      const user = await createUser(t.prisma, hospital, 'md');
      const browser = await signIn(t, user);
      const response = await as(request(t.http).get('/api/v1/auth/me'), browser);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        user: { id: user.id, kind: 'staff' },
        hospital: { id: hospital.id, code: hospital.code },
        session: { idleTimeoutSeconds: 900 },
      });
    });

    it('ends a session idle for 15 minutes', async () => {
      const user = await createUser(t.prisma, hospital, 'md');
      const browser = await signIn(t, user);
      await t.prisma.session.update({
        where: { id: browser.sessionId },
        data: { lastSeenAt: new Date(Date.now() - SESSION_IDLE_TIMEOUT_MS - 1000) },
      });
      const response = await as(request(t.http).get('/api/v1/auth/me'), browser);
      expect(response.status).toBe(401);
      expect(errorCode(response)).toBe('SESSION_EXPIRED');
      expect((await t.prisma.session.findUniqueOrThrow({ where: { id: browser.sessionId } })).endReason).toBe('idle_timeout');
    });

    it('ends a session past its 12 hour maximum', async () => {
      const user = await createUser(t.prisma, hospital, 'md');
      const browser = await signIn(t, user);
      await t.prisma.session.update({ where: { id: browser.sessionId }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const response = await as(request(t.http).get('/api/v1/auth/me'), browser);
      expect(errorCode(response)).toBe('SESSION_EXPIRED');
      expect((await t.prisma.session.findUniqueOrThrow({ where: { id: browser.sessionId } })).endReason).toBe('max_age');
    });

    it('rejects the session of a user deactivated after sign-in', async () => {
      const user = await createUser(t.prisma, hospital, 'nurse');
      const browser = await signIn(t, user);
      await t.prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
      expect((await as(request(t.http).get('/api/v1/auth/me'), browser)).status).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('ends the session, clears cookies and writes an audit event', async () => {
      const user = await createUser(t.prisma, hospital, 'cashier');
      const browser = await signIn(t, user);
      const response = await as(request(t.http).post('/api/v1/auth/logout'), browser);
      expect(response.status).toBe(204);
      expect(setCookieLine(response, 'hms_session')).toMatch(/Expires=Thu, 01 Jan 1970/);

      const session = await t.prisma.session.findUniqueOrThrow({ where: { id: browser.sessionId } });
      expect(session.endReason).toBe('logout');
      expect(await t.prisma.auditEvent.count({ where: { entityId: browser.sessionId, action: 'auth.session.ended' } })).toBe(1);
      expect((await as(request(t.http).get('/api/v1/auth/me'), browser)).status).toBe(401);
    });

    it('needs a CSRF token bound to this session', async () => {
      const user = await createUser(t.prisma, hospital, 'cashier');
      const browser = await signIn(t, user);
      const other = await signIn(t, user);
      const response = await request(t.http)
        .post('/api/v1/auth/logout')
        .set('Cookie', `${browser.cookie.split(';')[0] ?? ''}; hms_csrf=${other.csrfToken}`)
        .set('X-CSRF-Token', other.csrfToken);
      expect(response.status).toBe(403);
      expect(errorCode(response)).toBe('CSRF_FAILED');
    });
  });
});

describe('rate limits', () => {
  it('allows 5 login attempts per minute per username and IP, then 429 with Retry-After', async () => {
    const t = await createTestApp();
    try {
      const hospital = await createHospital(t.prisma);
      const user = await createUser(t.prisma, hospital, 'nurse');
      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect((await login(t.http, user.username, 'wrong')).status).toBe(401);
      }
      const limited = await login(t.http, user.username, 'wrong');
      expect(limited.status).toBe(429);
      expect(errorCode(limited)).toBe('RATE_LIMITED');
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);

      // Another username from the same IP is not affected.
      const other = await createUser(t.prisma, hospital, 'nurse');
      expect((await login(t.http, other.username)).status).toBe(200);
    } finally {
      await t.close();
    }
  });

  it('limits general API use per signed-in session', async () => {
    const t = await createTestApp({ env: { RATE_LIMIT_API_PER_MINUTE: '5' } });
    try {
      const hospital = await createHospital(t.prisma);
      const first = await signIn(t, await createUser(t.prisma, hospital, 'nurse'));
      for (let i = 0; i < 5; i += 1) {
        expect((await as(request(t.http).get('/api/v1/auth/me'), first)).status).toBe(200);
      }
      const limited = await as(request(t.http).get('/api/v1/auth/me'), first);
      expect(limited.status).toBe(429);
      expect(limited.headers['retry-after']).toBeDefined();

      // A colleague's session has its own budget.
      const second = await signIn(t, await createUser(t.prisma, hospital, 'nurse'));
      expect((await as(request(t.http).get('/api/v1/auth/me'), second)).status).toBe(200);
    } finally {
      await t.close();
    }
  });
});
