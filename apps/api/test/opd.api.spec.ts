import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, createHospital, createPatient, createUser, signIn, unique, type SignedInBrowser, type TestHospital } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';

interface ErrorBody {
  error: { code: string };
}
interface VisitBody {
  id: string;
  tokenNumber: number;
  status: string;
  quotedFeePaise: number;
  feeInvoiceId: string | null;
}
interface ConsultationBody {
  visit: VisitBody;
  notes: { diagnosis: string | null; admissionAdvised: boolean };
  orders: { chargeId: string; amountPaise: number }[];
}

describe('OPD: tokens, the consultation fee, the doctor queue, notes and orders', () => {
  let t: TestApp;
  let hospital: TestHospital;
  let reception: SignedInBrowser;
  let cashier: SignedInBrowser;
  let doctor: SignedInBrowser;
  let otherDoctor: SignedInBrowser;
  let outsider: SignedInBrowser;
  /** Linked to the `doctor` login, consultation Rs 500.25 (rounds to Rs 500 on the bill). */
  let doctorId: string;
  let otherDoctorId: string;
  let ecg: string;

  async function serviceItem(kind: 'consultation' | 'investigation', ratePaise: bigint, doctor: string | null = null): Promise<string> {
    const item = await t.prisma.serviceItem.create({
      data: { hospitalId: hospital.id, code: unique('SI').toUpperCase().slice(0, 16), name: `Service ${unique('S')}`, kind, doctorId: doctor },
      select: { id: true },
    });
    await t.prisma.tariffRate.create({ data: { hospitalId: hospital.id, serviceItemId: item.id, ratePaise, taxRateBp: 0, effectiveFrom: new Date('2026-01-01T00:00:00Z') } });
    return item.id;
  }

  async function doctorRecord(userId: string): Promise<string> {
    const department = await t.prisma.department.create({ data: { hospitalId: hospital.id, code: unique('D').toUpperCase().slice(0, 16), name: 'General Medicine' } });
    const record = await t.prisma.doctor.create({ data: { hospitalId: hospital.id, departmentId: department.id, fullName: `Dr ${unique('T')}`, userId } });
    return record.id;
  }

  beforeAll(async () => {
    t = await createTestApp();
    hospital = await createHospital(t.prisma);
    const other = await createHospital(t.prisma);
    reception = await signIn(t, await createUser(t.prisma, hospital, 'receptionist'));
    cashier = await signIn(t, await createUser(t.prisma, hospital, 'cashier'));
    const doctorUser = await createUser(t.prisma, hospital, 'doctor');
    const otherDoctorUser = await createUser(t.prisma, hospital, 'doctor');
    doctor = await signIn(t, doctorUser);
    otherDoctor = await signIn(t, otherDoctorUser);
    outsider = await signIn(t, await createUser(t.prisma, other, 'receptionist'));
    doctorId = await doctorRecord(doctorUser.id);
    otherDoctorId = await doctorRecord(otherDoctorUser.id);
    await serviceItem('consultation', 50_025n, doctorId);
    await serviceItem('consultation', 60_000n, otherDoctorId);
    ecg = await serviceItem('investigation', 30_000n);
    await as(request(t.http).post('/api/v1/cash-shifts'), cashier).send({ openingCashPaise: 100_000 });
  });

  afterAll(async () => {
    await t.close();
  });

  const post = (path: string, browser: SignedInBrowser, body: object = {}, key: string = randomUUID()) =>
    as(request(t.http).post(path), browser).set('Idempotency-Key', key).send(body);
  const get = (path: string, browser: SignedInBrowser) => as(request(t.http).get(path), browser);
  const code = (response: request.Response) => (response.body as ErrorBody).error.code;
  const token = async (patientId: string, forDoctor = doctorId) => (await post('/api/v1/opd-visits', reception, { patientId, doctorId: forDoctor })).body as VisitBody;
  const queueIds = async (browser: SignedInBrowser) => ((await get('/api/v1/opd-visits/queue', browser)).body as { visits: VisitBody[] }).visits.map((visit) => visit.id);

  it('issues tokens for the whole hospital in order, one open token per patient and doctor a day', async () => {
    const first = await token((await createPatient(t.prisma, hospital.id)).id);
    const second = await token((await createPatient(t.prisma, hospital.id)).id, otherDoctorId);
    expect(first).toMatchObject({ status: 'awaiting_payment', quotedFeePaise: 50_025, feeInvoiceId: null });
    expect(second.tokenNumber).toBe(first.tokenNumber + 1);

    const patient = await createPatient(t.prisma, hospital.id);
    await token(patient.id);
    expect(code(await post('/api/v1/opd-visits', reception, { patientId: patient.id, doctorId }))).toBe('TOKEN_EXISTS');
    // A doctor without a consultation rate cannot be given tokens.
    const unrated = await doctorRecord((await createUser(t.prisma, hospital, 'doctor')).id);
    expect(code(await post('/api/v1/opd-visits', reception, { patientId: patient.id, doctorId: unrated }))).toBe('RATE_MISSING');
  });

  it('gives 10 tokens issued at once consecutive numbers', async () => {
    const patients = await Promise.all(Array.from({ length: 10 }, () => createPatient(t.prisma, hospital.id)));
    const visits = await Promise.all(patients.map((patient) => token(patient.id)));
    const numbers = visits.map((visit) => visit.tokenNumber).sort((a, b) => a - b);
    const lowest = numbers[0] ?? 0;
    expect(numbers).toEqual(Array.from({ length: 10 }, (_, index) => lowest + index));
  });

  it('keeps an unpaid token out of the queue; the fee is billed and receipted, and only its doctor sees it', async () => {
    const patient = await createPatient(t.prisma, hospital.id);
    const visit = await token(patient.id);
    expect(await queueIds(doctor)).not.toContain(visit.id);

    const paid = await post(`/api/v1/opd-visits/${visit.id}/fee`, cashier, { mode: 'cash' });
    expect(paid.status).toBe(201);
    // Rs 500.25 rounds to Rs 500 on the bill, and the receipt takes the bill's total.
    expect(paid.body).toMatchObject({ amountPaise: 50_000, purpose: 'bill_payment' });
    expect(code(await post(`/api/v1/opd-visits/${visit.id}/fee`, cashier, { mode: 'cash' }))).toBe('VISIT_STATE');

    const after = (await get(`/api/v1/opd-visits/${visit.id}`, reception)).body as VisitBody;
    expect(after.status).toBe('waiting');
    const bill = (await get(`/api/v1/invoices/${after.feeInvoiceId ?? ''}`, cashier)).body as { status: string; duePaise: number; totalPaise: number };
    expect(bill).toMatchObject({ status: 'issued', totalPaise: 50_000, duePaise: 0 });

    expect(await queueIds(doctor)).toContain(visit.id);
    expect(await queueIds(otherDoctor)).not.toContain(visit.id);
    expect((await post(`/api/v1/opd-visits/${visit.id}/call`, otherDoctor)).status).toBe(404);
    expect((await get(`/api/v1/opd-visits/${visit.id}/consultation`, otherDoctor)).status).toBe(404);
  });

  it('lets the doctor call in, write notes, order a test that posts its charge, and complete; then the notes are locked', async () => {
    const patient = await createPatient(t.prisma, hospital.id);
    const visit = await token(patient.id);
    await post(`/api/v1/opd-visits/${visit.id}/fee`, cashier, { mode: 'upi', reference: '412345678901' });

    // Notes wait until the patient is called in.
    const notes = { complaints: 'Fever for 3 days', findings: 'Temp 101 F', diagnosis: 'Viral fever', advice: 'Rest, fluids', followUpDate: null, admissionAdvised: false };
    expect(code(await as(request(t.http).put(`/api/v1/opd-visits/${visit.id}/notes`), doctor).send(notes))).toBe('VISIT_STATE');
    expect(((await post(`/api/v1/opd-visits/${visit.id}/call`, doctor)).body as ConsultationBody).visit.status).toBe('with_doctor');
    const saved = await as(request(t.http).put(`/api/v1/opd-visits/${visit.id}/notes`), doctor).send(notes);
    expect(saved.status).toBe(200);
    expect((saved.body as ConsultationBody).notes.diagnosis).toBe('Viral fever');

    const ordered = await post(`/api/v1/opd-visits/${visit.id}/orders`, doctor, { serviceItemId: ecg, quantity: 1 });
    expect(ordered.status).toBe(201);
    expect((ordered.body as ConsultationBody).orders).toEqual([expect.objectContaining({ amountPaise: 30_000 })]);
    const pending = (await get(`/api/v1/patients/${patient.id}/charges?status=pending`, cashier)).body as { data: { id: string }[] };
    expect(pending.data.map((charge) => charge.id)).toContain((ordered.body as ConsultationBody).orders[0]?.chargeId);

    expect(((await post(`/api/v1/opd-visits/${visit.id}/complete`, doctor)).body as ConsultationBody).visit.status).toBe('completed');
    expect(code(await as(request(t.http).put(`/api/v1/opd-visits/${visit.id}/notes`), doctor).send({ ...notes, diagnosis: 'Changed' }))).toBe('VISIT_STATE');
    expect(code(await post(`/api/v1/opd-visits/${visit.id}/orders`, doctor, { serviceItemId: ecg, quantity: 1 }))).toBe('VISIT_STATE');
    await expect(t.owner.opdVisit.update({ where: { id: visit.id }, data: { diagnosis: 'Changed' } })).rejects.toThrow(/only moves forward/);
    await expect(t.owner.opdVisit.delete({ where: { id: visit.id } })).rejects.toThrow(/never deleted/);
    expect(await queueIds(doctor)).not.toContain(visit.id);
  });

  it('cancels only an unpaid token, with a reason', async () => {
    const visit = await token((await createPatient(t.prisma, hospital.id)).id);
    expect((await post(`/api/v1/opd-visits/${visit.id}/cancel`, reception, {})).status).toBe(400);
    expect(((await post(`/api/v1/opd-visits/${visit.id}/cancel`, reception, { reason: 'Patient left' })).body as VisitBody).status).toBe('cancelled');
    expect(code(await post(`/api/v1/opd-visits/${visit.id}/fee`, cashier, { mode: 'cash' }))).toBe('VISIT_STATE');

    const paid = await token((await createPatient(t.prisma, hospital.id)).id);
    await post(`/api/v1/opd-visits/${paid.id}/fee`, cashier, { mode: 'cash' });
    expect(code(await post(`/api/v1/opd-visits/${paid.id}/cancel`, reception, { reason: 'Too late' }))).toBe('VISIT_STATE');
  });

  it("keeps notes from the desks, and another hospital's visits from everyone", async () => {
    const visit = await token((await createPatient(t.prisma, hospital.id)).id);
    expect((await get(`/api/v1/opd-visits/${visit.id}/consultation`, reception)).status).toBe(403);
    expect((await get(`/api/v1/opd-visits/${visit.id}`, outsider)).status).toBe(404);
    expect((await post(`/api/v1/opd-visits/${visit.id}/cancel`, outsider, { reason: 'Not ours' })).status).toBe(404);
    const list = (await get('/api/v1/opd-visits', outsider)).body as { total: number };
    expect(list.total).toBe(0);
  });
});
