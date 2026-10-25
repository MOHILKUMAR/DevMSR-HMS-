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
  cancelledAt: string | null;
  cancelReason: string | null;
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
    await expect(t.prisma.tariffRate.update({ where: { id: closed.id }, data: { ratePaise: 1n } })).rejects.toThrow(/Rates are history/);
    await expect(t.owner.tariffRate.delete({ where: { id: closed.id } })).rejects.toThrow(/not allowed/);
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

  describe('cancelling a rate before it starts', () => {
    const cancel = (itemId: string, rateId: string, browser = finance, reason = 'Entered the wrong amount') =>
      as(request(t.http).post(`/api/v1/service-items/${itemId}/rates/${rateId}/cancel`), browser).send({ reason });
    const errorCode = (response: request.Response) => (response.body as ErrorBody).error.code;
    const newItem = async () => ((await createItem({})).body as ItemBody).id;

    it('cancels a scheduled rate; the current rate carries on and the record is kept', async () => {
      const itemId = await newItem();
      const current = (await addRate(itemId, { ratePaise: 30_000 })).body as RateBody;
      const scheduled = (await addRate(itemId, { ratePaise: 99_900, effectiveFrom: addDays(today, 10) })).body as RateBody;

      const response = await cancel(itemId, scheduled.id);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: scheduled.id, cancelReason: 'Entered the wrong amount' });
      expect((response.body as RateBody).cancelledAt).not.toBeNull();

      const history = (await as(request(t.http).get(`/api/v1/service-items/${itemId}/rates`), finance)).body as { data: RateBody[] };
      expect(history.data).toHaveLength(2);
      expect(history.data.find((rate) => rate.id === current.id)).toMatchObject({ effectiveTo: null, cancelledAt: null });
      expect(await t.prisma.auditEvent.count({ where: { entityId: itemId, action: 'tariffs.rate.cancelled' } })).toBe(1);

      // The corrected rate can then be scheduled for the same day.
      expect((await addRate(itemId, { ratePaise: 35_000, effectiveFrom: addDays(today, 10) })).status).toBe(201);
    });

    it('refuses a rate that has started, one followed by a later rate, and one already cancelled', async () => {
      const itemId = await newItem();
      const current = (await addRate(itemId, {})).body as RateBody;
      const first = (await addRate(itemId, { effectiveFrom: addDays(today, 5) })).body as RateBody;
      const second = (await addRate(itemId, { effectiveFrom: addDays(today, 9) })).body as RateBody;
      for (const rateId of [current.id, first.id]) {
        const response = await cancel(itemId, rateId);
        expect(response.status).toBe(422);
        expect(errorCode(response)).toBe('RATE_NOT_CANCELLABLE');
      }
      expect((await cancel(itemId, second.id)).status).toBe(200);
      expect(errorCode(await cancel(itemId, second.id))).toBe('RATE_NOT_CANCELLABLE');

      // With the later rate cancelled, the earlier scheduled one can go too, and today's rate carries on.
      expect((await cancel(itemId, first.id)).status).toBe(200);
      expect((await t.prisma.tariffRate.findUniqueOrThrow({ where: { id: current.id } })).effectiveTo).toBeNull();
    });

    it('needs a reason, the finance permission, and a rate of this hospital and item', async () => {
      const itemId = await newItem();
      await addRate(itemId, {});
      const scheduled = (await addRate(itemId, { effectiveFrom: addDays(today, 3) })).body as RateBody;
      expect((await cancel(itemId, scheduled.id, finance, ' ')).status).toBe(400);
      expect((await cancel(itemId, scheduled.id, clerk)).status).toBe(403);
      expect((await cancel(itemId, scheduled.id, otherFinance)).status).toBe(404);
      expect((await cancel(await newItem(), scheduled.id)).status).toBe(404);
      expect((await t.prisma.tariffRate.findUniqueOrThrow({ where: { id: scheduled.id } })).cancelledAt).toBeNull();
    });

    it('the database itself refuses to cancel a started rate, reopen a past one, or change a cancelled one', async () => {
      const itemId = await newItem();
      const current = (await addRate(itemId, {})).body as RateBody;
      const scheduled = (await addRate(itemId, { effectiveFrom: addDays(today, 4) })).body as RateBody;
      const cancelFields = { cancelledAt: new Date(), cancelledById: hospital.id, cancelReason: 'Direct change' };

      await expect(t.prisma.tariffRate.update({ where: { id: current.id }, data: cancelFields })).rejects.toThrow(/Rates are history/);
      expect((await cancel(itemId, scheduled.id)).status).toBe(200);
      await expect(t.prisma.tariffRate.update({ where: { id: scheduled.id }, data: { cancelReason: 'Edited' } })).rejects.toThrow(/Rates are history/);

      const past = await t.prisma.tariffRate.create({
        data: {
          hospitalId: hospital.id,
          serviceItemId: await newItem(),
          ratePaise: 1_000n,
          effectiveFrom: new Date('2026-01-01T00:00:00Z'),
          effectiveTo: new Date('2026-03-31T00:00:00Z'),
        },
      });
      await expect(t.prisma.tariffRate.update({ where: { id: past.id }, data: { effectiveTo: null } })).rejects.toThrow(/Rates are history/);
    });
  });
});
