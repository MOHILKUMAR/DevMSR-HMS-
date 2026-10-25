import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthContext } from '../src/auth/auth-context.js';
import { financialYearOf, todayIst } from '../src/common/dates.js';
import { IpdChargesService } from '../src/ipd/ipd-charges.service.js';
import { IpdService } from '../src/ipd/ipd.service.js';
import { as, createHospital, createPatient, createUser, signIn, unique, type SignedInBrowser, type TestHospital, type TestUser } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';

interface ErrorBody {
  error: { code: string };
}
interface AdmissionBody {
  id: string;
  number: string;
  bed: { id: string; code: string } | null;
  advanceShort: boolean;
  dailyCharges: { chargeDate: string; kind: string; amountPaise: number }[];
}
interface BoardBody {
  wards: { id: string; beds: { id: string; status: string; occupant: { admissionId: string } | null }[] }[];
}

const DAY = 24 * 60 * 60 * 1000;

describe('IPD: admissions, beds, transfers and the midnight room and nursing charges', () => {
  let t: TestApp;
  let hospital: TestHospital;
  let receptionUser: TestUser;
  let reception: SignedInBrowser;
  let nurse: SignedInBrowser;
  let finance: SignedInBrowser;
  let clerk: SignedInBrowser;
  let outsider: SignedInBrowser;
  let doctorId: string;
  let general: { categoryId: string; beds: string[] };
  let icu: { categoryId: string; beds: string[] };
  let noRates: { categoryId: string; beds: string[] };

  async function category(name: string, bedCount: number, rates: { room: bigint; nursing: bigint } | null) {
    const roomCategory = await t.prisma.roomCategory.create({ data: { hospitalId: hospital.id, code: unique('RC').toUpperCase().slice(0, 16), name } });
    const ward = await t.prisma.ward.create({
      data: { hospitalId: hospital.id, branchId: hospital.branchId, roomCategoryId: roomCategory.id, code: unique('W').toUpperCase().slice(0, 16), name: `${name} ward` },
    });
    const beds: string[] = [];
    for (let i = 1; i <= bedCount; i += 1) beds.push((await t.prisma.bed.create({ data: { hospitalId: hospital.id, wardId: ward.id, code: `B${String(i)}` } })).id);
    if (rates !== null) {
      for (const [kind, ratePaise] of [
        ['room', rates.room],
        ['nursing', rates.nursing],
      ] as const) {
        const item = await t.prisma.serviceItem.create({
          data: { hospitalId: hospital.id, code: unique('SI').toUpperCase().slice(0, 16), name: `${name} ${kind}`, kind, roomCategoryId: roomCategory.id },
        });
        await t.prisma.tariffRate.create({ data: { hospitalId: hospital.id, serviceItemId: item.id, ratePaise, taxRateBp: 0, effectiveFrom: new Date('2026-01-01T00:00:00Z') } });
      }
    }
    return { categoryId: roomCategory.id, beds };
  }

  beforeAll(async () => {
    t = await createTestApp();
    hospital = await createHospital(t.prisma);
    const other = await createHospital(t.prisma);
    receptionUser = await createUser(t.prisma, hospital, 'receptionist');
    reception = await signIn(t, receptionUser);
    nurse = await signIn(t, await createUser(t.prisma, hospital, 'nurse'));
    finance = await signIn(t, await createUser(t.prisma, hospital, 'accountant'));
    clerk = await signIn(t, await createUser(t.prisma, hospital, 'billing_clerk'));
    outsider = await signIn(t, await createUser(t.prisma, other, 'receptionist'));
    const department = await t.prisma.department.create({ data: { hospitalId: hospital.id, code: unique('D').toUpperCase().slice(0, 16), name: 'Medicine' } });
    doctorId = (await t.prisma.doctor.create({ data: { hospitalId: hospital.id, departmentId: department.id, fullName: 'Dr Ward' } })).id;
    general = await category('General', 3, { room: 100_000n, nursing: 30_000n });
    icu = await category('ICU', 1, { room: 600_000n, nursing: 150_000n });
    noRates = await category('Day care', 1, null);
  });

  afterAll(async () => {
    await t.close();
  });

  const post = (path: string, browser: SignedInBrowser, body: object = {}, key: string = randomUUID()) =>
    as(request(t.http).post(path), browser).set('Idempotency-Key', key).send(body);
  const get = (path: string, browser: SignedInBrowser) => as(request(t.http).get(path), browser);
  const code = (response: request.Response) => (response.body as ErrorBody).error.code;
  const admit = (patientId: string, bedId: string) => post('/api/v1/admissions', reception, { patientId, doctorId, bedId, reason: 'Observation' });
  const bedStatus = async (bedId: string) =>
    ((await get('/api/v1/bed-board', nurse)).body as BoardBody).wards.flatMap((ward) => ward.beds).find((bed) => bed.id === bedId)?.status;

  it('admits into a free bed with the next IP number, warns on a short advance, and keeps one patient per bed', async () => {
    expect((await as(request(t.http).put(`/api/v1/room-categories/${general.categoryId}/minimum-advance`), reception).send({ minimumAdvancePaise: 500_000 })).status).toBe(403);
    expect((await as(request(t.http).put(`/api/v1/room-categories/${general.categoryId}/minimum-advance`), finance).send({ minimumAdvancePaise: 500_000 })).status).toBe(200);

    const patient = await createPatient(t.prisma, hospital.id);
    const admitted = await admit(patient.id, general.beds[0] ?? '');
    expect(admitted.status).toBe(201);
    const body = admitted.body as AdmissionBody;
    expect(body.number).toMatch(new RegExp(`^${hospital.code}/IP/${financialYearOf(todayIst())}/\\d{6}$`));
    expect(body).toMatchObject({ advanceShort: true, bed: { id: general.beds[0] } });
    expect(await bedStatus(general.beds[0] ?? '')).toBe('occupied');

    expect(code(await admit(patient.id, general.beds[1] ?? ''))).toBe('ALREADY_ADMITTED');
    expect(code(await admit((await createPatient(t.prisma, hospital.id)).id, general.beds[0] ?? ''))).toBe('BED_TAKEN');
  });

  it('lets only one of two admissions at once take the same bed', async () => {
    const [first, second] = await Promise.all([
      admit((await createPatient(t.prisma, hospital.id)).id, general.beds[1] ?? ''),
      admit((await createPatient(t.prisma, hospital.id)).id, general.beds[1] ?? ''),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);
  });

  it('transfers to another bed, sends the old one to cleaning, and lets the nurse free it but never an occupied bed', async () => {
    const admission = (await admit((await createPatient(t.prisma, hospital.id)).id, general.beds[2] ?? '')).body as AdmissionBody;
    const moved = await post(`/api/v1/admissions/${admission.id}/transfers`, nurse, { bedId: icu.beds[0] });
    expect(moved.status).toBe(201);
    expect((moved.body as AdmissionBody).bed?.id).toBe(icu.beds[0]);
    expect(await bedStatus(general.beds[2] ?? '')).toBe('cleaning');
    expect(await bedStatus(icu.beds[0] ?? '')).toBe('occupied');

    expect((await as(request(t.http).put(`/api/v1/beds/${icu.beds[0] ?? ''}/status`), nurse).send({ status: 'free' })).status).toBe(422);
    expect((await as(request(t.http).put(`/api/v1/beds/${general.beds[2] ?? ''}/status`), nurse).send({ status: 'free' })).status).toBe(204);
    // Even the table owner cannot mark an empty bed occupied by hand.
    await expect(t.owner.bed.update({ where: { id: general.beds[2] ?? '' }, data: { status: 'occupied' } })).rejects.toThrow(/occupied exactly/);
    await expect(t.owner.bedAssignment.deleteMany({ where: { admissionId: admission.id } })).rejects.toThrow(/never deleted/);
  });

  it('posts room and nursing charges for each midnight in a bed, at the rate of the bed held then, once', async () => {
    const charges = t.app.get(IpdChargesService);
    const ipd = t.app.get(IpdService);
    const now = new Date();
    const patient = await createPatient(t.prisma, hospital.id);
    const ward = await category('Night general', 1, { room: 100_000n, nursing: 30_000n });
    const intensive = await category('Night ICU', 1, { room: 600_000n, nursing: 150_000n });
    const admission = (await admit(patient.id, ward.beds[0] ?? '')).body as AdmissionBody;

    // Nothing is charged before the first midnight.
    await charges.postDue(now);
    expect(((await get(`/api/v1/admissions/${admission.id}`, nurse)).body as AdmissionBody).dailyCharges).toEqual([]);

    // The next day the patient moves to the ICU; two midnights later both nights are charged.
    await ipd.transfer(staff(), admission.id, { bedId: intensive.beds[0] ?? '' }, meta(), new Date(now.getTime() + DAY));

    const result = await charges.postDue(new Date(now.getTime() + 2 * DAY + 60 * 60 * 1000));
    const daily = ((await get(`/api/v1/admissions/${admission.id}`, nurse)).body as AdmissionBody).dailyCharges;
    expect(daily.map((day) => [day.kind, day.amountPaise])).toEqual([
      ['room', 100_000],
      ['nursing', 30_000],
      ['room', 600_000],
      ['nursing', 150_000],
    ]);
    expect(result.posted).toBeGreaterThanOrEqual(4);
    expect((await charges.postDue(new Date(now.getTime() + 2 * DAY + 60 * 60 * 1000))).posted).toBe(0);

    // The interim bill totals what the stay has come to: Rs 8,800.
    expect((await get(`/api/v1/admissions/${admission.id}/interim-bill`, nurse)).status).toBe(403);
    const interim = await get(`/api/v1/admissions/${admission.id}/interim-bill`, clerk);
    expect(interim.body).toMatchObject({ totalPaise: 880_000, admissionNumber: admission.number });
  });

  it('leaves a night uncharged when the room category has no rate, and says so', async () => {
    const charges = t.app.get(IpdChargesService);
    const admission = (await admit((await createPatient(t.prisma, hospital.id)).id, noRates.beds[0] ?? '')).body as AdmissionBody;
    const result = await charges.postDue(new Date(Date.now() + DAY + 60 * 60 * 1000));
    expect(result.missingRates).toBeGreaterThanOrEqual(2);
    expect(((await get(`/api/v1/admissions/${admission.id}`, nurse)).body as AdmissionBody).dailyCharges).toEqual([]);
  });

  it("hides another hospital's admissions and beds", async () => {
    const admission = await t.prisma.admission.findFirstOrThrow({ where: { hospitalId: hospital.id }, select: { id: true } });
    expect((await get(`/api/v1/admissions/${admission.id}`, outsider)).status).toBe(404);
    expect((await post(`/api/v1/admissions/${admission.id}/transfers`, outsider, { bedId: general.beds[0] })).status).toBe(404);
    expect(((await get('/api/v1/bed-board', outsider)).body as BoardBody).wards).toEqual([]);
    expect((await get('/api/v1/admissions/advised', reception)).status).toBe(200);
  });

  function staff(): AuthContext {
    return { sessionId: 's', userId: receptionUser.id, hospitalId: hospital.id, kind: 'staff', permissions: new Set(), expiresAt: new Date() };
  }
  function meta() {
    return { requestId: 'test', ipAddress: null, userAgent: null };
  }
});
