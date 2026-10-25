import { describe, expect, it } from 'vitest';
import { addDays, financialYearOf, fromDateOnly, toDateOnly, todayIst } from './dates.js';

describe('dates', () => {
  it('gives today in IST, which runs 5.5 hours ahead of UTC', () => {
    expect(todayIst(new Date('2026-10-24T18:29:59Z'))).toBe('2026-10-24');
    expect(todayIst(new Date('2026-10-24T18:30:00Z'))).toBe('2026-10-25');
  });

  it('round-trips DATE column values', () => {
    expect(toDateOnly(fromDateOnly('2026-03-31'))).toBe('2026-03-31');
  });

  it('adds days across month and year ends', () => {
    expect(addDays('2026-03-31', 1)).toBe('2026-04-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });
});

describe('financialYearOf', () => {
  it('runs from 1 April to 31 March', () => {
    expect(financialYearOf('2026-04-01')).toBe('2026-27');
    expect(financialYearOf('2027-03-31')).toBe('2026-27');
    expect(financialYearOf('2026-03-31')).toBe('2025-26');
    expect(financialYearOf('2099-12-31')).toBe('2099-00');
  });
});
