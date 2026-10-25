import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonymousBrowser, as, createHospital, createUser, signIn, type TestHospital, type TestUser } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('notifications', () => {
  let t: TestApp;
  let hospital: TestHospital;

  beforeAll(async () => {
    t = await createTestApp();
    hospital = await createHospital(t.prisma);
  });

  afterAll(async () => {
    await t.close();
  });

  async function notify(user: TestUser, count: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const row = await t.prisma.notification.create({
        data: { userId: user.id, hospitalId: user.hospitalId, kind: 'failed_logins', metadata: { failures: 21 + i, windowMinutes: 10 } },
      });
      ids.push(row.id);
    }
    return ids;
  }

  it('lists only my own, newest first, with the unread count', async () => {
    const me = await createUser(t.prisma, hospital, 'hospital_admin');
    const colleague = await createUser(t.prisma, hospital, 'hospital_admin');
    await notify(me, 3);
    await notify(colleague, 2);
    const browser = await signIn(t, me);

    const list = await as(request(t.http).get('/api/v1/notifications'), browser);
    expect(list.status).toBe(200);
    const body = list.body as { data: { kind: string; details: { failures: number }; readAt: string | null }[]; total: number };
    expect(body.total).toBe(3);
    expect(body.data.map((n) => n.details.failures)).toEqual([23, 22, 21]);
    expect((await as(request(t.http).get('/api/v1/notifications/unread-count'), browser)).body).toEqual({ unread: 3 });
  });

  it('marks one or all read, and hides other users\' behind 404', async () => {
    const me = await createUser(t.prisma, hospital, 'md');
    const [first] = await notify(me, 2);
    const colleague = await createUser(t.prisma, hospital, 'md');
    const [theirs] = await notify(colleague, 1);
    const browser = await signIn(t, me);

    expect((await as(request(t.http).post(`/api/v1/notifications/${first}/read`), browser)).status).toBe(204);
    expect((await as(request(t.http).post(`/api/v1/notifications/${first}/read`), browser)).status).toBe(204);
    expect((await as(request(t.http).get('/api/v1/notifications/unread-count'), browser)).body).toEqual({ unread: 1 });
    expect((await as(request(t.http).get('/api/v1/notifications?unread=true'), browser)).body).toMatchObject({ total: 1 });

    expect((await as(request(t.http).post(`/api/v1/notifications/${theirs}/read`), browser)).status).toBe(404);
    expect((await as(request(t.http).post(`/api/v1/notifications/${randomUUID()}/read`), browser)).status).toBe(404);

    expect((await as(request(t.http).post('/api/v1/notifications/read-all'), browser)).body).toEqual({ updated: 1 });
    expect((await as(request(t.http).get('/api/v1/notifications/unread-count'), browser)).body).toEqual({ unread: 0 });
    const colleagueRow = await t.prisma.notification.findUniqueOrThrow({ where: { id: theirs } });
    expect(colleagueRow.readAt).toBeNull();
  });

  it('needs a session, and keeps rows: reading once is the only change, even for the table owner', async () => {
    expect((await request(t.http).get('/api/v1/notifications')).status).toBe(401);
    const anonymous = await anonymousBrowser(t.http);
    expect((await as(request(t.http).post('/api/v1/notifications/read-all'), anonymous)).status).toBe(401);

    const me = await createUser(t.prisma, hospital, 'nurse');
    const [id] = await notify(me, 1);
    await expect(t.owner.notification.update({ where: { id }, data: { kind: 'break_glass_started' } })).rejects.toThrow(/not allowed/);
    await expect(t.owner.notification.delete({ where: { id } })).rejects.toThrow(/not allowed/);
  });
});
