import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthContext } from '../src/auth/auth-context.js';
import { todayIst } from '../src/common/dates.js';
import { DischargeService } from '../src/discharge/discharge.service.js';
import { as, createHospital, createPatient, createUser, signIn, unique, type SignedInBrowser, type TestHospital, type TestUser } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';

interface ErrorBody {
  error: { code: string; details?: Record<string, unknown> };
}
interface DischargeBody {
  id: string;
  clearedAt: string | null;
  summaryStatus: string;
  completedAt: string | null;
  clearance: { duePaise: number; approvalRequestId: string | null } | null;
  pendingDuesRequestId: string | null;
  balance: { duePaise: number; unbilledCount: number; depositHeldPaise: number; missingRoomCharges: string[]; settled: boolean };
  bills: { id: string; status: string; totalPaise: number }[];
  isTreatingDoctor: boolean;
}
interface InvoiceBody {
  id: string;
  status: string;
  totalPaise: number;
  lines: { description: string; serviceDate: string }[];
}

const DAY = 24 * 60 * 60 * 1000;

describe('Discharge: fit, final bill, billing clearance, summary and completion', () => {
  let t: TestApp;
  let hospital: TestHospital;
  let reception: SignedInBrowser;
  let nurse: SignedInBrowser;
  let clerkUser: TestUser;
  let clerk: SignedInBrowser;
  let cashier: SignedInBrowser;
  let md: SignedInBrowser;
  let doctor: SignedInBrowser;
  let otherDoctor: SignedInBrowser;
  let outsiderNurse: SignedInBrowser;
  let outsiderClerk: SignedInBrowser;
  let doctorId: string;
  let beds: string[];
  let noRateBed: string;
  let extraItemId: string;

  async function ward(name: string, bedCount: number, rates: { room: bigint; nursing: bigint } | null): Promise<string[]> {
    const roomCategory = await t.prisma.roomCategory.create({ data: { hospitalId: hospital.id, code: unique('RC').toUpperCase().slice(0, 16), name } });
    const created = await t.prisma.ward.create({
      data: { hospitalId: hospital.id, branchId: hospital.branchId, roomCategoryId: roomCategory.id, code: unique('W').toUpperCase().slice(0, 16), name: `${name} ward` },
    });
    const ids: string[] = [];
    for (let i = 1; i <= bedCount; i += 1) ids.push((await t.prisma.bed.create({ data: { hospitalId: hospital.id, wardId: created.id, code: `B${String(i)}` } })).id);
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
    return ids;
  }

  async function linkedDoctor(user: TestUser, name: string): Promise<string> {
    const department = await t.prisma.department.create({ data: { hospitalId: hospital.id, code: unique('D').toUpperCase().slice(0, 16), name: 'Medicine' } });
    return (await t.prisma.doctor.create({ data: { hospitalId: hospital.id, departmentId: department.id, fullName: name, userId: user.id } })).id;
  }

  beforeAll(async () => {
    t = await createTestApp();
    hospital = await createHospital(t.prisma);
    const other = await createHospital(t.prisma);
    reception = await signIn(t, await createUser(t.prisma, hospital, 'receptionist'));
    nurse = await signIn(t, await createUser(t.prisma, hospital, 'nurse'));
    clerkUser = await createUser(t.prisma, hospital, 'billing_clerk');
    clerk = await signIn(t, clerkUser);
    cashier = await signIn(t, await createUser(t.prisma, hospital, 'cashier'));
    md = await signIn(t, await createUser(t.prisma, hospital, 'md'));
    const doctorUser = await createUser(t.prisma, hospital, 'doctor');
    doctor = await signIn(t, doctorUser);
    doctorId = await linkedDoctor(doctorUser, 'Dr Treating');
    const otherDoctorUser = await createUser(t.prisma, hospital, 'doctor');
    otherDoctor = await signIn(t, otherDoctorUser);
    await linkedDoctor(otherDoctorUser, 'Dr Other');
    outsiderNurse = await signIn(t, await createUser(t.prisma, other, 'nurse'));
    outsiderClerk = await signIn(t, await createUser(t.prisma, other, 'billing_clerk'));
    beds = await ward('General', 5, { room: 100_000n, nursing: 30_000n });
    [noRateBed = ''] = await ward('Day care', 1, null);
    const extra = await t.prisma.serviceItem.create({ data: { hospitalId: hospital.id, code: unique('XR').toUpperCase().slice(0, 16), name: 'Chest X-ray', kind: 'investigation' } });
    await t.prisma.tariffRate.create({ data: { hospitalId: hospital.id, serviceItemId: extra.id, ratePaise: 40_000n, taxRateBp: 0, effectiveFrom: new Date('2026-01-01T00:00:00Z') } });
    extraItemId = extra.id;
    expect((await as(request(t.http).post('/api/v1/cash-shifts'), cashier).send({ openingCashPaise: 0 })).status).toBe(201);
  });

  afterAll(async () => {
    await t.close();
  });

  const post = (path: string, browser: SignedInBrowser, body: object = {}) =>
    as(request(t.http).post(path), browser).set('Idempotency-Key', randomUUID()).send(body);
  const put = (path: string, browser: SignedInBrowser, body: object) => as(request(t.http).put(path), browser).send(body);
  const get = (path: string, browser: SignedInBrowser) => as(request(t.http).get(path), browser);
  const code = (response: request.Response) => (response.body as ErrorBody).error.code;
  const summary = { diagnosis: 'Community acquired pneumonia', courseInHospital: 'IV antibiotics, improved', conditionAtDischarge: 'Stable', medications: 'Amoxicillin 500 mg for 5 days', advice: '', followUpDate: null };

  async function admitted(bedId: string): Promise<{ patientId: string; admissionId: string }> {
    const patient = await createPatient(t.prisma, hospital.id);
    const response = await post('/api/v1/admissions', reception, { patientId: patient.id, doctorId, bedId });
    expect(response.status).toBe(201);
    return { patientId: patient.id, admissionId: (response.body as { id: string }).id };
  }

  async function issuedFinalBill(dischargeId: string): Promise<InvoiceBody> {
    const draft = await post(`/api/v1/discharges/${dischargeId}/final-bill`, clerk);
    expect(draft.status).toBe(201);
    const issued = await post(`/api/v1/invoices/${(draft.body as InvoiceBody).id}/issue`, clerk);
    expect(issued.status).toBe(200);
    return issued.body as InvoiceBody;
  }

  async function signedSummary(dischargeId: string): Promise<void> {
    expect((await put(`/api/v1/discharges/${dischargeId}/summary`, doctor, summary)).status).toBe(200);
    expect((await post(`/api/v1/discharges/${dischargeId}/summary/sign`, md)).status).toBe(200);
  }

  it('discharges a same-day stay: one day charged, deposit used, paid, cleared, signed off, bed to cleaning', async () => {
    const { patientId, admissionId } = await admitted(beds[0] ?? '');
    expect((await post('/api/v1/deposits', cashier, { patientId, mode: 'cash', amountPaise: 50_000 })).status).toBe(201);

    // Only the treating doctor marks fit, once.
    expect(code(await post('/api/v1/discharges', otherDoctor, { admissionId }))).toBe('NOT_TREATING_DOCTOR');
    expect((await post('/api/v1/discharges', nurse, { admissionId })).status).toBe(403);
    const fit = await post('/api/v1/discharges', doctor, { admissionId, note: 'Afebrile for 48 hours' });
    expect(fit.status).toBe(201);
    const discharge = fit.body as DischargeBody;
    expect(discharge.isTreatingDoctor).toBe(true);
    expect(code(await post('/api/v1/discharges', doctor, { admissionId }))).toBe('DISCHARGE_STEP');
    expect(((await get(`/api/v1/admissions/${admissionId}`, nurse)).body as { dischargeId: string }).dischargeId).toBe(discharge.id);

    // Before the final bill: the day is not charged and the deposit is held.
    const early = await post(`/api/v1/discharges/${discharge.id}/clearance`, clerk);
    expect(code(early)).toBe('BALANCE_NOT_ZERO');
    expect((early.body as ErrorBody).error.details).toMatchObject({ missingRoomCharges: [todayIst()], depositHeldPaise: 50_000 });

    // The final bill posts the one day of a same-day stay and bills it.
    const bill = await issuedFinalBill(discharge.id);
    expect(bill.totalPaise).toBe(130_000);
    expect(bill.lines.map((line) => line.serviceDate)).toEqual([todayIst(), todayIst()]);
    expect(code(await post(`/api/v1/discharges/${discharge.id}/final-bill`, clerk))).toBe('NOTHING_TO_BILL');

    expect((await post(`/api/v1/invoices/${bill.id}/apply-deposit`, cashier, { amountPaise: 50_000 })).status).toBe(200);
    const owing = await post(`/api/v1/discharges/${discharge.id}/clearance`, clerk);
    expect((owing.body as ErrorBody).error.details).toMatchObject({ duePaise: 80_000, depositHeldPaise: 0, missingRoomCharges: [] });
    expect((await post('/api/v1/payments', cashier, { invoiceId: bill.id, mode: 'cash', amountPaise: 80_000 })).status).toBe(201);
    expect((await post(`/api/v1/discharges/${discharge.id}/clearance`, cashier)).status).toBe(403);
    const cleared = await post(`/api/v1/discharges/${discharge.id}/clearance`, clerk);
    expect(cleared.status).toBe(201);
    expect((cleared.body as DischargeBody).clearance).toMatchObject({ duePaise: 0, approvalRequestId: null });

    // The patient leaves only with the summary signed by the MD, never by whoever wrote it.
    expect(code(await post(`/api/v1/discharges/${discharge.id}/complete`, nurse))).toBe('DISCHARGE_STEP');
    expect(code(await put(`/api/v1/discharges/${discharge.id}/summary`, otherDoctor, summary))).toBe('NOT_TREATING_DOCTOR');
    expect((await put(`/api/v1/discharges/${discharge.id}/summary`, doctor, summary)).status).toBe(200);
    expect((await post(`/api/v1/discharges/${discharge.id}/summary/sign`, doctor)).status).toBe(403);
    const signed = await post(`/api/v1/discharges/${discharge.id}/summary/sign`, md);
    expect(signed.status).toBe(200);
    expect(signed.body).toMatchObject({ content: { diagnosis: summary.diagnosis, advice: null }, doctorName: 'Dr Treating' });
    expect(code(await put(`/api/v1/discharges/${discharge.id}/summary`, doctor, summary))).toBe('DISCHARGE_STEP');
    expect((await get(`/api/v1/discharges/${discharge.id}/summary`, nurse)).status).toBe(200);
    expect((await get(`/api/v1/discharges/${discharge.id}/summary`, clerk)).status).toBe(403);

    const done = await post(`/api/v1/discharges/${discharge.id}/complete`, nurse);
    expect(done.status).toBe(200);
    expect((done.body as DischargeBody).completedAt).not.toBeNull();
    expect(await t.prisma.bed.findUniqueOrThrow({ where: { id: beds[0] ?? '' }, select: { status: true } })).toEqual({ status: 'cleaning' });
    expect(await t.prisma.admission.findUniqueOrThrow({ where: { id: admissionId }, select: { status: true } })).toEqual({ status: 'discharged' });
    expect(code(await post(`/api/v1/discharges/${discharge.id}/complete`, nurse))).toBe('DISCHARGE_STEP');

    // The database keeps all of it as written, even for the table owner.
    await expect(t.owner.dischargeSummary.updateMany({ where: { dischargeId: discharge.id }, data: { diagnosis: 'Changed' } })).rejects.toThrow(/never changes/);
    await expect(t.owner.dischargeClearance.deleteMany({ where: { dischargeId: discharge.id } })).rejects.toThrow();
    await expect(t.owner.discharge.update({ where: { id: discharge.id }, data: { fitNote: 'Changed later' } })).rejects.toThrow(/only moves forward/);
  });

  it('clears with dues only on the MD approval, and asks again when the account grows after clearance', async () => {
    const { patientId, admissionId } = await admitted(beds[1] ?? '');
    const discharge = (await post('/api/v1/discharges', doctor, { admissionId })).body as DischargeBody;
    expect(code(await post('/api/v1/clearance-requests', clerk, { dischargeId: discharge.id, reason: 'Family will pay next week' }))).toBe('BALANCE_NOT_ZERO');
    await issuedFinalBill(discharge.id);

    const asked = await post('/api/v1/clearance-requests', clerk, { dischargeId: discharge.id, reason: 'Family will pay next week' });
    expect(asked.status).toBe(201);
    expect(asked.body).toMatchObject({ kind: 'clearance_dues', amountPaise: 130_000, dischargeId: discharge.id });
    const requestId = (asked.body as { id: string }).id;
    expect((await post(`/api/v1/clearance-requests/${requestId}/approve`, clerk)).status).toBe(403);
    expect((await post(`/api/v1/clearance-requests/${requestId}/approve`, md)).status).toBe(200);
    const cleared = (await get(`/api/v1/discharges/${discharge.id}`, clerk)).body as DischargeBody;
    expect(cleared.clearance).toMatchObject({ duePaise: 130_000, approvalRequestId: requestId });

    // An X-ray posted after clearance: the patient cannot leave until it is billed and cleared again.
    expect((await post(`/api/v1/patients/${patientId}/charges`, clerk, { serviceItemId: extraItemId, quantity: 1 })).status).toBe(201);
    await signedSummary(discharge.id);
    expect(code(await post(`/api/v1/discharges/${discharge.id}/complete`, nurse))).toBe('BALANCE_NOT_ZERO');
    await issuedFinalBill(discharge.id);
    expect(code(await post(`/api/v1/discharges/${discharge.id}/complete`, nurse))).toBe('BALANCE_NOT_ZERO');

    const again = await post('/api/v1/clearance-requests', clerk, { dischargeId: discharge.id, reason: 'Family will pay the X-ray too' });
    expect(again.body).toMatchObject({ amountPaise: 170_000 });
    expect(code(await post('/api/v1/clearance-requests', clerk, { dischargeId: discharge.id, reason: 'Asked twice' }))).toBe('REQUEST_PENDING');
    expect((await post(`/api/v1/clearance-requests/${(again.body as { id: string }).id}/approve`, md)).status).toBe(200);
    expect((await post(`/api/v1/discharges/${discharge.id}/complete`, nurse)).status).toBe(200);
    expect(code(await post('/api/v1/clearance-requests', clerk, { dischargeId: discharge.id, reason: 'After leaving' }))).toBe('DISCHARGE_STEP');
  });

  it('charges the nights the job missed on the final bill, and refuses a bill with a room rate missing', async () => {
    const service = t.app.get(DischargeService);
    const staff: AuthContext = { sessionId: 's', userId: clerkUser.id, hospitalId: hospital.id, kind: 'staff', permissions: new Set(), expiresAt: new Date(), userHospitalId: hospital.id, breakGlass: null };
    const meta = { requestId: 'test', ipAddress: null, userAgent: null };

    const { admissionId } = await admitted(beds[2] ?? '');
    const discharge = (await post('/api/v1/discharges', doctor, { admissionId })).body as DischargeBody;
    // Two midnights later, with no midnight job run: both nights are charged by the final bill.
    const bill = await service.prepareFinalBill(staff, discharge.id, meta, new Date(Date.now() + 2 * DAY + 60 * 60 * 1000));
    expect(bill.totalPaise).toBe(260_000);

    const dayCare = await admitted(noRateBed);
    const noRate = (await post('/api/v1/discharges', doctor, { admissionId: dayCare.admissionId })).body as DischargeBody;
    const missing = await post(`/api/v1/discharges/${noRate.id}/final-bill`, clerk);
    expect(code(missing)).toBe('ROOM_CHARGES_MISSING');
    expect((missing.body as ErrorBody).error.details).toEqual({ dates: [todayIst()] });
  });

  it("lists discharges in progress and hides another hospital's", async () => {
    const open = await get('/api/v1/discharges?status=open', reception);
    expect(open.status).toBe(200);
    expect((open.body as { data: { completedAt: string | null }[] }).data.every((row) => row.completedAt === null)).toBe(true);
    const any = await t.prisma.discharge.findFirstOrThrow({ where: { hospitalId: hospital.id }, select: { id: true } });
    expect((await get(`/api/v1/discharges/${any.id}`, outsiderNurse)).status).toBe(404);
    expect((await post(`/api/v1/discharges/${any.id}/clearance`, outsiderClerk)).status).toBe(404);
    expect((await post(`/api/v1/discharges/${any.id}/final-bill`, outsiderClerk)).status).toBe(404);
    expect(((await get('/api/v1/discharges', outsiderNurse)).body as { total: number }).total).toBe(0);
  });
});
