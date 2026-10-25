import { describe, expect, it } from 'vitest';
import { bedForDay, chargeableDays, daysMissingCharges, heldAt, nightsToCharge } from './nights.js';

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

describe('chargeableDays', () => {
  it('is the nights crossed, or the admission day for a stay that crossed none', () => {
    expect(chargeableDays(ist('2026-10-24T22:00:00'), ist('2026-10-26T11:00:00'))).toEqual(['2026-10-24', '2026-10-25']);
    // In at 9 am, out at 5 pm the same day: one day (docs/billing-rules.md).
    expect(chargeableDays(ist('2026-10-26T09:00:00'), ist('2026-10-26T17:00:00'))).toEqual(['2026-10-26']);
  });

  it('keys the same-day charge as the first night, so a stay that goes on is not charged twice', () => {
    const sameDay = chargeableDays(ist('2026-10-26T09:00:00'), ist('2026-10-26T17:00:00'));
    expect(chargeableDays(ist('2026-10-26T09:00:00'), ist('2026-10-27T00:05:00'))).toEqual(sameDay);
  });
});

describe('daysMissingCharges', () => {
  it('lists days without both their room and nursing charge', () => {
    const posted = [
      { chargeDate: '2026-10-24', kind: 'room' },
      { chargeDate: '2026-10-24', kind: 'nursing' },
      { chargeDate: '2026-10-25', kind: 'room' },
    ];
    expect(daysMissingCharges(['2026-10-24', '2026-10-25', '2026-10-26'], posted)).toEqual(['2026-10-25', '2026-10-26']);
  });
});

describe('bedForDay', () => {
  const beds = [
    { bed: 'GEN-1', startedAt: ist('2026-10-26T09:00:00'), endedAt: ist('2026-10-26T13:00:00') },
    { bed: 'ICU-1', startedAt: ist('2026-10-26T13:00:00'), endedAt: null },
  ];

  it('prices a crossed night by the bed held at its midnight, and a same-day stay by the bed held now', () => {
    expect(bedForDay(beds, '2026-10-26', ist('2026-10-27T08:00:00'))?.bed).toBe('ICU-1');
    expect(bedForDay(beds, '2026-10-26', ist('2026-10-26T12:00:00'))?.bed).toBe('GEN-1');
  });
});
