import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonymousBrowser,
  as,
  createHospital,
  createUser,
  signIn,
  signInChangingPassword,
  unique,
  type SignedInBrowser,
  type TestHospital,
} from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}
interface StaffUserBody {
  id: string;
  username: string;
  displayName: string;
  isActive: boolean;
  locked: boolean;
  mustChangePassword: boolean;
  roles: { code: string; name: string }[];
}

const PASSWORD = 'new-staff-Passw0rd';

describe('staff users', () => {
  let t: TestApp;
  let hospital: TestHospital;
  let otherHospital: TestHospital;
  let admin: SignedInBrowser;
  let adminId: string;

  beforeAll(async () => {
    t = await createTestApp({ env: { RATE_LIMIT_LOGIN_PER_MINUTE: '100' } });
    hospital = await createHospital(t.prisma);
    otherHospital = await createHospital(t.prisma);
    const adminUser = await createUser(t.prisma, hospital, 'hospital_admin');
    adminId = adminUser.id;
    admin = await signIn(t, adminUser);
  });

  afterAll(async () => {
    await t.close();
  });

  const createStaff = (roleCodes: string[] = ['cashier'], username = unique('staff')) =>
    as(request(t.http).post('/api/v1/users'), admin).send({ username, displayName: 'New Cashier', password: PASSWORD, roleCodes });

  async function login(username: string, password: string): Promise<request.Response> {
    const browser = await anonymousBrowser(t.http);
    return as(request(t.http).post('/api/v1/auth/login'), browser).send({ username, password });
  }

  it('lists only this hospital staff, never platform users', async () => {
    await createUser(t.prisma, otherHospital, 'nurse');
    await createUser(t.prisma, hospital, 'super_admin');
    const response = await as(request(t.http).get('/api/v1/users?pageSize=100'), admin);
    expect(response.status).toBe(200);
    const body = response.body as { data: StaffUserBody[]; total: number };
    expect(body.data.map((user) => user.id)).toContain(adminId);
    const ids = new Set(body.data.map((user) => user.id));
    const others = await t.prisma.user.findMany({ where: { OR: [{ hospitalId: otherHospital.id }, { kind: 'platform' }] }, select: { id: true } });
    for (const other of others) expect(ids.has(other.id)).toBe(false);
  });

  it('lists only the users holding a permission, such as doctor logins', async () => {
    const doctor = await createUser(t.prisma, hospital, 'doctor');
    const nurse = await createUser(t.prisma, hospital, 'nurse');
    const response = await as(request(t.http).get('/api/v1/users?pageSize=100&permission=opd.queue.read-own'), admin);
    expect(response.status).toBe(200);
    const ids = (response.body as { data: StaffUserBody[] }).data.map((user) => user.id);
    expect(ids).toContain(doctor.id);
    expect(ids).not.toContain(nurse.id);
    expect(ids).not.toContain(adminId);
    expect((await as(request(t.http).get('/api/v1/users?permission=DROP TABLE'), admin)).status).toBe(400);
  });

  it('refuses without a session and without the permission', async () => {
    expect((await request(t.http).get('/api/v1/users')).status).toBe(401);
    const accountant = await signIn(t, await createUser(t.prisma, hospital, 'accountant'));
    expect((await as(request(t.http).get('/api/v1/users'), accountant)).status).toBe(403);
  });

  it('creates a staff user who can then sign in with the roles given', async () => {
    const username = unique('Cashier').toUpperCase();
    const created = await createStaff(['cashier'], username);
    expect(created.status).toBe(201);
    const body = created.body as StaffUserBody;
    expect(body.username).toBe(username.toLowerCase());
    expect(body.roles.map((role) => role.code)).toEqual(['cashier']);
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|argon2|"password"/);

    expect(body.mustChangePassword).toBe(true);

    // The admin chose the first password, so sign-in asks for the user's own before any session.
    const first = await login(username.toLowerCase(), PASSWORD);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ status: 'challenge', step: 'change_password' });
    const signedIn = await signInChangingPassword(t.http, username.toLowerCase(), PASSWORD, 'own-chosen-Passw0rd');
    expect(signedIn.status).toBe(200);
    expect(signedIn.body).toMatchObject({ status: 'signed_in' });
    expect((signedIn.body as { permissions: string[] }).permissions).toContain('payments.receipt.create');
    expect((await login(username.toLowerCase(), 'own-chosen-Passw0rd')).body).toMatchObject({ status: 'signed_in' });
    expect(await t.prisma.auditEvent.count({ where: { entityId: body.id, action: 'users.user.created' } })).toBe(1);
  });

  it('rejects a taken username, a short password and unknown or platform roles', async () => {
    const username = unique('dup');
    expect((await createStaff(['cashier'], username)).status).toBe(201);
    const duplicate = await createStaff(['cashier'], username);
    expect(duplicate.status).toBe(409);

    const short = await as(request(t.http).post('/api/v1/users'), admin).send({ username: unique('x'), displayName: 'X Y', password: 'short', roleCodes: ['nurse'] });
    expect(short.status).toBe(400);

    for (const roleCodes of [['no_such_role'], ['super_admin']]) {
      const response = await createStaff(roleCodes);
      expect(response.status).toBe(422);
      expect((response.body as ErrorBody).error.code).toBe('ROLE_NOT_ASSIGNABLE');
    }
  });

  it('changes name and roles, and the new permissions apply at once', async () => {
    const user = await createUser(t.prisma, hospital, 'nurse');
    const browser = await signIn(t, user);
    const response = await as(request(t.http).patch(`/api/v1/users/${user.id}`), admin).send({ displayName: 'Renamed Nurse', roleCodes: ['nurse', 'receptionist'] });
    expect(response.status).toBe(200);
    expect((response.body as StaffUserBody).displayName).toBe('Renamed Nurse');
    const me = await as(request(t.http).get('/api/v1/auth/me'), browser);
    expect((me.body as { permissions: string[] }).permissions).toContain('patients.patient.create');
  });

  it('deactivating a user ends their sessions', async () => {
    const user = await createUser(t.prisma, hospital, 'nurse');
    const browser = await signIn(t, user);
    const response = await as(request(t.http).patch(`/api/v1/users/${user.id}`), admin).send({ isActive: false });
    expect(response.status).toBe(200);
    expect((await as(request(t.http).get('/api/v1/auth/me'), browser)).status).toBe(401);
  });

  it('stops an admin changing their own roles, status or password', async () => {
    const roles = await as(request(t.http).patch(`/api/v1/users/${adminId}`), admin).send({ roleCodes: ['md'] });
    expect(roles.status).toBe(422);
    expect((roles.body as ErrorBody).error.code).toBe('SELF_CHANGE_NOT_ALLOWED');
    expect((await as(request(t.http).patch(`/api/v1/users/${adminId}`), admin).send({ isActive: false })).status).toBe(422);
    expect((await as(request(t.http).post(`/api/v1/users/${adminId}/password`), admin).send({ password: PASSWORD })).status).toBe(422);
    // Renaming oneself is fine.
    expect((await as(request(t.http).patch(`/api/v1/users/${adminId}`), admin).send({ displayName: 'Admin Renamed' })).status).toBe(200);
  });

  it('returns 404 for another hospital user', async () => {
    const foreign = await createUser(t.prisma, otherHospital, 'nurse');
    const update = await as(request(t.http).patch(`/api/v1/users/${foreign.id}`), admin).send({ displayName: 'Taken Over' });
    expect(update.status).toBe(404);
    const password = await as(request(t.http).post(`/api/v1/users/${foreign.id}/password`), admin).send({ password: PASSWORD });
    expect(password.status).toBe(404);
  });

  it('setting a password unlocks the account, ends old sessions and lets the new password in', async () => {
    const user = await createUser(t.prisma, hospital, 'billing_clerk');
    const browser = await signIn(t, user);
    await t.prisma.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() + 60_000), failedLoginCount: 0 } });

    const response = await as(request(t.http).post(`/api/v1/users/${user.id}/password`), admin).send({ password: PASSWORD });
    expect(response.status).toBe(204);
    expect((await as(request(t.http).get('/api/v1/auth/me'), browser)).status).toBe(401);
    const next = await login(user.username, PASSWORD);
    expect(next.status).toBe(200);
    expect(next.body).toMatchObject({ status: 'challenge', step: 'change_password' });
    expect(await t.prisma.auditEvent.count({ where: { entityId: user.id, action: 'users.user.password-set' } })).toBe(1);
  });

  it('allows 3 password resets of one account per hour, then 429', async () => {
    const user = await createUser(t.prisma, hospital, 'nurse');
    const other = await createUser(t.prisma, hospital, 'nurse');
    const reset = (id: string) => as(request(t.http).post(`/api/v1/users/${id}/password`), admin).send({ password: PASSWORD });
    for (let attempt = 0; attempt < 3; attempt += 1) expect((await reset(user.id)).status).toBe(204);
    const limited = await reset(user.id);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(60);
    // Another account has its own budget.
    expect((await reset(other.id)).status).toBe(204);
  });

  it('lists the hospital roles with their permission codes', async () => {
    const response = await as(request(t.http).get('/api/v1/roles'), admin);
    expect(response.status).toBe(200);
    const roles = (response.body as { data: { code: string; permissions: string[] }[] }).data;
    expect(roles.map((role) => role.code)).toContain('cashier');
    expect(roles.map((role) => role.code)).not.toContain('super_admin');
    expect(roles.find((role) => role.code === 'cashier')?.permissions).toContain('payments.shift.manage-own');
  });
});
