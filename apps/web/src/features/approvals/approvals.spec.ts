import type { ApprovalRequest } from '@devmsr/validation';
import { describe, expect, it } from 'vitest';
import { canPayOut, decideState } from './decide';
import { creditBody, creditFormSchema, discountBody, discountFormSchema, payRefundBody, refundBody } from './request-forms';

const ID = '01a172fa-5c11-7311-b601-020576ad9de3';

describe('discount form', () => {
  const values = { scope: 'bill_amount' as const, rupees: '', percent: '', lines: ['', ''], reason: 'Staff family' };

  it('needs the amount for its scope and a reason', () => {
    expect(discountFormSchema.safeParse({ ...values, rupees: '700' }).success).toBe(true);
    expect(discountFormSchema.safeParse(values).success).toBe(false);
    expect(discountFormSchema.safeParse({ ...values, rupees: '700', reason: 'x' }).success).toBe(false);
    expect(discountFormSchema.safeParse({ ...values, scope: 'lines', lines: ['', ''] }).success).toBe(false);
    expect(discountFormSchema.safeParse({ ...values, scope: 'lines', lines: ['', 'abc'] }).success).toBe(false);
  });

  it('sends paise, basis points, or only the lines with a discount', () => {
    expect(discountBody(ID, [1, 2], { ...values, rupees: '1,000.50' })?.discount).toEqual({ scope: 'bill_amount', amountPaise: 100_050 });
    expect(discountBody(ID, [1, 2], { ...values, scope: 'bill_percent', percent: '12.5' })?.discount).toEqual({ scope: 'bill_percent', percentBp: 1_250 });
    expect(discountBody(ID, [1, 2], { ...values, scope: 'lines', lines: ['', '600'] })?.discount).toEqual({ scope: 'lines', lines: [{ lineNo: 2, discountPaise: 60_000 }] });
  });
});

describe('credit note form', () => {
  it('credits the whole bill, or chosen lines by units or amount', () => {
    const lines = { scope: 'lines' as const, reason: 'Left early', lines: [{ how: 'none' as const, value: '' }, { how: 'quantity' as const, value: '1' }, { how: 'amount' as const, value: '250' }] };
    expect(creditFormSchema.safeParse(lines).success).toBe(true);
    expect(creditBody(ID, [1, 2, 3], lines)?.credit).toEqual({ scope: 'lines', lines: [{ lineNo: 2, quantity: 1 }, { lineNo: 3, amountPaise: 25_000 }] });
    expect(creditBody(ID, [1], { scope: 'whole_bill', reason: 'Wrong patient', lines: [] })?.credit).toEqual({ scope: 'whole_bill' });
    expect(creditFormSchema.safeParse({ ...lines, lines: [{ how: 'none', value: '' }] }).success).toBe(false);
    expect(creditFormSchema.safeParse({ ...lines, lines: [{ how: 'quantity', value: '0' }] }).success).toBe(false);
  });
});

describe('refund forms', () => {
  it('reads the source and amount, and sends only the details the mode needs', () => {
    expect(refundBody({ source: `deposit:${ID}`, rupees: '400', mode: 'cash', reason: 'Excess deposit' })).toEqual({
      reason: 'Excess deposit',
      amountPaise: 40_000,
      mode: 'cash',
      source: { kind: 'deposit', receiptId: ID },
    });
    expect(refundBody({ source: `bill:${ID}`, rupees: '1', mode: 'upi', reason: 'Overpaid' })?.source).toEqual({ kind: 'bill', invoiceId: ID });
    expect(payRefundBody('cash', { reference: 'left', bankName: 'over' })).toEqual({});
    expect(payRefundBody('upi', { reference: ' 412345678901 ', bankName: 'x' })).toEqual({ reference: '412345678901' });
    expect(payRefundBody('cheque', { reference: '000123', bankName: 'Canara Bank' })).toEqual({ reference: '000123', bankName: 'Canara Bank' });
  });
});

describe('who may decide', () => {
  const base: ApprovalRequest = {
    id: ID,
    kind: 'discount',
    status: 'pending',
    patient: { id: ID, uhid: 'DEMO-2026-000001', fullName: 'Test Patient' },
    invoiceId: ID,
    invoiceNumber: null,
    receiptId: null,
    receiptNumber: null,
    dischargeId: null,
    amountPaise: 50_000,
    reason: 'Staff family',
    details: { kind: 'discount', scope: 'bill_amount', percentBp: null, lines: [] },
    requestedById: 'clerk',
    requestedByName: 'Clerk',
    requestedAt: '2026-10-25T04:30:00.000Z',
    decidedByName: null,
    decidedAt: null,
    decisionNote: null,
    resultInvoiceId: null,
    creditNote: null,
    refund: null,
    aboveLimit: false,
  };
  const finance = { userId: 'finance', permissions: ['billing.discount.approve', 'billing.credit-note.approve', 'billing.void.approve'] };
  const md = { userId: 'md', permissions: ['billing.discount.approve', 'billing.discount.approve-above-limit', 'billing.refund.approve'] };

  it('lets finance decide within the limit, the MD above it, and nobody their own request', () => {
    expect(decideState(base, finance)).toBe('can-decide');
    expect(decideState({ ...base, aboveLimit: true }, finance)).toBe('md-only');
    expect(decideState({ ...base, aboveLimit: true }, md)).toBe('can-decide');
    expect(decideState({ ...base, requestedById: 'finance' }, finance)).toBe('own-request');
    expect(decideState({ ...base, status: 'approved' }, finance)).toBe('decided');
  });

  it('keeps refunds for the MD and lets a cashier pay out an approved one', () => {
    const refund: ApprovalRequest = { ...base, kind: 'refund', details: { kind: 'refund', source: 'deposit', mode: 'cash' } };
    expect(decideState(refund, finance)).toBe('no-permission');
    expect(decideState(refund, md)).toBe('can-decide');
    expect(canPayOut({ ...refund, status: 'approved' }, ['payments.refund.pay'])).toBe(true);
    expect(canPayOut({ ...refund, status: 'approved', refund: { id: ID, number: 'RF', createdAt: base.requestedAt } }, ['payments.refund.pay'])).toBe(false);
  });
});
