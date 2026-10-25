import { describe, expect, it } from 'vitest';
import { billAmounts, lineAmounts, roundToRupee, splitGst, taxPaise } from './money.js';

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
