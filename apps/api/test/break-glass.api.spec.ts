import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, createHospital, createPatient, createUser, signIn, type SignedInBrowser, type TestHospital, type TestUser } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';

interface ErrorBody {
  error: { code: string };
}

const REASON = 'Hospital asked for help with a bill that does not total correctly.';

describe('break-glass access', () => {
  let t: TestApp;
  let hospital: TestHospital;
  let otherHospital: TestHospital;
  let hospitalAdmin: TestUser;

  beforeAll(async () => {
    t = await createTestApp();
    hospital = await createHospital(t.prisma);
    otherHospital = await createHospital(t.prisma);
    hospitalAdmin = await createUser(t.prisma, hospital, 'hospital_admin');
  });

  afterAll(async () => {
    await t.close();
  });

  async function superAdmin(): Promise<{ user: TestUser; browser: SignedInBrowser }> {
    const user = await createUser(t.prisma, hospital, 'super_admin');
    return { user, browser: await signIn(t, user) };
  }

  const start = (browser: SignedInBrowser, body: object) => as(request(t.http).post('/api/v1/break-glass'), browser).send(body);

  it('opens one hospital read-only for an hour, audited, with its admins notified', async () => {
    const { user, browser } = await superAdmin();
    const patient = await createPatient(t.prisma, hospital.id);
    // Before: the super admin reaches no hospital data.
    expect((await as(request(t.http).get(`/api/v1/patients/${patient.id}`), browser)).status).toBe(403);

    const hospitals = await as(request(t.http).get('/api/v1/break-glass/hospitals'), browser);
    expect((hospitals.body as { data: { id: string }[] }).data.map((h) => h.id)).toContain(hospital.id);

    const started = await start(browser, { hospitalId: hospital.id, reason: REASON });
    expect(started.status).toBe(201);
    const grant = started.body as { id: string; expiresAt: string; createdAt: string; active: boolean; reason: string };
    expect(grant.active).toBe(true);
    expect(new Date(grant.expiresAt).getTime() - new Date(grant.createdAt).getTime()).toBe(60 * 60 * 1000);

    const me = (await as(request(t.http).get('/api/v1/auth/me'), browser)).body as {
      hospital: { id: string };
      permissions: string[];
      breakGlass: { grantId: string };
    };
    expect(me.hospital.id).toBe(hospital.id);
    expect(me.breakGlass.grantId).toBe(grant.id);
    expect(me.permissions).toContain('patients.patient.read');
    expect(me.permissions).not.toContain('patients.patient.create');

    // Reading works and is audited with the grant; writing does not.
    expect((await as(request(t.http).get(`/api/v1/patients/${patient.id}`), browser)).status).toBe(200);
    const viewed = await t.prisma.auditEvent.findFirstOrThrow({ where: { entityId: patient.id, action: 'patients.patient.viewed', actorUserId: user.id } });
    expect(viewed.hospitalId).toBe(hospital.id);
    expect(viewed.metadata).toMatchObject({ breakGlassId: grant.id });
    expect((await as(request(t.http).post('/api/v1/patients/search'), browser).send({ q: 'Test' })).status).toBe(200);
    expect((await as(request(t.http).patch(`/api/v1/patients/${patient.id}`), browser).send({ city: 'Pune' })).status).toBe(403);

    // Another hospital stays closed.
    const stranger = await createPatient(t.prisma, otherHospital.id);
    expect((await as(request(t.http).get(`/api/v1/patients/${stranger.id}`), browser)).status).toBe(404);

    expect(await t.prisma.auditEvent.count({ where: { entityId: grant.id, action: 'platform.break-glass.started', hospitalId: hospital.id } })).toBe(1);
    const notice = await t.prisma.notification.findFirstOrThrow({ where: { userId: hospitalAdmin.id, kind: 'break_glass_started' } });
    expect(notice.metadata).toMatchObject({ grantId: grant.id });
  });

  it('notifies only admins of the hospital opened', async () => {
    const otherAdmin = await createUser(t.prisma, otherHospital, 'hospital_admin');
    const { browser } = await superAdmin();
    const grant = (await start(browser, { hospitalId: hospital.id, reason: REASON })).body as { id: string };
    expect(await t.prisma.notification.count({ where: { userId: otherAdmin.id, metadata: { path: ['grantId'], equals: grant.id } } })).toBe(0);
    const nurse = await createUser(t.prisma, hospital, 'nurse');
    expect(await t.prisma.notification.count({ where: { userId: nurse.id } })).toBe(0);
  });

  it('keeps the super admin\'s own account and sessions working during break-glass', async () => {
    const { browser } = await superAdmin();
    await start(browser, { hospitalId: hospital.id, reason: REASON });
    const sessions = (await as(request(t.http).get('/api/v1/auth/sessions'), browser)).body as { data: { id: string }[] };
    expect(sessions.data.map((s) => s.id)).toContain(browser.sessionId);
  });

  it('ends early on request, or with the session', async () => {
    const { browser } = await superAdmin();
    const grant = (await start(browser, { hospitalId: hospital.id, reason: REASON })).body as { id: string };
    expect((await as(request(t.http).post('/api/v1/break-glass/current/end'), browser)).status).toBe(204);
    const me = (await as(request(t.http).get('/api/v1/auth/me'), browser)).body as { hospital: unknown; breakGlass: unknown };
    expect(me).toMatchObject({ hospital: null, breakGlass: null });
    expect(await t.prisma.auditEvent.count({ where: { entityId: grant.id, action: 'platform.break-glass.ended' } })).toBe(1);
    expect((await as(request(t.http).post('/api/v1/break-glass/current/end'), browser)).status).toBe(404);

    const second = await superAdmin();
    const secondGrant = (await start(second.browser, { hospitalId: hospital.id, reason: REASON })).body as { id: string };
    await as(request(t.http).post('/api/v1/auth/logout'), second.browser).expect(204);
    const row = await t.prisma.breakGlassGrant.findUniqueOrThrow({ where: { id: secondGrant.id } });
    expect(row.endedAt).not.toBeNull();
  });

  it('stops working after an hour', async () => {
    const { user, browser } = await superAdmin();
    await t.prisma.breakGlassGrant.create({
      data: {
        userId: user.id,
        sessionId: browser.sessionId,
        hospitalId: hospital.id,
        reason: REASON,
        createdAt: new Date(Date.now() - 61 * 60_000),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const me = (await as(request(t.http).get('/api/v1/auth/me'), browser)).body as { hospital: unknown };
    expect(me.hospital).toBeNull();
  });

  it('needs a reason of 20 or more characters, an active hospital, and one grant at a time', async () => {
    const { browser } = await superAdmin();
    expect((await start(browser, { hospitalId: hospital.id, reason: 'help' })).status).toBe(400);
    expect((await start(browser, { hospitalId: '00000000-0000-7000-8000-000000000000', reason: REASON })).status).toBe(404);
    expect((await start(browser, { hospitalId: hospital.id, reason: REASON })).status).toBe(201);
    const again = await start(browser, { hospitalId: otherHospital.id, reason: REASON });
    expect(again.status).toBe(409);
    expect((again.body as ErrorBody).error.code).toBe('BREAK_GLASS_ACTIVE');
  });

  it('is for super admins only', async () => {
    const admin = await signIn(t, hospitalAdmin);
    expect((await start(admin, { hospitalId: hospital.id, reason: REASON })).status).toBe(403);
  });

  it("shows a hospital's admins its own break-glass history with the reason", async () => {
    const { user, browser } = await superAdmin();
    const grant = (await start(browser, { hospitalId: hospital.id, reason: REASON })).body as { id: string };
    const admin = await signIn(t, hospitalAdmin);
    const history = await as(request(t.http).get('/api/v1/break-glass?pageSize=100'), admin);
    expect(history.status).toBe(200);
    const rows = (history.body as { data: { id: string; reason: string; user: { id: string } }[] }).data;
    expect(rows.find((row) => row.id === grant.id)).toMatchObject({ reason: REASON, user: { id: user.id } });

    const otherAdmin = await signIn(t, await createUser(t.prisma, otherHospital, 'hospital_admin'));
    const elsewhere = (await as(request(t.http).get('/api/v1/break-glass?pageSize=100'), otherAdmin)).body as { data: { id: string }[] };
    expect(elsewhere.data.map((row) => row.id)).not.toContain(grant.id);
  });

  it('keeps grants: only ending one early is allowed, even for the table owner', async () => {
    const { browser } = await superAdmin();
    const grant = (await start(browser, { hospitalId: hospital.id, reason: REASON })).body as { id: string };
    await expect(t.owner.breakGlassGrant.update({ where: { id: grant.id }, data: { reason: 'changed reason, long enough' } })).rejects.toThrow(/not allowed/);
    await expect(t.owner.breakGlassGrant.delete({ where: { id: grant.id } })).rejects.toThrow(/not allowed/);
  });
});
