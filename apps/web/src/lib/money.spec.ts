import { describe, expect, it } from 'vitest';
import { formatDate, todayIst } from './format';
import { formatBp, paiseToRupeesInput, parsePercentToBp, parseRupeesToPaise } from './money';

describe('parseRupeesToPaise', () => {
  it('reads what staff type, without floating point', () => {
    expect(parseRupeesToPaise('500')).toBe(50_000);
    expect(parseRupeesToPaise('1250.5')).toBe(125_050);
    expect(parseRupeesToPaise('1,250.50')).toBe(125_050);
    expect(parseRupeesToPaise(' ₹ 0.05 ')).toBe(5);
    expect(parseRupeesToPaise('0')).toBe(0);
    // 0.1 + 0.2 style errors cannot happen: 1234567.89 rupees is exactly 123456789 paise.
    expect(parseRupeesToPaise('1234567.89')).toBe(123_456_789);
  });

  it('refuses anything that is not a plain amount', () => {
    for (const text of ['', ' ', '-5', '1.234', '1e5', 'abc', '12.', '.5', '5 rupees', '90071992547409.92']) {
      expect(parseRupeesToPaise(text), text).toBeNull();
    }
  });

  it('turns paise back into an editable amount', () => {
    expect(paiseToRupeesInput(125_050)).toBe('1250.50');
    expect(paiseToRupeesInput(5)).toBe('0.05');
  });
});

describe('tax rates in basis points', () => {
  it('reads a percentage', () => {
    expect(parsePercentToBp('18')).toBe(1800);
    expect(parsePercentToBp('2.5')).toBe(250);
    expect(parsePercentToBp('0')).toBe(0);
    expect(parsePercentToBp('12.75 %')).toBe(1275);
    expect(parsePercentToBp('100')).toBe(10_000);
  });

  it('refuses more than 100% and anything odd', () => {
    for (const text of ['100.01', '101', '', '-1', '1.234', 'x']) {
      expect(parsePercentToBp(text), text).toBeNull();
    }
  });

  it('shows basis points as a short percentage', () => {
    expect(formatBp(1800)).toBe('18%');
    expect(formatBp(250)).toBe('2.5%');
    expect(formatBp(1275)).toBe('12.75%');
    expect(formatBp(0)).toBe('0%');
  });
});

describe('calendar dates', () => {
  it('shows a stored date as it is, whatever the browser time zone', () => {
    expect(formatDate('2026-04-01')).toBe('01 Apr 2026');
  });

  it('knows today in IST, which is ahead of UTC', () => {
    // 20:00 UTC on 24 Oct is 01:30 IST on 25 Oct.
    expect(todayIst(new Date('2026-10-24T20:00:00Z'))).toBe('2026-10-25');
    expect(todayIst(new Date('2026-10-24T18:00:00Z'))).toBe('2026-10-24');
  });
});
