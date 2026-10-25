import { randomInt, randomUUID } from 'node:crypto';
import { verhoeffCheckDigit } from '@devmsr/validation';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { todayIst } from '../src/common/dates.js';
import { as, createHospital, createUser, signIn, unique, type SignedInBrowser, type TestHospital } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';

interface ErrorBody {
  error: { code: string; message: string; details?: { matches: { id: string; uhid: string }[] } };
}
interface PatientBody {
  id: string;
  uhid: string;
  fullName: string;
  phone: string;
  aadhaarLast4: string | null;
  city: string | null;
}

/** A made-up mobile number no test shares by accident. */
function mobile(): string {
  return `9${String(randomInt(100_000_000, 999_999_999))}`;
}

/** A made-up Aadhaar number with a valid check digit. */
function aadhaar(): string {
  const first11 = `${String(randomInt(2, 10))}${String(randomInt(1_000_000_000, 9_999_999_999))}`;
  return `${first11}${String(verhoeffCheckDigit(first11))}`;
}

describe('patient registration and search', () => {
  let t: TestApp;
  let hospital: TestHospital;
  let reception: SignedInBrowser;
  let nurse: SignedInBrowser;
  let otherReception: SignedInBrowser;
  const year = todayIst().slice(0, 4);

  beforeAll(async () => {
    t = await createTestApp();
    hospital = await createHospital(t.prisma);
    const other = await createHospital(t.prisma);
    reception = await signIn(t, await createUser(t.prisma, hospital, 'receptionist'));
    nurse = await signIn(t, await createUser(t.prisma, hospital, 'nurse'));
    otherReception = await signIn(t, await createUser(t.prisma, other, 'receptionist'));
  });

  afterAll(async () => {
    await t.close();
  });

  const newPatient = (overrides: Record<string, unknown> = {}) => ({
    fullName: `Patient ${unique('P')}`,
    sex: 'female',
    ageYears: 40,
    phone: mobile(),
    ...overrides,
  });

  const register = (body: Record<string, unknown>, browser = reception, key: string = randomUUID()) =>
    as(request(t.http).post('/api/v1/patients'), browser).set('Idempotency-Key', key).send(body);

  const search = (q: string, browser = reception) => as(request(t.http).post('/api/v1/patients/search'), browser).send({ q });

  const errorOf = (response: request.Response) => (response.body as ErrorBody).error;

  it('gives each new patient the next UHID of the year and returns only the last 4 Aadhaar digits', async () => {
    const fresh = await createHospital(t.prisma);
    const desk = await signIn(t, await createUser(t.prisma, fresh, 'receptionist'));
    const number = aadhaar();
    const first = await register(newPatient({ aadhaar: number }), desk);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ uhid: `${fresh.code}-${year}-000001`, aadhaarLast4: number.slice(-4) });
    expect(JSON.stringify(first.body)).not.toContain(number);
    expect(((await register(newPatient(), desk)).body as PatientBody).uhid).toBe(`${fresh.code}-${year}-000002`);

    const stored = await t.prisma.patient.findUniqueOrThrow({ where: { id: (first.body as PatientBody).id } });
    expect(stored.aadhaarEncrypted).not.toContain(number);
  });

  it('hands out gapless, unique UHIDs to 20 registrations at once', async () => {
    const fresh = await createHospital(t.prisma);
    const desk = await signIn(t, await createUser(t.prisma, fresh, 'receptionist'));
    const responses = await Promise.all(Array.from({ length: 20 }, () => register(newPatient(), desk)));
    expect(responses.map((response) => response.status)).toEqual(Array(20).fill(201));
    const numbers = responses.map((response) => Number((response.body as PatientBody).uhid.split('-').at(-1))).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it('gives a failed registration number back: the same Aadhaar twice at once leaves no gap', async () => {
    const fresh = await createHospital(t.prisma);
    const desk = await signIn(t, await createUser(t.prisma, fresh, 'receptionist'));
    const shared = aadhaar();
    const results = await Promise.all([register(newPatient({ aadhaar: shared }), desk), register(newPatient({ aadhaar: shared }), desk)]);
    expect(results.map((response) => response.status).sort()).toEqual([201, 409]);
    const failed = results.find((response) => response.status === 409);
    expect(failed === undefined ? undefined : errorOf(failed).code).toBe('DUPLICATE_PATIENT');

    const next = await register(newPatient(), desk);
    expect((next.body as PatientBody).uhid).toBe(`${fresh.code}-${year}-000002`);
  });

  it('keeps the counter and the UHID unchangeable in the database itself', async () => {
    const counter = await t.prisma.numberCounter.findFirstOrThrow({ where: { hospitalId: hospital.id } }).catch(async () => {
      await register(newPatient());
      return t.prisma.numberCounter.findFirstOrThrow({ where: { hospitalId: hospital.id } });
    });
    const key = { hospitalId_kind_period: { hospitalId: counter.hospitalId, kind: counter.kind, period: counter.period } };
    await expect(t.prisma.numberCounter.update({ where: key, data: { lastValue: counter.lastValue + 5 } })).rejects.toThrow(/only moves up by one/);
    await expect(t.prisma.numberCounter.delete({ where: key })).rejects.toThrow(/not allowed/);

    const patient = (await register(newPatient())).body as PatientBody;
    await expect(t.prisma.patient.update({ where: { id: patient.id }, data: { uhid: 'CHANGED-2026-000001' } })).rejects.toThrow(/never change/);
  });

  it('refuses the same Aadhaar, and names only the UHID in the error', async () => {
    const number = aadhaar();
    const first = (await register(newPatient({ fullName: 'Asha Devi', aadhaar: number }))).body as PatientBody;
    const again = await register(newPatient({ fullName: 'Someone Else', aadhaar: number, acknowledgedDuplicateIds: [first.id] }));
    expect(again.status).toBe(409);
    expect(errorOf(again)).toMatchObject({ code: 'DUPLICATE_PATIENT', details: { matches: [{ id: first.id, uhid: first.uhid }] } });
    expect(JSON.stringify(again.body)).not.toContain('Asha');
  });

  it('warns about a shared mobile, shows who in the duplicate check, and registers once acknowledged', async () => {
    const phone = mobile();
    const first = (await register(newPatient({ fullName: 'Mohan Lal', phone }))).body as PatientBody;
    const family = newPatient({ fullName: 'Sita Lal', phone });

    const warned = await register(family);
    expect(warned.status).toBe(409);
    expect(errorOf(warned)).toMatchObject({ code: 'POSSIBLE_DUPLICATE', details: { matches: [{ id: first.id, uhid: first.uhid }] } });

    const check = await as(request(t.http).post('/api/v1/patients/duplicate-check'), reception).send(family);
    expect(check.status).toBe(200);
    expect(check.body).toMatchObject({ blocking: [], possible: [{ id: first.id, fullName: 'Mohan Lal', reasons: ['phone'] }] });

    expect((await register({ ...family, acknowledgedDuplicateIds: [first.id] })).status).toBe(201);
  });

  it('replays a double-submitted registration instead of registering twice', async () => {
    const body = newPatient();
    const key = randomUUID();
    const [one, two] = await Promise.all([register(body, reception, key), register(body, reception, key)]);
    const statuses = [one.status, two.status];
    expect(statuses).toContain(201);
    expect(await t.prisma.patient.count({ where: { hospitalId: hospital.id, phone: `+91${body.phone}` } })).toBe(1);
    expect((await register(body, reception)).status).toBe(409);
  });

  it('finds patients by UHID, its number, mobile, name and Aadhaar', async () => {
    const number = aadhaar();
    const name = `Kiran ${unique('S')}`;
    const patient = (await register(newPatient({ fullName: name, aadhaar: number }))).body as PatientBody;
    const ids = async (q: string) => ((await search(q)).body as { data: { id: string }[] }).data.map((row) => row.id);

    expect(await ids(patient.uhid.toLowerCase())).toEqual([patient.id]);
    expect(await ids(String(Number(patient.uhid.split('-').at(-1))))).toContain(patient.id);
    expect(await ids(patient.phone.slice(3))).toEqual([patient.id]);
    expect(await ids(name.toUpperCase().slice(0, 10))).toContain(patient.id);
    expect(await ids(`${number.slice(0, 4)} ${number.slice(4, 8)} ${number.slice(8)}`)).toEqual([patient.id]);
    expect(await ids('x')).toEqual([]);

    // Nobody else's patients, and the search text is never written down.
    expect(((await search(patient.uhid, otherReception)).body as { data: unknown[] }).data).toEqual([]);
    const audit = await t.prisma.auditEvent.findMany({ where: { action: 'patients.patient.searched', hospitalId: hospital.id } });
    expect(JSON.stringify(audit)).not.toContain(name);
  });

  it('checks input: mobile required, a valid Aadhaar, age or date of birth, and the Idempotency-Key', async () => {
    const { phone: _phone, ...noPhone } = newPatient();
    expect((await register(noPhone)).status).toBe(400);
    expect((await register(newPatient({ aadhaar: '123412341234' }))).status).toBe(400);
    expect((await register(newPatient({ dateOfBirth: '1990-01-01' }))).status).toBe(400);
    const noKey = await as(request(t.http).post('/api/v1/patients'), reception).send(newPatient());
    expect(errorOf(noKey).code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('opens and edits a patient, auditing each view; the UHID never changes', async () => {
    const patient = (await register(newPatient())).body as PatientBody;
    const opened = await as(request(t.http).get(`/api/v1/patients/${patient.id}`), nurse);
    expect(opened.status).toBe(200);
    expect(await t.prisma.auditEvent.count({ where: { action: 'patients.patient.viewed', entityId: patient.id } })).toBe(1);

    const edited = await as(request(t.http).patch(`/api/v1/patients/${patient.id}`), reception).send({ city: 'Pune', uhid: 'X-2026-000001' });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ city: 'Pune', uhid: patient.uhid });
    const half = await as(request(t.http).patch(`/api/v1/patients/${patient.id}`), reception).send({ guardianRelation: 'son_of' });
    expect(half.status).toBe(400);
  });

  it('lets clinical staff read but not register or edit, and hides other hospitals as 404', async () => {
    const patient = (await register(newPatient())).body as PatientBody;
    expect((await request(t.http).post('/api/v1/patients/search').send({ q: 'a' })).status).toBe(401);
    expect((await search(patient.uhid, nurse)).status).toBe(200);
    expect((await register(newPatient(), nurse)).status).toBe(403);
    expect((await as(request(t.http).patch(`/api/v1/patients/${patient.id}`), nurse).send({ city: 'Pune' })).status).toBe(403);
    expect((await as(request(t.http).get(`/api/v1/patients/${patient.id}`), otherReception)).status).toBe(404);
    expect((await as(request(t.http).patch(`/api/v1/patients/${patient.id}`), otherReception).send({ city: 'Pune' })).status).toBe(404);
  });
});
