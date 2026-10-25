import { describe, expect, it } from 'vitest';
import { collectionTotals } from './collection.js';
import { dayBookCsv, rupees, textCell, type DayBookEntry } from './day-book.js';

describe('collectionTotals', () => {
  it('adds receipts by cashier and mode, leaves void receipts out and takes refunds off', () => {
    const totals = collectionTotals(
      [
        { cashierId: 'asha', mode: 'cash', purpose: 'bill_payment', amountPaise: 50_000n, voided: false },
        { cashierId: 'asha', mode: 'cash', purpose: 'deposit', amountPaise: 500_000n, voided: false },
        { cashierId: 'asha', mode: 'upi', purpose: 'bill_payment', amountPaise: 20_000n, voided: false },
        { cashierId: 'ravi', mode: 'cash', purpose: 'bill_payment', amountPaise: 30_000n, voided: true },
      ],
      [{ cashierId: 'ravi', mode: 'cash', amountPaise: 100_000n }],
    );
    expect(totals.totals).toEqual({ paymentsPaise: 70_000n, depositsPaise: 500_000n, refundsPaise: 100_000n, netPaise: 470_000n, receipts: 3, refunds: 1 });
    expect(totals.voided).toEqual({ count: 1, amountPaise: 30_000n });
    expect(totals.rows.map((row) => [row.cashierId, row.mode, row.counts.netPaise])).toEqual([
      ['asha', 'cash', 550_000n],
      ['asha', 'upi', 20_000n],
      ['ravi', 'cash', -100_000n],
    ]);
    expect(totals.byMode.map((row) => [row.mode, row.counts.netPaise])).toEqual([
      ['cash', 450_000n],
      ['upi', 20_000n],
    ]);
  });
});

describe('the day book CSV', () => {
  it('writes paise as rupees without floating point', () => {
    expect(rupees(123_450n)).toBe('1234.50');
    expect(rupees(5n)).toBe('0.05');
    expect(rupees(-50n)).toBe('-0.50');
    expect(rupees(9_007_199_254_740_993n)).toBe('90071992547409.93');
  });

  it('quotes text that needs it and never lets a cell start a formula', () => {
    expect(textCell('DEMO/INV/2026-27/000001')).toBe('DEMO/INV/2026-27/000001');
    expect(textCell('a, b')).toBe('"a, b"');
    expect(textCell('say "hi"')).toBe('"say ""hi"""');
    expect(textCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(textCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('lists vouchers in the order they happened, dated in IST, with CRLF lines', () => {
    const entry = (at: string, number: string): DayBookEntry => ({
      at: new Date(at),
      type: 'Receipt',
      number,
      uhid: 'DEMO-2026-000001',
      mode: 'cash',
      against: '',
      taxablePaise: null,
      cgstPaise: null,
      sgstPaise: null,
      roundOffPaise: null,
      amountPaise: 10_000n,
    });
    // 11:30 pm IST on the 25th is still the 25th; 00:30 am IST on the 26th is the 26th.
    const csv = dayBookCsv([entry('2026-10-25T19:00:00.000Z', 'RCT-2'), entry('2026-10-25T18:00:00.000Z', 'RCT-1')]);
    expect(csv.split('\r\n')).toEqual([
      'Date,Voucher type,Number,Patient UHID,Mode,Against,Taxable,CGST,SGST,Round off,Amount',
      '2026-10-25,Receipt,RCT-1,DEMO-2026-000001,cash,,,,,,100.00',
      '2026-10-26,Receipt,RCT-2,DEMO-2026-000001,cash,,,,,,100.00',
      '',
    ]);
  });
});
