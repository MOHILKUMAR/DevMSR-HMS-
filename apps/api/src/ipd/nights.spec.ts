import { describe, expect, it } from 'vitest';
import { heldAt, nightsToCharge } from './nights.js';

/** An instant in IST, written as on the ward clock. */
const ist = (value: string) => new Date(`${value}+05:30`);

describe('nightsToCharge', () => {
  it('charges one day for every midnight crossed in a bed', () => {
    // Admitted at 10 pm on the 24th; it is now 00:05 on the 27th: midnights after the 24th, 25th and 26th.
    expect(nightsToCharge(ist('2026-10-24T22:00:00'), null, ist('2026-10-27T00:05:00'))).toEqual(['2026-10-24', '2026-10-25', '2026-10-26']);
  });

  it('charges nothing before the first midnight has passed', () => {
    expect(nightsToCharge(ist('2026-10-26T09:00:00'), null, ist('2026-10-26T23:59:00'))).toEqual([]);
  });

  it('stops at discharge: a midnight after the patient left is not charged', () => {
    expect(nightsToCharge(ist('2026-10-24T10:00:00'), ist('2026-10-26T11:00:00'), ist('2026-10-28T00:05:00'))).toEqual(['2026-10-24', '2026-10-25']);
    // Discharged at 11:30 pm the same day they came: no midnight crossed (slice 6 charges that day once).
    expect(nightsToCharge(ist('2026-10-24T10:00:00'), ist('2026-10-24T23:30:00'), ist('2026-10-28T00:05:00'))).toEqual([]);
  });

  it('does not count the midnight a patient is admitted exactly at', () => {
    expect(nightsToCharge(ist('2026-10-25T00:00:00'), null, ist('2026-10-26T00:05:00'))).toEqual(['2026-10-25']);
  });
});

describe('heldAt', () => {
  const beds = [
    { bed: 'ICU-1', startedAt: ist('2026-10-24T10:00:00'), endedAt: ist('2026-10-25T15:00:00') },
    { bed: 'GEN-4', startedAt: ist('2026-10-25T15:00:00'), endedAt: null },
  ];

  it('finds the bed held at midnight, which sets that day\'s rate', () => {
    expect(heldAt(beds, ist('2026-10-25T00:00:00'))?.bed).toBe('ICU-1');
    expect(heldAt(beds, ist('2026-10-26T00:00:00'))?.bed).toBe('GEN-4');
    expect(heldAt(beds, ist('2026-10-24T00:00:00'))).toBeUndefined();
  });
});
