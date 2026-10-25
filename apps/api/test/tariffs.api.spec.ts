import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays, todayIst } from '../src/common/dates.js';
import { as, createHospital, createUser, signIn, unique, type SignedInBrowser, type TestHospital } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';

interface ErrorBody {
  error: { code: string; message: string };
}
interface ItemBody {
  id: string;
  currentRate: { ratePaise: number; taxRateBp: number; effectiveFrom: string } | null;
}
interface RateBody {
  id: string;
  ratePaise: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

function code(prefix: string): string {
  return unique(prefix).toUpperCase().slice(0, 16);
}

describe('service items and rates', () => {
  let t: TestApp;
  let hospital: TestHospital;
  let finance: SignedInBrowser;
  let clerk: SignedInBrowser;
  let otherFinance: SignedInBrowser;
  const today = todayIst();

  beforeAll(async () => {
    t = await createTestApp();
    hospital = await createHospital(t.prisma);
    const other = await createHospital(t.prisma);
    finance = await signIn(t, await createUser(t.prisma, hospital, 'accountant'));
    clerk = await signIn(t, await createUser(t.prisma, hospital, 'billing_clerk'));
    otherFinance = await signIn(t, await createUser(t.prisma, other, 'accountant'));
  });

  afterAll(async () => {
    await t.close();
  });

  const createItem = (body: Record<string, unknown>, browser = finance) =>
    as(request(t.http).post('/api/v1/service-items'), browser).send({ code: code('S'), name: 'Dressing', kind: 'procedure', ...body });

  const addRate = (itemId: string, body: Record<string, unknown>, browser = finance) =>
    as(request(t.http).post(`/api/v1/service-items/${itemId}/rates`), browser).send({ ratePaise: 20_000, taxRateBp: 0, effectiveFrom: today, ...body });

  it('finance adds an item and a rate from today, which becomes the current rate', async () => {
    const item = await createItem({});
    expect(item.status).toBe(201);
    expect((item.body as ItemBody).currentRate).toBeNull();
    const itemId = (item.body as ItemBody).id;

    const rate = await addRate(itemId, { ratePaise: 25_050, taxRateBp: 1_800 });
    expect(rate.status).toBe(201);
    expect(rate.body).toMatchObject({ ratePaise: 25_050, taxRateBp: 1_800, effectiveFrom: today, effectiveTo: null });

    const list = await as(request(t.http).get('/api/v1/service-items?kind=procedure&pageSize=100'), clerk);
    const listed = (list.body as { data: ItemBody[] }).data.find((entry) => entry.id === itemId);
    expect(listed?.currentRate).toEqual({ ratePaise: 25_050, taxRateBp: 1_800, effectiveFrom: today });
    expect(await t.prisma.auditEvent.count({ where: { entityId: itemId, action: 'tariffs.rate.created' } })).toBe(1);
  });

  it('a new rate from a later date closes the current one the day before', async () => {
    const itemId = ((await createItem({})).body as ItemBody).id;
    await addRate(itemId, { ratePaise: 10_000 });
    const nextMonth = addDays(today, 30);
    expect((await addRate(itemId, { ratePaise: 12_000, effectiveFrom: nextMonth })).status).toBe(201);

    const history = await as(request(t.http).get(`/api/v1/service-items/${itemId}/rates`), clerk);
    const rates = (history.body as { data: RateBody[] }).data;
    expect(rates.map((r) => [r.ratePaise, r.effectiveFrom, r.effectiveTo])).toEqual([
      [12_000, nextMonth, null],
      [10_000, today, addDays(nextMonth, -1)],
    ]);
    // Today the old rate still applies.
    const item = await as(request(t.http).get('/api/v1/service-items?pageSize=100&kind=procedure'), clerk);
    expect((item.body as { data: ItemBody[] }).data.find((entry) => entry.id === itemId)?.currentRate?.ratePaise).toBe(10_000);
  });

  it('refuses backdated rates and rates that would rewrite the latest one', async () => {
    const itemId = ((await createItem({})).body as ItemBody).id;
    const past = await addRate(itemId, { effectiveFrom: addDays(today, -1) });
    expect(past.status).toBe(422);
    expect((past.body as ErrorBody).error.code).toBe('RATE_DATE_INVALID');

    await addRate(itemId, { effectiveFrom: addDays(today, 10) });
    const sameDay = await addRate(itemId, { effectiveFrom: addDays(today, 10) });
    expect(sameDay.status).toBe(422);
    const earlier = await addRate(itemId, { effectiveFrom: addDays(today, 5) });
    expect(earlier.status).toBe(422);
  });

  it('keeps rate history unchangeable in the database itself', async () => {
    const itemId = ((await createItem({})).body as ItemBody).id;
    await addRate(itemId, {});
    await addRate(itemId, { effectiveFrom: addDays(today, 3) });
    const closed = await t.prisma.tariffRate.findFirstOrThrow({ where: { serviceItemId: itemId, NOT: { effectiveTo: null } } });
    await expect(t.prisma.tariffRate.update({ where: { id: closed.id }, data: { ratePaise: 1n } })).rejects.toThrow(/not allowed|Only closing/);
    await expect(t.prisma.tariffRate.delete({ where: { id: closed.id } })).rejects.toThrow(/not allowed/);
  });

  it('two rate changes for the same item at once never leave two open rates', async () => {
    const itemId = ((await createItem({})).body as ItemBody).id;
    await addRate(itemId, {});
    const results = await Promise.all([
      addRate(itemId, { ratePaise: 1, effectiveFrom: addDays(today, 7) }),
      addRate(itemId, { ratePaise: 2, effectiveFrom: addDays(today, 8) }),
    ]);
    expect(results.filter((r) => r.status === 201).length).toBeGreaterThanOrEqual(1);
    expect(await t.prisma.tariffRate.count({ where: { serviceItemId: itemId, effectiveTo: null } })).toBe(1);
  });

  it('only finance changes rates; billing reads them', async () => {
    expect((await createItem({}, clerk)).status).toBe(403);
    const itemId = ((await createItem({})).body as ItemBody).id;
    expect((await addRate(itemId, {}, clerk)).status).toBe(403);
    expect((await as(request(t.http).get(`/api/v1/service-items/${itemId}/rates`), clerk)).status).toBe(200);
  });

  it('checks what an item belongs to', async () => {
    expect((await createItem({ kind: 'procedure', doctorId: hospital.id })).status).toBe(400);
    const notFound = await createItem({ kind: 'consultation', doctorId: '0b4b6f0e-5c1d-4f7a-9d3e-2a1b0c9d8e7f' });
    expect(notFound.status).toBe(422);
    expect((notFound.body as ErrorBody).error.code).toBe('REFERENCE_INVALID');
  });

  it('another hospital item is 404', async () => {
    const theirs = ((await createItem({}, otherFinance)).body as ItemBody).id;
    expect((await addRate(theirs, {})).status).toBe(404);
    expect((await as(request(t.http).get(`/api/v1/service-items/${theirs}/rates`), clerk)).status).toBe(404);
    expect((await as(request(t.http).patch(`/api/v1/service-items/${theirs}`), finance).send({ name: 'Mine' })).status).toBe(404);
  });
});
