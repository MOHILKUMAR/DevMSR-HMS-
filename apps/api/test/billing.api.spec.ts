import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { financialYearOf, todayIst } from '../src/common/dates.js';
import { as, createHospital, createPatient, createUser, signIn, unique, type SignedInBrowser, type TestHospital } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';

interface ErrorBody {
  error: { code: string };
}
interface ChargeBody {
  id: string;
  amountPaise: number;
}
interface InvoiceBody {
  id: string;
  status: string;
  number: string | null;
  totalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  roundOffPaise: number;
  paidPaise: number;
  duePaise: number;
  lines: unknown[];
}
interface ReceiptBody {
  id: string;
  number: string;
  amountPaise: number;
  heldPaise: number;
}

describe('charges, bills, payments, deposits and cash shifts', () => {
  let t: TestApp;
  let hospital: TestHospital;
  let clerk: SignedInBrowser;
  let cashier: SignedInBrowser;
  let finance: SignedInBrowser;
  let nurse: SignedInBrowser;
  let otherCashier: SignedInBrowser;
  /** Rs 500.25, not taxed. */
  let consultation: string;
  /** Rs 3,000 a day, 5% tax. */
  let room: string;
  const fy = financialYearOf(todayIst());

  async function serviceItem(hospitalId: string, ratePaise: bigint, taxRateBp: number): Promise<string> {
    const item = await t.prisma.serviceItem.create({
      data: { hospitalId, code: unique('SI').toUpperCase().slice(0, 16), name: `Service ${unique('S')}`, kind: 'procedure' },
      select: { id: true },
    });
    await t.prisma.tariffRate.create({
      data: { hospitalId, serviceItemId: item.id, ratePaise, taxRateBp, effectiveFrom: new Date('2026-01-01T00:00:00Z') },
    });
    return item.id;
  }

  beforeAll(async () => {
    t = await createTestApp();
    hospital = await createHospital(t.prisma);
    const other = await createHospital(t.prisma);
    clerk = await signIn(t, await createUser(t.prisma, hospital, 'billing_clerk'));
    cashier = await signIn(t, await createUser(t.prisma, hospital, 'cashier'));
    finance = await signIn(t, await createUser(t.prisma, hospital, 'accountant'));
    nurse = await signIn(t, await createUser(t.prisma, hospital, 'nurse'));
    otherCashier = await signIn(t, await createUser(t.prisma, other, 'cashier'));
    consultation = await serviceItem(hospital.id, 50_025n, 0);
    room = await serviceItem(hospital.id, 300_000n, 500);
  });

  afterAll(async () => {
    await t.close();
  });

  const post = (path: string, browser: SignedInBrowser, body: object, key: string = randomUUID()) =>
    as(request(t.http).post(path), browser).set('Idempotency-Key', key).send(body);
  const charge = async (patientId: string, serviceItemId: string, quantity = 1) =>
    ((await post(`/api/v1/patients/${patientId}/charges`, clerk, { serviceItemId, quantity })).body as ChargeBody).id;
  const draft = async (patientId: string, chargeIds: string[]) =>
    (await post('/api/v1/invoices', clerk, { patientId, chargeIds })).body as InvoiceBody;
  const issue = (invoiceId: string, browser = clerk, key?: string) => post(`/api/v1/invoices/${invoiceId}/issue`, browser, {}, key);
  const issuedBill = async (patientId: string) => {
    const bill = await draft(patientId, [await charge(patientId, consultation), await charge(patientId, room, 2)]);
    return (await issue(bill.id)).body as InvoiceBody;
  };
  const code = (response: request.Response) => (response.body as ErrorBody).error.code;

  async function openShift(browser: SignedInBrowser, openingCashPaise = 100_000) {
    const current = (await as(request(t.http).get('/api/v1/cash-shifts/current'), browser)).body as { shift: { id: string } | null };
    if (current.shift !== null) return current.shift.id;
    return ((await as(request(t.http).post('/api/v1/cash-shifts'), browser).send({ openingCashPaise })).body as { id: string }).id;
  }

  it('posts charges at the current rate and keeps that rate when the rate changes later', async () => {
    const patient = await createPatient(t.prisma, hospital.id);
    const posted = await post(`/api/v1/patients/${patient.id}/charges`, clerk, { serviceItemId: room, quantity: 2 });
    expect(posted.status).toBe(201);
    expect(posted.body).toMatchObject({ quantity: 2, unitRatePaise: 300_000, taxRateBp: 500, amountPaise: 600_000, status: 'pending' });
    await expect(t.prisma.charge.update({ where: { id: (posted.body as ChargeBody).id }, data: { quantity: 3 } })).rejects.toThrow(/only moves/);

    const future = await post(`/api/v1/patients/${patient.id}/charges`, clerk, { serviceItemId: room, quantity: 1, serviceDate: '2999-01-01' });
    expect(future.status).toBe(400);
    const unrated = await t.prisma.serviceItem.create({ data: { hospitalId: hospital.id, code: unique('NR').toUpperCase().slice(0, 16), name: 'No rate', kind: 'other' } });
    expect(code(await post(`/api/v1/patients/${patient.id}/charges`, clerk, { serviceItemId: unrated.id, quantity: 1 }))).toBe('RATE_MISSING');
  });

  it('drafts a bill with CGST, SGST and round off, then issues it with the next number and locks it', async () => {
    const patient = await createPatient(t.prisma, hospital.id);
    const bill = await draft(patient.id, [await charge(patient.id, consultation), await charge(patient.id, room, 2)]);
    // 500.25 + 6,000.00 + 150.00 CGST + 150.00 SGST = 6,800.25, rounded to 6,800.
    expect(bill).toMatchObject({ status: 'draft', number: null, cgstPaise: 15_000, sgstPaise: 15_000, roundOffPaise: -25, totalPaise: 680_000, duePaise: 0 });
    expect(bill.lines).toHaveLength(2);

    const issued = await issue(bill.id);
    expect(issued.status).toBe(200);
    expect(issued.body).toMatchObject({ status: 'issued', totalPaise: 680_000, duePaise: 680_000 });
    expect((issued.body as InvoiceBody).number).toMatch(new RegExp(`^${hospital.code}/INV/${fy}/\\d{6}$`));
    expect(code(await issue(bill.id))).toBe('INVOICE_LOCKED');
    await expect(t.prisma.invoice.update({ where: { id: bill.id }, data: { totalPaise: 1n } })).rejects.toThrow(/locked/);
    await expect(t.prisma.invoice.delete({ where: { id: bill.id } })).rejects.toThrow(/never deleted/);
  });

  it('never puts one charge on two bills, and a discarded draft frees its charges', async () => {
    const patient = await createPatient(t.prisma, hospital.id);
    const chargeId = await charge(patient.id, consultation);
    const first = await draft(patient.id, [chargeId]);
    expect(code(await post('/api/v1/invoices', clerk, { patientId: patient.id, chargeIds: [chargeId] }))).toBe('CHARGE_UNAVAILABLE');
    expect((await as(request(t.http).post(`/api/v1/invoices/${first.id}/discard`), clerk).send({})).status).toBe(200);
    expect((await post('/api/v1/invoices', clerk, { patientId: patient.id, chargeIds: [chargeId] })).status).toBe(201);
  });

  it('issues 10 bills at once with gapless numbers, and one draft issued twice at once only once', async () => {
    const fresh = await createHospital(t.prisma);
    const freshClerk = await signIn(t, await createUser(t.prisma, fresh, 'billing_clerk'));
    const item = await serviceItem(fresh.id, 10_000n, 0);
    const drafts: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const patient = await createPatient(t.prisma, fresh.id);
      const chargeId = ((await post(`/api/v1/patients/${patient.id}/charges`, freshClerk, { serviceItemId: item, quantity: 1 })).body as ChargeBody).id;
      drafts.push(((await post('/api/v1/invoices', freshClerk, { patientId: patient.id, chargeIds: [chargeId] })).body as InvoiceBody).id);
    }
    const issued = await Promise.all(drafts.map((id) => issue(id, freshClerk)));
    const numbers = issued.map((response) => Number((response.body as InvoiceBody).number?.split('/').at(-1))).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));

    const patient = await createPatient(t.prisma, fresh.id);
    const chargeId = ((await post(`/api/v1/patients/${patient.id}/charges`, freshClerk, { serviceItemId: item, quantity: 1 })).body as ChargeBody).id;
    const once = ((await post('/api/v1/invoices', freshClerk, { patientId: patient.id, chargeIds: [chargeId] })).body as InvoiceBody).id;
    const racing = await Promise.all([issue(once, freshClerk), issue(once, freshClerk)]);
    expect(racing.map((response) => response.status).sort()).toEqual([200, 409]);
    const last = (await issue(drafts[0] ?? '', freshClerk)).body as ErrorBody;
    expect(last.error.code).toBe('INVOICE_LOCKED');
  });

  it('takes payments only into an open shift and never more than is due; a double submit is one receipt', async () => {
    const patient = await createPatient(t.prisma, hospital.id);
    const bill = await issuedBill(patient.id);
    const lateCashier = await signIn(t, await createUser(t.prisma, hospital, 'cashier'));
    expect(code(await post('/api/v1/payments', lateCashier, { invoiceId: bill.id, mode: 'cash', amountPaise: 1_000 }))).toBe('SHIFT_REQUIRED');

    await openShift(cashier);
    expect(code(await post('/api/v1/payments', cashier, { invoiceId: bill.id, mode: 'cash', amountPaise: bill.totalPaise + 1 }))).toBe('AMOUNT_EXCEEDS_DUE');
    const key = randomUUID();
    const body = { invoiceId: bill.id, mode: 'upi', amountPaise: 200_000, reference: '412345678901' };
    const [one, two] = await Promise.all([post('/api/v1/payments', cashier, body, key), post('/api/v1/payments', cashier, body, key)]);
    expect([one.status, two.status]).toContain(201);
    expect(await t.prisma.receipt.count({ where: { allocations: { some: { invoiceId: bill.id } } } })).toBe(1);
    const receipt = (one.status === 201 ? one : two).body as ReceiptBody;
    expect(receipt.number).toMatch(new RegExp(`^${hospital.code}/RCT/${fy}/\\d{6}$`));
    await expect(t.prisma.receipt.update({ where: { id: receipt.id }, data: { amountPaise: 1n } })).rejects.toThrow(/written once/);

    const after = (await as(request(t.http).get(`/api/v1/invoices/${bill.id}`), cashier)).body as InvoiceBody;
    expect(after).toMatchObject({ paidPaise: 200_000, duePaise: bill.totalPaise - 200_000 });
  });

  it('holds a deposit, then sets it against a bill oldest first without taking more money', async () => {
    const patient = await createPatient(t.prisma, hospital.id);
    await openShift(cashier);
    const deposit = await post('/api/v1/deposits', cashier, { patientId: patient.id, mode: 'cash', amountPaise: 500_000 });
    expect(deposit.status).toBe(201);
    expect(deposit.body).toMatchObject({ amountPaise: 500_000, heldPaise: 500_000 });

    const bill = await issuedBill(patient.id);
    const applied = await post(`/api/v1/invoices/${bill.id}/apply-deposit`, cashier, { amountPaise: 500_000 });
    expect(applied.status).toBe(200);
    expect(applied.body).toMatchObject({ paidPaise: 500_000, duePaise: bill.totalPaise - 500_000 });
    expect(code(await post(`/api/v1/invoices/${bill.id}/apply-deposit`, cashier, { amountPaise: 100 }))).toBe('NO_DEPOSIT_HELD');

    const account = (await as(request(t.http).get(`/api/v1/patients/${patient.id}/account`), finance)).body as { depositHeldPaise: number; totalDuePaise: number };
    expect(account).toMatchObject({ depositHeldPaise: 0, totalDuePaise: bill.totalPaise - 500_000 });
  });

  it('closes a shift with the counted cash; a difference needs a reason; finance sees it', async () => {
    const own = await signIn(t, await createUser(t.prisma, hospital, 'cashier'));
    const shiftId = await openShift(own, 100_000);
    expect(code(await as(request(t.http).post('/api/v1/cash-shifts'), own).send({ openingCashPaise: 0 }))).toBe('SHIFT_ALREADY_OPEN');
    const patient = await createPatient(t.prisma, hospital.id);
    await post('/api/v1/deposits', own, { patientId: patient.id, mode: 'cash', amountPaise: 25_000 });
    await post('/api/v1/deposits', own, { patientId: patient.id, mode: 'card', amountPaise: 40_000, reference: 'AB12CD', cardLast4: '4242' });

    const close = (body: object, browser = own) => as(request(t.http).post(`/api/v1/cash-shifts/${shiftId}/close`), browser).send(body);
    expect((await close({ countedCashPaise: 120_000 }, cashier)).status).toBe(404);
    expect(code(await close({ countedCashPaise: 120_000 }))).toBe('VALIDATION_FAILED');
    const closed = await close({ countedCashPaise: 120_000, differenceReason: 'Rs 50 short, change given twice' });
    expect(closed.status).toBe(200);
    expect(closed.body).toMatchObject({ expectedCashPaise: 125_000, countedCashPaise: 120_000, differencePaise: -5_000, depositsPaise: 65_000 });
    expect(code(await close({ countedCashPaise: 120_000 }))).toBe('SHIFT_CLOSED');
    expect(code(await post('/api/v1/deposits', own, { patientId: patient.id, mode: 'cash', amountPaise: 100 }))).toBe('SHIFT_REQUIRED');

    const list = (await as(request(t.http).get('/api/v1/cash-shifts?pageSize=100'), finance)).body as { data: { id: string; differenceReason: string | null }[] };
    expect(list.data.find((shift) => shift.id === shiftId)?.differenceReason).toBe('Rs 50 short, change given twice');
  });

  it('refuses other roles, other hospitals, and payment details that do not fit the mode', async () => {
    const patient = await createPatient(t.prisma, hospital.id);
    const bill = await issuedBill(patient.id);
    expect((await post(`/api/v1/patients/${patient.id}/charges`, nurse, { serviceItemId: room, quantity: 1 })).status).toBe(403);
    expect((await as(request(t.http).get(`/api/v1/invoices/${bill.id}`), nurse)).status).toBe(403);
    expect((await post(`/api/v1/invoices/${bill.id}/issue`, cashier, {})).status).toBe(403);
    expect((await as(request(t.http).get(`/api/v1/invoices/${bill.id}`), otherCashier)).status).toBe(404);
    expect((await as(request(t.http).get(`/api/v1/patients/${patient.id}/account`), otherCashier)).status).toBe(404);
    await openShift(cashier);
    expect((await post('/api/v1/payments', cashier, { invoiceId: bill.id, mode: 'card', amountPaise: 100, reference: 'AB12CD' })).status).toBe(400);
    expect((await as(request(t.http).post('/api/v1/payments'), cashier).send({ invoiceId: bill.id, mode: 'cash', amountPaise: 100 })).status).toBe(400);
  });
});
