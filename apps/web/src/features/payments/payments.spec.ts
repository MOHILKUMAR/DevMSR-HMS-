import { describe, expect, it } from 'vitest';
import { EMPTY_PAYMENT, paymentBody, paymentFormSchema } from './payment-form';

describe('payment form', () => {
  const valid = (values: Partial<typeof EMPTY_PAYMENT>) => paymentFormSchema.safeParse({ ...EMPTY_PAYMENT, ...values }).success;

  it('takes cash with just an amount, and refuses nothing or nonsense', () => {
    expect(valid({ rupees: '1,250.50' })).toBe(true);
    expect(valid({ rupees: '0' })).toBe(false);
    expect(valid({ rupees: 'abc' })).toBe(false);
  });

  it('asks each mode for its own details', () => {
    expect(valid({ rupees: '100', mode: 'upi' })).toBe(false);
    expect(valid({ rupees: '100', mode: 'upi', reference: '412345678901' })).toBe(true);
    expect(valid({ rupees: '100', mode: 'card', reference: 'AB12CD' })).toBe(false);
    expect(valid({ rupees: '100', mode: 'card', reference: 'AB12CD', cardLast4: '4242' })).toBe(true);
    expect(valid({ rupees: '100', mode: 'cheque', reference: '000123' })).toBe(false);
    expect(valid({ rupees: '100', mode: 'cheque', reference: '000123', bankName: 'Canara Bank' })).toBe(true);
  });

  it('sends paise, and only the details the mode takes, even if other boxes were filled', () => {
    expect(paymentBody({ ...EMPTY_PAYMENT, rupees: '1,250.50', reference: 'left over' })).toEqual({ mode: 'cash', amountPaise: 125_050 });
    expect(paymentBody({ ...EMPTY_PAYMENT, rupees: '10', mode: 'card', reference: 'AB12CD', cardLast4: '4242', bankName: 'x' })).toEqual({
      mode: 'card',
      amountPaise: 1_000,
      reference: 'AB12CD',
      cardLast4: '4242',
    });
    expect(paymentBody({ ...EMPTY_PAYMENT, rupees: '' })).toBeNull();
  });
});
