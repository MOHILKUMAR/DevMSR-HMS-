import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonymousBrowser, as, createHospital, createUser, unique, type TestHospital } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';

// The threshold is lowered here, so a handful of failures crosses it. The real value is 20 in 10
// minutes (CLAUDE.md section 9), kept in config.
const THRESHOLD = 3;

describe('failed sign-in alert', () => {
  let t: TestApp;
  let hospital: TestHospital;

  beforeAll(async () => {
    t = await createTestApp({ env: { ALERT_FAILED_LOGINS_THRESHOLD: String(THRESHOLD), RATE_LIMIT_LOGIN_PER_MINUTE: '1000' } });
    hospital = await createHospital(t.prisma);
  });

  afterAll(async () => {
    await t.close();
  });

  async function failSignIn(username: string): Promise<void> {
    const browser = await anonymousBrowser(t.http);
    const response = await as(request(t.http).post('/api/v1/auth/login'), browser).send({ username, password: 'not-the-password' });
    expect(response.status).toBe(401);
  }

  it("raises one alert for a hospital when its failures pass the threshold, and tells that hospital's admins", async () => {
    const admin = await createUser(t.prisma, hospital, 'hospital_admin');
    // Different users, so no account reaches the lockout.
    const staff = await Promise.all([1, 2, 3, 4, 5].map(() => createUser(t.prisma, hospital, 'nurse')));
    const before = new Date();
    for (const user of staff.slice(0, THRESHOLD)) await failSignIn(user.username);
    expect(await t.prisma.securityAlert.count({ where: { hospitalId: hospital.id } })).toBe(0);

    await failSignIn(staff[THRESHOLD]?.username ?? '');
    const alerts = await t.prisma.securityAlert.findMany({ where: { hospitalId: hospital.id } });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.count).toBe(THRESHOLD + 1);
    expect(await t.prisma.auditEvent.count({ where: { hospitalId: hospital.id, action: 'security.failed-logins.alerted' } })).toBe(1);
    const notice = await t.prisma.notification.findFirstOrThrow({ where: { userId: admin.id, kind: 'failed_logins' } });
    expect(notice.metadata).toMatchObject({ failures: THRESHOLD + 1, windowMinutes: 10, scope: 'hospital' });

    // More failures in the same window raise no second alert.
    await failSignIn(staff[4]?.username ?? '');
    expect(await t.prisma.securityAlert.count({ where: { hospitalId: hospital.id, createdAt: { gte: before } } })).toBe(1);
  });

  // Other test files fail sign-ins in parallel on the same database, and one platform alert per
  // window covers them all, so this only checks that one exists. Who it notifies is a unit test.
  it('raises a platform alert for failures across hospitals and unknown usernames', async () => {
    const windowStart = new Date(Date.now() - 10 * 60_000);
    for (let i = 0; i <= THRESHOLD; i += 1) await failSignIn(unique('nobody'));
    const platform = await t.prisma.securityAlert.findFirstOrThrow({ where: { hospitalId: null, createdAt: { gte: windowStart } } });
    expect(platform.count).toBeGreaterThan(THRESHOLD);
  });

  it('keeps alerts as history: no change or delete, even for the table owner', async () => {
    const alert = await t.prisma.securityAlert.create({ data: { kind: 'failed_logins', hospitalId: hospital.id, count: 99 } });
    await expect(t.prisma.securityAlert.update({ where: { id: alert.id }, data: { count: 1 } })).rejects.toThrow(/permission denied/);
    await expect(t.owner.securityAlert.update({ where: { id: alert.id }, data: { count: 1 } })).rejects.toThrow(/not allowed/);
    await expect(t.owner.securityAlert.delete({ where: { id: alert.id } })).rejects.toThrow(/not allowed/);
  });
});
