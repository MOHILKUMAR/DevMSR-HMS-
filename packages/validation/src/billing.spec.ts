import { describe, expect, it } from 'vitest';
import { closeShiftSchema, postChargeSchema, takeDepositSchema, takePaymentSchema } from './billing.js';

const invoiceId = '0b4b6f0e-5c1d-4f7a-9d3e-2a1b0c9d8e7f';

describe('payment details by mode', () => {
  const pay = (details: Record<string, unknown>) => takePaymentSchema.safeParse({ invoiceId, amountPaise: 50_000, ...details }).success;

  it('needs nothing more for cash, and refuses stray details', () => {
    expect(pay({ mode: 'cash' })).toBe(true);
    expect(pay({ mode: 'cash', reference: '123456' })).toBe(false);
  });

  it('needs the UTR for UPI, approval code and last 4 digits for a card, and number and bank for a transfer or cheque', () => {
    expect(pay({ mode: 'upi', reference: '412345678901' })).toBe(true);
    expect(pay({ mode: 'upi' })).toBe(false);
    expect(pay({ mode: 'card', reference: 'A1B2C3', cardLast4: '4242' })).toBe(true);
    expect(pay({ mode: 'card', reference: 'A1B2C3' })).toBe(false);
    expect(pay({ mode: 'card', reference: 'A1B2C3', cardLast4: '42a2' })).toBe(false);
    expect(pay({ mode: 'cheque', reference: '000123', bankName: 'State Bank of India' })).toBe(true);
    expect(pay({ mode: 'bank_transfer', reference: 'NEFT12345' })).toBe(false);
  });

  it('takes only amounts of at least one paisa', () => {
    expect(pay({ mode: 'cash', amountPaise: 0 })).toBe(false);
    expect(pay({ mode: 'cash', amountPaise: 12.5 })).toBe(false);
    expect(takeDepositSchema.safeParse({ patientId: invoiceId, mode: 'cash', amountPaise: 1 }).success).toBe(true);
  });
});

describe('charges and shifts', () => {
  it('posts 1 to 999 units', () => {
    expect(postChargeSchema.safeParse({ serviceItemId: invoiceId, quantity: 1 }).success).toBe(true);
    expect(postChargeSchema.safeParse({ serviceItemId: invoiceId, quantity: 0 }).success).toBe(false);
    expect(postChargeSchema.safeParse({ serviceItemId: invoiceId, quantity: 1000 }).success).toBe(false);
  });

  it('closes a shift with a count, and a reason of at least 3 characters when given', () => {
    expect(closeShiftSchema.safeParse({ countedCashPaise: 0 }).success).toBe(true);
    expect(closeShiftSchema.safeParse({ countedCashPaise: 100, differenceReason: 'ok' }).success).toBe(false);
  });
});
