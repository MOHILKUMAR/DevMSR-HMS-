import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { financialYearOf, todayIst } from '../src/common/dates.js';
import { as, createHospital, createPatient, createUser, signIn, unique, type SignedInBrowser, type TestHospital } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';

interface ErrorBody {
  error: { code: string };
}
interface InvoiceBody {
  id: string;
  status: string;
  number: string | null;
  discountPaise: number;
  totalPaise: number;
  paidPaise: number;
  creditedPaise: number;
  refundedPaise: number;
  duePaise: number;
  refundablePaise: number;
  lines: { lineNo: number; discountPaise: number; taxablePaise: number }[];
}
interface RequestBody {
  id: string;
  kind: string;
  status: string;
  amountPaise: number;
  resultInvoiceId: string | null;
  aboveLimit: boolean;
  creditNote: { id: string; number: string; totalPaise: number } | null;
}
interface ReceiptBody {
  id: string;
  heldPaise: number;
  voidedAt: string | null;
}
interface ShiftBody {
  id: string;
  expectedCashPaise: number;
  refundsPaise: number;
  cashRefundsPaise: number;
}

describe('discounts, credit notes, refunds and receipt voids', () => {
  let t: TestApp;
  let hospital: TestHospital;
  let clerk: SignedInBrowser;
  let clerkId: string;
  let cashier: SignedInBrowser;
  let finance: SignedInBrowser;
  let md: SignedInBrowser;
  let otherFinance: SignedInBrowser;
  /** Rs 1,000, not taxed. */
  let consultation: string;
  /** Rs 3,000 a day, 5% tax. */
  let room: string;
  const fy = financialYearOf(todayIst());

  async function serviceItem(hospitalId: string, ratePaise: bigint, taxRateBp: number): Promise<string> {
    const item = await t.prisma.serviceItem.create({
      data: { hospitalId, code: unique('SI').toUpperCase().slice(0, 16), name: `Service ${unique('S')}`, kind: 'procedure' },
      select: { id: true },
    });
    await t.prisma.tariffRate.create({ data: { hospitalId, serviceItemId: item.id, ratePaise, taxRateBp, effectiveFrom: new Date('2026-01-01T00:00:00Z') } });
    return item.id;
  }

  beforeAll(async () => {
    t = await createTestApp();
    hospital = await createHospital(t.prisma);
    const other = await createHospital(t.prisma);
    const clerkUser = await createUser(t.prisma, hospital, 'billing_clerk');
    clerkId = clerkUser.id;
    clerk = await signIn(t, clerkUser);
    cashier = await signIn(t, await createUser(t.prisma, hospital, 'cashier'));
    finance = await signIn(t, await createUser(t.prisma, hospital, 'accountant'));
    md = await signIn(t, await createUser(t.prisma, hospital, 'md'));
    otherFinance = await signIn(t, await createUser(t.prisma, other, 'accountant'));
    consultation = await serviceItem(hospital.id, 100_000n, 0);
    room = await serviceItem(hospital.id, 300_000n, 500);
  });

  afterAll(async () => {
    await t.close();
  });

  const post = (path: string, browser: SignedInBrowser, body: object, key: string = randomUUID()) =>
    as(request(t.http).post(path), browser).set('Idempotency-Key', key).send(body);
  const get = (path: string, browser: SignedInBrowser) => as(request(t.http).get(path), browser);
  const code = (response: request.Response) => (response.body as ErrorBody).error.code;
  const bill = async (id: string) => (await get(`/api/v1/invoices/${id}`, clerk)).body as InvoiceBody;

  /** A draft with Rs 1,000 consultation and 2 days of room (Rs 6,000 plus 5% tax). */
  async function draftFor(patientId: string): Promise<InvoiceBody> {
    const chargeIds: string[] = [];
    for (const [serviceItemId, quantity] of [
      [consultation, 1],
      [room, 2],
    ] as const) {
      chargeIds.push(((await post(`/api/v1/patients/${patientId}/charges`, clerk, { serviceItemId, quantity })).body as { id: string }).id);
    }
    return (await post('/api/v1/invoices', clerk, { patientId, chargeIds })).body as InvoiceBody;
  }

  async function issuedBill(patientId: string): Promise<InvoiceBody> {
    const draft = await draftFor(patientId);
    return (await post(`/api/v1/invoices/${draft.id}/issue`, clerk, {})).body as InvoiceBody;
  }

  async function openShift(browser: SignedInBrowser): Promise<string> {
    const current = (await get('/api/v1/cash-shifts/current', browser)).body as { shift: { id: string } | null };
    if (current.shift !== null) return current.shift.id;
    return ((await as(request(t.http).post('/api/v1/cash-shifts'), browser).send({ openingCashPaise: 100_000 })).body as { id: string }).id;
  }

  const currentShift = async () => ((await get('/api/v1/cash-shifts/current', cashier)).body as { shift: ShiftBody }).shift;

  it('approves a bill discount by replacing the draft, shared across lines before tax', async () => {
    const patient = await createPatient(t.prisma, hospital.id);
    const draft = await draftFor(patient.id);
    // Rs 700 off the Rs 7,000 subtotal: Rs 100 off the consultation, Rs 600 off the room.
    const asked = await post('/api/v1/discount-requests', clerk, { invoiceId: draft.id, reason: 'Staff family', discount: { scope: 'bill_amount', amountPaise: 70_000 } });
    expect(asked.status).toBe(201);
    const requestId = (asked.body as RequestBody).id;
    expect(asked.body).toMatchObject({ kind: 'discount', status: 'pending', amountPaise: 70_000, aboveLimit: false });

    // While it waits, the draft can be neither issued nor discarded, and nobody asks twice.
    expect(code(await post(`/api/v1/invoices/${draft.id}/issue`, clerk, {}))).toBe('REQUEST_PENDING');
    expect(code(await post('/api/v1/discount-requests', clerk, { invoiceId: draft.id, reason: 'Again', discount: { scope: 'bill_percent', percentBp: 500 } }))).toBe('REQUEST_PENDING');
    await expect(t.prisma.invoice.update({ where: { id: draft.id }, data: { status: 'discarded', discardedAt: new Date(), discardedById: clerkId } })).rejects.toThrow(/waiting/);

    // The clerk cannot approve; finance can, under the Rs 1,000 limit.
    expect((await post(`/api/v1/discount-requests/${requestId}/approve`, clerk, {})).status).toBe(403);
    const approved = await post(`/api/v1/discount-requests/${requestId}/approve`, finance, { note: 'Approved' });
    expect(approved.status).toBe(200);
    const result = approved.body as RequestBody;
    expect(result).toMatchObject({ status: 'approved' });
    expect(result.resultInvoiceId).not.toBe(draft.id);

    expect((await bill(draft.id)).status).toBe('discarded');
    const replacement = await bill(result.resultInvoiceId ?? '');
    // 900 + (6,000 - 600) + 5% of 5,400 = 6,570.
    expect(replacement).toMatchObject({ status: 'draft', discountPaise: 70_000, totalPaise: 657_000 });
    expect(replacement.lines.map((line) => line.discountPaise)).toEqual([10_000, 60_000]);
    expect(code(await post(`/api/v1/discount-requests/${requestId}/approve`, md, {}))).toBe('REQUEST_DECIDED');
    expect((await post(`/api/v1/invoices/${replacement.id}/issue`, clerk, {})).status).toBe(200);
  });

  it('keeps discounts above the finance limit for the MD, and never lets the requester approve', async () => {
    const patient = await createPatient(t.prisma, hospital.id);
    const draft = await draftFor(patient.id);
    const asked = (await post('/api/v1/discount-requests', clerk, { invoiceId: draft.id, reason: 'Hardship', discount: { scope: 'bill_percent', percentBp: 2_000 } })).body as RequestBody;
    expect(asked).toMatchObject({ amountPaise: 140_000, aboveLimit: true });
    expect(code(await post(`/api/v1/discount-requests/${asked.id}/approve`, finance, {}))).toBe('ABOVE_APPROVAL_LIMIT');
    expect((await post(`/api/v1/discount-requests/${asked.id}/approve`, md, {})).status).toBe(200);

    // A user who is both clerk and accountant still cannot approve their own request.
    const both = await createUser(t.prisma, hospital, 'accountant');
    const clerkRole = hospital.roleIds.get('billing_clerk');
    if (clerkRole === undefined) throw new Error('No billing clerk role');
    await t.prisma.userRole.create({ data: { userId: both.id, roleId: clerkRole } });
    const bothBrowser = await signIn(t, both);
    const other = await draftFor((await createPatient(t.prisma, hospital.id)).id);
    const own = (await post('/api/v1/discount-requests', bothBrowser, { invoiceId: other.id, reason: 'Own', discount: { scope: 'lines', lines: [{ lineNo: 1, discountPaise: 5_000 }] } })).body as RequestBody;
    expect(code(await post(`/api/v1/discount-requests/${own.id}/approve`, bothBrowser, {}))).toBe('SELF_APPROVAL_NOT_ALLOWED');
    await expect(
      t.prisma.approvalRequest.update({ where: { id: own.id }, data: { status: 'approved', decidedById: both.id, decidedAt: new Date() } }),
    ).rejects.toThrow(/approval_requests_decision/);

    // A rejection needs a reason, and the draft can then be issued as it was.
    expect((await post(`/api/v1/discount-requests/${own.id}/reject`, finance, {})).status).toBe(400);
    expect((await post(`/api/v1/discount-requests/${own.id}/reject`, finance, { note: 'Not eligible' })).body).toMatchObject({ status: 'rejected' });
    expect((await post(`/api/v1/invoices/${other.id}/issue`, clerk, {})).status).toBe(200);
  });

  it('credits part of a paid bill, then voids the rest, so the patient can be refunded', async () => {
    const patient = await createPatient(t.prisma, hospital.id);
    const issued = await issuedBill(patient.id);
    expect(issued.totalPaise).toBe(730_000);
    await openShift(cashier);
    expect((await post('/api/v1/payments', cashier, { invoiceId: issued.id, mode: 'cash', amountPaise: 730_000 })).status).toBe(201);

    // One day of room back: Rs 3,000 plus Rs 150 tax.
    const partial = (await post('/api/v1/credit-note-requests', clerk, { invoiceId: issued.id, reason: 'Left a day early', credit: { scope: 'lines', lines: [{ lineNo: 2, quantity: 1 }] } })).body as RequestBody;
    expect(partial.amountPaise).toBe(315_000);
    const approved = (await post(`/api/v1/credit-note-requests/${partial.id}/approve`, finance, {})).body as RequestBody;
    expect(approved.creditNote?.number).toMatch(new RegExp(`^${hospital.code}/CN/${fy}/\\d{6}$`));
    expect(await bill(issued.id)).toMatchObject({ creditedPaise: 315_000, duePaise: 0, refundablePaise: 315_000 });

    // The rest of the bill, cancelled as a void: exactly what is left of the total.
    const rest = (await post('/api/v1/credit-note-requests', clerk, { invoiceId: issued.id, reason: 'Billed the wrong patient', credit: { scope: 'whole_bill' } })).body as RequestBody;
    expect(rest.amountPaise).toBe(415_000);
    expect((await post(`/api/v1/credit-note-requests/${rest.id}/approve`, md, {})).status).toBe(200);
    expect(await bill(issued.id)).toMatchObject({ creditedPaise: 730_000, refundablePaise: 730_000 });
    expect(code(await post('/api/v1/credit-note-requests', clerk, { invoiceId: issued.id, reason: 'More', credit: { scope: 'whole_bill' } }))).toBe('AMOUNT_TOO_LARGE');

    const note = approved.creditNote?.id ?? '';
    expect((await get(`/api/v1/credit-notes/${note}`, finance)).body).toMatchObject({ totalPaise: 315_000, invoiceNumber: issued.number });
    await expect(t.prisma.creditNote.update({ where: { id: note }, data: { totalPaise: 1n } })).rejects.toThrow(/written once/);

    // The MD approves the refund; the cashier pays it in cash, out of the drawer.
    const before = await currentShift();
    const refund = (await post('/api/v1/refund-requests', cashier, { reason: 'Bill cancelled', amountPaise: 730_000, mode: 'cash', source: { kind: 'bill', invoiceId: issued.id } })).body as RequestBody;
    expect(code(await post(`/api/v1/refund-requests/${refund.id}/pay`, cashier, {}))).toBe('REFUND_NOT_READY');
    expect((await post(`/api/v1/refund-requests/${refund.id}/approve`, finance, {})).status).toBe(403);
    expect((await post(`/api/v1/refund-requests/${refund.id}/approve`, md, {})).status).toBe(200);
    const paid = await post(`/api/v1/refund-requests/${refund.id}/pay`, cashier, {});
    expect(paid.status).toBe(201);
    expect((paid.body as { number: string }).number).toMatch(new RegExp(`^${hospital.code}/RF/${fy}/\\d{6}$`));
    expect(code(await post(`/api/v1/refund-requests/${refund.id}/pay`, cashier, {}))).toBe('REFUND_NOT_READY');
    expect(await bill(issued.id)).toMatchObject({ refundedPaise: 730_000, refundablePaise: 0, duePaise: 0 });
    const after = await currentShift();
    expect(after.expectedCashPaise).toBe(before.expectedCashPaise - 730_000);
    expect(after.cashRefundsPaise - before.cashRefundsPaise).toBe(730_000);
  });

  it('refunds excess deposit within what is held, and asks a UPI refund for its UTR', async () => {
    const patient = await createPatient(t.prisma, hospital.id);
    await openShift(cashier);
    const deposit = (await post('/api/v1/deposits', cashier, { patientId: patient.id, mode: 'cash', amountPaise: 100_000 })).body as ReceiptBody;
    const tooMuch = await post('/api/v1/refund-requests', cashier, { reason: 'Too much', amountPaise: 100_001, mode: 'upi', source: { kind: 'deposit', receiptId: deposit.id } });
    expect(code(tooMuch)).toBe('AMOUNT_TOO_LARGE');

    const refund = (await post('/api/v1/refund-requests', cashier, { reason: 'Discharged early', amountPaise: 40_000, mode: 'upi', source: { kind: 'deposit', receiptId: deposit.id } })).body as RequestBody;
    await post(`/api/v1/refund-requests/${refund.id}/approve`, md, {});
    expect((await post(`/api/v1/refund-requests/${refund.id}/pay`, cashier, {})).status).toBe(400);
    expect((await post(`/api/v1/refund-requests/${refund.id}/pay`, cashier, { reference: '412345678901' })).status).toBe(201);
    expect(((await get(`/api/v1/receipts/${deposit.id}`, cashier)).body as ReceiptBody).heldPaise).toBe(60_000);
    // A deposit that has been refunded from cannot be voided.
    expect(code(await post('/api/v1/void-requests', cashier, { receiptId: deposit.id, reason: 'Mistake' }))).toBe('RECEIPT_NOT_VOIDABLE');
  });

  it('voids a wrong receipt while its shift is open, so the bill is due again and the drawer expects less', async () => {
    const patient = await createPatient(t.prisma, hospital.id);
    const issued = await issuedBill(patient.id);
    await openShift(cashier);
    const before = await currentShift();
    const receipt = (await post('/api/v1/payments', cashier, { invoiceId: issued.id, mode: 'cash', amountPaise: 30_000 })).body as ReceiptBody;
    const asked = (await post('/api/v1/void-requests', cashier, { receiptId: receipt.id, reason: 'Wrong patient' })).body as RequestBody;
    expect(asked).toMatchObject({ kind: 'receipt_void', amountPaise: 30_000 });
    expect((await post(`/api/v1/void-requests/${asked.id}/approve`, cashier, {})).status).toBe(403);
    expect((await post(`/api/v1/void-requests/${asked.id}/approve`, finance, {})).status).toBe(200);

    expect(((await get(`/api/v1/receipts/${receipt.id}`, cashier)).body as ReceiptBody).voidedAt).not.toBeNull();
    expect(await bill(issued.id)).toMatchObject({ paidPaise: 0, duePaise: 730_000 });
    expect((await currentShift()).expectedCashPaise).toBe(before.expectedCashPaise);
    // A void receipt cannot be voided again, nor set against a bill.
    expect(code(await post('/api/v1/void-requests', cashier, { receiptId: receipt.id, reason: 'Again' }))).toBe('RECEIPT_NOT_VOIDABLE');
  });

  it('refuses a receipt void once its shift is closed', async () => {
    const lateCashier = await signIn(t, await createUser(t.prisma, hospital, 'cashier'));
    const patient = await createPatient(t.prisma, hospital.id);
    const shiftId = await openShift(lateCashier);
    const receipt = (await post('/api/v1/deposits', lateCashier, { patientId: patient.id, mode: 'cash', amountPaise: 10_000 })).body as ReceiptBody;
    await as(request(t.http).post(`/api/v1/cash-shifts/${shiftId}/close`), lateCashier).send({ countedCashPaise: 110_000 });
    expect(code(await post('/api/v1/void-requests', lateCashier, { receiptId: receipt.id, reason: 'Late' }))).toBe('RECEIPT_NOT_VOIDABLE');
  });

  it("hides another hospital's requests, and decides a request once when two approve at once", async () => {
    const patient = await createPatient(t.prisma, hospital.id);
    const draft = await draftFor(patient.id);
    const asked = (await post('/api/v1/discount-requests', clerk, { invoiceId: draft.id, reason: 'Race', discount: { scope: 'bill_amount', amountPaise: 1_000 } })).body as RequestBody;
    expect((await post(`/api/v1/discount-requests/${asked.id}/approve`, otherFinance, {})).status).toBe(404);
    expect((await get(`/api/v1/approval-requests/${asked.id}`, otherFinance)).status).toBe(404);

    const [first, second] = await Promise.all([
      post(`/api/v1/discount-requests/${asked.id}/approve`, finance, {}),
      post(`/api/v1/discount-requests/${asked.id}/approve`, md, {}),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const drafts = await t.prisma.invoice.count({ where: { patientId: patient.id, status: 'draft' } });
    expect(drafts).toBe(1);

    const pending = (await get(`/api/v1/approval-requests?status=approved&invoiceId=${draft.id}`, finance)).body as { total: number };
    expect(pending.total).toBe(1);
  });
});
