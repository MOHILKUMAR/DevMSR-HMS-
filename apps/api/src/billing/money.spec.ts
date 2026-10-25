import { describe, expect, it } from 'vitest';
import { billAmounts, creditLine, creditNoteTotal, lineAmounts, percentOf, roundToRupee, splitGst, spreadDiscount, taxPaise } from './money.js';

describe('taxPaise', () => {
  it('rounds half up to the paisa', () => {
    expect(taxPaise(10_000n, 1_800)).toBe(1_800n);
    // 5% of Rs 0.10 is half a paisa: rounds up to 1.
    expect(taxPaise(10n, 500)).toBe(1n);
    // 5% of Rs 0.09 is 0.45 paise: rounds down to 0.
    expect(taxPaise(9n, 500)).toBe(0n);
    expect(taxPaise(123_456n, 0)).toBe(0n);
  });

  it('stays exact for very large amounts, beyond floating point', () => {
    expect(taxPaise(900_719_925_474_099_300n, 1_800)).toBe(162_129_586_585_337_874n);
  });
});

describe('splitGst', () => {
  it('splits tax in half, with an odd paisa going to CGST', () => {
    expect(splitGst(1_800n)).toEqual({ cgstPaise: 900n, sgstPaise: 900n });
    expect(splitGst(5n)).toEqual({ cgstPaise: 3n, sgstPaise: 2n });
    expect(splitGst(0n)).toEqual({ cgstPaise: 0n, sgstPaise: 0n });
  });
});

describe('roundToRupee', () => {
  it('rounds to the nearest rupee; exactly 50 paise rounds up', () => {
    expect(roundToRupee(123_449n)).toEqual({ roundedPaise: 123_400n, roundOffPaise: -49n });
    expect(roundToRupee(123_450n)).toEqual({ roundedPaise: 123_500n, roundOffPaise: 50n });
    expect(roundToRupee(123_400n)).toEqual({ roundedPaise: 123_400n, roundOffPaise: 0n });
  });
});

describe('lineAmounts and billAmounts', () => {
  it('works out a taxed line: Rs 3,000 room at 5% for 2 days', () => {
    expect(lineAmounts({ unitRatePaise: 300_000n, quantity: 2, taxRateBp: 500 })).toEqual({
      amountPaise: 600_000n,
      discountPaise: 0n,
      taxablePaise: 600_000n,
      cgstPaise: 15_000n,
      sgstPaise: 15_000n,
      totalPaise: 630_000n,
    });
  });

  it('takes a discount off before tax', () => {
    const line = lineAmounts({ unitRatePaise: 100_000n, quantity: 1, taxRateBp: 1_800, discountPaise: 10_000n });
    expect(line).toMatchObject({ taxablePaise: 90_000n, cgstPaise: 8_100n, sgstPaise: 8_100n, totalPaise: 106_200n });
    expect(() => lineAmounts({ unitRatePaise: 100n, quantity: 1, taxRateBp: 0, discountPaise: 101n })).toThrow();
  });

  it('adds lines up and rounds only the bill total, shown as round off', () => {
    const bill = billAmounts([
      { unitRatePaise: 50_025n, quantity: 1, taxRateBp: 0 },
      { unitRatePaise: 30_000n, quantity: 1, taxRateBp: 500 },
    ]);
    // 500.25 + 300.00 + 7.50 + 7.50 = 815.25, rounded to 815.00.
    expect(bill).toMatchObject({
      subtotalPaise: 80_025n,
      taxablePaise: 80_025n,
      cgstPaise: 750n,
      sgstPaise: 750n,
      roundOffPaise: -25n,
      totalPaise: 81_500n,
    });
    expect(bill.totalPaise).toBe(bill.taxablePaise + bill.cgstPaise + bill.sgstPaise + bill.roundOffPaise);
  });
});

describe('percentOf', () => {
  it('rounds half up to the paisa', () => {
    expect(percentOf(100_000n, 1_000)).toBe(10_000n);
    expect(percentOf(105n, 1_000)).toBe(11n);
    expect(percentOf(104n, 1_000)).toBe(10n);
  });
});

describe('spreadDiscount', () => {
  it('shares in proportion, with the leftover paisa on the largest line', () => {
    expect(spreadDiscount([60_000n, 20_000n, 20_000n], 10_001n)).toEqual([6_001n, 2_000n, 2_000n]);
    expect(spreadDiscount([10_000n, 10_000n, 10_000n], 100n)).toEqual([34n, 33n, 33n]);
  });

  it('covers the whole bill exactly, and nothing at all', () => {
    expect(spreadDiscount([30_000n, 20_000n], 50_000n)).toEqual([30_000n, 20_000n]);
    expect(spreadDiscount([30_000n, 20_000n], 0n)).toEqual([0n, 0n]);
  });

  it('never gives a line more than its own amount', () => {
    const shares = spreadDiscount([1n, 1n, 1n], 2n);
    expect(shares.reduce((a, b) => a + b, 0n)).toBe(2n);
    expect(shares.every((share) => share <= 1n)).toBe(true);
  });

  it('refuses more than the bill', () => {
    expect(() => spreadDiscount([100n], 101n)).toThrow();
  });
});

describe('creditLine', () => {
  // 3 units of Rs 100 at 5%: taxable 30,000 paise, tax 1,500 (CGST 750, SGST 750).
  const line = {
    quantity: 3,
    taxRateBp: 500,
    taxablePaise: 30_000n,
    cgstPaise: 750n,
    sgstPaise: 750n,
    creditedTaxablePaise: 0n,
    creditedCgstPaise: 0n,
    creditedSgstPaise: 0n,
  };

  it('credits units at the line rate and reverses their tax', () => {
    expect(creditLine(line, { quantity: 1 })).toEqual({ taxablePaise: 10_000n, cgstPaise: 250n, sgstPaise: 250n, totalPaise: 10_500n });
  });

  it('gives back exactly what is left when the rest of a line is credited', () => {
    // An odd amount first: 5% of 3,333 paise is 166.65, so 167, split 84 and 83.
    expect(creditLine(line, { amountPaise: 3_333n })).toEqual({ taxablePaise: 3_333n, cgstPaise: 84n, sgstPaise: 83n, totalPaise: 3_500n });
    const rest = creditLine({ ...line, creditedTaxablePaise: 3_333n, creditedCgstPaise: 84n, creditedSgstPaise: 83n }, { amountPaise: 26_667n });
    expect(rest).toEqual({ taxablePaise: 26_667n, cgstPaise: 666n, sgstPaise: 667n, totalPaise: 28_000n });
  });

  it('refuses more than is left, more units than billed, and nothing', () => {
    expect(creditLine(line, { amountPaise: 30_001n })).toBeNull();
    expect(creditLine(line, { quantity: 4 })).toBeNull();
    expect(creditLine(line, { amountPaise: 0n })).toBeNull();
  });
});

describe('creditNoteTotal', () => {
  it('rounds a partial credit note to the rupee', () => {
    expect(creditNoteTotal(10_549n, 100_000n, 0n, false)).toEqual({ totalPaise: 10_500n, roundOffPaise: -49n });
  });

  it('makes the last credit note take exactly what is left of the bill', () => {
    expect(creditNoteTotal(89_480n, 100_000n, 10_500n, true)).toEqual({ totalPaise: 89_500n, roundOffPaise: 20n });
  });

  it('never goes past the bill, and refuses a note that rounds to nothing', () => {
    expect(creditNoteTotal(99_990n, 100_000n, 500n, false)).toEqual({ totalPaise: 99_500n, roundOffPaise: -490n });
    expect(creditNoteTotal(30n, 100_000n, 0n, false)).toBeNull();
  });
});
