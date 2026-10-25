import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { todayIst } from '../src/common/dates.js';
import { as, createHospital, createPatient, createUser, signIn, unique, type SignedInBrowser, type TestHospital } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';

interface Counts {
  paymentsPaise: number;
  depositsPaise: number;
  refundsPaise: number;
  netPaise: number;
  receipts: number;
  refunds: number;
}
interface CollectionBody {
  date: string;
  rows: (Counts & { cashierName: string | null; mode: string })[];
  byMode: (Counts & { mode: string })[];
  totals: Counts;
  voided: { count: number; amountPaise: number };
}

/** Exports are limited per user per hour; this file lowers the limit to see it work. */
const EXPORT_LIMIT = 3;

describe('Reports: day-end collection, the Tally day book and basic counts', () => {
  let t: TestApp;
  let hospital: TestHospital;
  let clerk: SignedInBrowser;
  let cashier: SignedInBrowser;
  let secondCashier: SignedInBrowser;
  let finance: SignedInBrowser;
  let md: SignedInBrowser;
  let outsiderMd: SignedInBrowser;
  let billNumber: string;
  let depositNumber: string;
  let voidedNumber: string;

  const post = (path: string, browser: SignedInBrowser, body: object = {}) =>
    as(request(t.http).post(path), browser).set('Idempotency-Key', randomUUID()).send(body);
  const get = (path: string, browser: SignedInBrowser) => as(request(t.http).get(path), browser);

  beforeAll(async () => {
    t = await createTestApp({ env: { RATE_LIMIT_EXPORT_PER_HOUR: String(EXPORT_LIMIT) } });
    hospital = await createHospital(t.prisma);
    const other = await createHospital(t.prisma);
    clerk = await signIn(t, await createUser(t.prisma, hospital, 'billing_clerk'));
    cashier = await signIn(t, await createUser(t.prisma, hospital, 'cashier'));
    secondCashier = await signIn(t, await createUser(t.prisma, hospital, 'cashier'));
    finance = await signIn(t, await createUser(t.prisma, hospital, 'accountant'));
    md = await signIn(t, await createUser(t.prisma, hospital, 'md'));
    outsiderMd = await signIn(t, await createUser(t.prisma, other, 'md'));

    const item = await t.prisma.serviceItem.create({ data: { hospitalId: hospital.id, code: unique('CT').toUpperCase().slice(0, 16), name: 'CT scan', kind: 'investigation' } });
    await t.prisma.tariffRate.create({ data: { hospitalId: hospital.id, serviceItemId: item.id, ratePaise: 50_000n, taxRateBp: 0, effectiveFrom: new Date('2026-01-01T00:00:00Z') } });
    const patient = await createPatient(t.prisma, hospital.id);
    for (const browser of [cashier, secondCashier]) expect((await as(request(t.http).post('/api/v1/cash-shifts'), browser).send({ openingCashPaise: 0 })).status).toBe(201);

    // A bill of Rs 500, paid by UPI.
    const charge = await post(`/api/v1/patients/${patient.id}/charges`, clerk, { serviceItemId: item.id, quantity: 1 });
    const draft = await post('/api/v1/invoices', clerk, { patientId: patient.id, chargeIds: [(charge.body as { id: string }).id] });
    const bill = await post(`/api/v1/invoices/${(draft.body as { id: string }).id}/issue`, clerk);
    billNumber = (bill.body as { number: string }).number;
    expect((await post('/api/v1/payments', cashier, { invoiceId: (bill.body as { id: string }).id, mode: 'upi', amountPaise: 50_000, reference: 'UTR2026102601' })).status).toBe(201);

    // A deposit of Rs 1,000 in cash, Rs 300 of it refunded in cash.
    const deposit = await post('/api/v1/deposits', cashier, { patientId: patient.id, mode: 'cash', amountPaise: 100_000 });
    depositNumber = (deposit.body as { number: string }).number;
    const refund = await post('/api/v1/refund-requests', cashier, {
      reason: 'Planned procedure cancelled',
      amountPaise: 30_000,
      mode: 'cash',
      source: { kind: 'deposit', receiptId: (deposit.body as { id: string }).id },
    });
    expect((await post(`/api/v1/refund-requests/${(refund.body as { id: string }).id}/approve`, md)).status).toBe(200);
    expect((await post(`/api/v1/refund-requests/${(refund.body as { id: string }).id}/pay`, cashier)).status).toBe(201);

    // A deposit of Rs 2,000 entered by mistake, then voided.
    const mistake = await post('/api/v1/deposits', secondCashier, { patientId: patient.id, mode: 'cash', amountPaise: 200_000 });
    voidedNumber = (mistake.body as { number: string }).number;
    const voidRequest = await post('/api/v1/void-requests', secondCashier, { receiptId: (mistake.body as { id: string }).id, reason: 'Entered twice' });
    expect((await post(`/api/v1/void-requests/${(voidRequest.body as { id: string }).id}/approve`, finance)).status).toBe(200);
  });

  afterAll(async () => {
    await t.close();
  });

  it('adds up the day by cashier and mode, leaving void receipts out and taking refunds off', async () => {
    expect((await get('/api/v1/reports/collections', clerk)).status).toBe(403);
    const response = await get('/api/v1/reports/collections', finance);
    expect(response.status).toBe(200);
    const report = response.body as CollectionBody;
    expect(report.date).toBe(todayIst());
    expect(report.totals).toEqual({ paymentsPaise: 50_000, depositsPaise: 100_000, refundsPaise: 30_000, netPaise: 120_000, receipts: 2, refunds: 1 });
    expect(report.voided).toEqual({ count: 1, amountPaise: 200_000 });
    expect(report.byMode.map((row) => [row.mode, row.netPaise])).toEqual([
      ['cash', 70_000],
      ['upi', 50_000],
    ]);
    expect(report.rows.map((row) => [row.cashierName, row.mode, row.netPaise])).toEqual([
      ['Test cashier', 'cash', 70_000],
      ['Test cashier', 'upi', 50_000],
    ]);
    // Another hospital sees only its own day.
    expect(((await get('/api/v1/reports/collections', outsiderMd)).body as CollectionBody).totals.receipts).toBe(0);
    // An earlier day is empty.
    expect(((await get('/api/v1/reports/collections?date=2026-01-01', finance)).body as CollectionBody).rows).toEqual([]);
  });

  it('exports the day book as CSV, with the void receipt kept at nothing', async () => {
    const response = await get('/api/v1/reports/day-book', finance);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/csv/);
    expect(response.headers['content-disposition']).toBe(`attachment; filename="day-book-${todayIst()}.csv"`);
    const lines = response.text.trim().split('\r\n');
    expect(lines[0]).toBe('Date,Voucher type,Number,Patient UHID,Mode,Against,Taxable,CGST,SGST,Round off,Amount');
    expect(lines).toContainEqual(expect.stringMatching(new RegExp(`^${todayIst()},Sales,${billNumber},TEST-[^,]+,,,500\\.00,0\\.00,0\\.00,0\\.00,500\\.00$`)));
    expect(lines).toContainEqual(expect.stringMatching(new RegExp(`,Receipt,[^,]+,TEST-[^,]+,upi,${billNumber},,,,,500\\.00$`)));
    expect(lines).toContainEqual(expect.stringMatching(new RegExp(`,Deposit,${depositNumber},TEST-[^,]+,cash,,,,,,1000\\.00$`)));
    expect(lines).toContainEqual(expect.stringMatching(new RegExp(`,"Receipt, void",${voidedNumber},TEST-[^,]+,cash,,,,,,0\\.00$`)));
    expect(lines).toContainEqual(expect.stringMatching(new RegExp(`,Refund,[^,]+,TEST-[^,]+,cash,${depositNumber},,,,,300\\.00$`)));
    expect(lines).toHaveLength(6);
    expect((await get('/api/v1/reports/day-book', clerk)).status).toBe(403);
  });

  it('limits exports per user per hour', async () => {
    // One export was made above; the limit counts per user.
    for (let i = 1; i < EXPORT_LIMIT; i += 1) expect((await get('/api/v1/reports/day-book', finance)).status).toBe(200);
    const limited = await get('/api/v1/reports/day-book', finance);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect((await get('/api/v1/reports/day-book', md)).status).toBe(200);
    // Reports that are not exports are not limited this way.
    expect((await get('/api/v1/reports/collections', finance)).status).toBe(200);
  });

  it('counts the day for the MD', async () => {
    expect((await get('/api/v1/reports/operations', finance)).status).toBe(403);
    const response = await get('/api/v1/reports/operations', md);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ date: todayIst(), opd: { tokens: 0, seen: 0, cancelled: 0 }, admissions: 0, discharges: 0, beds: { total: 0 }, wards: [] });
  });
});
