import { addDays, istMidnight, todayIst } from '../common/dates.js';

/**
 * The nights a stay is charged for, as the IST days they close (docs/billing-rules.md): one for every
 * midnight the patient is admitted across, up to `now`. Day D is charged when the midnight at the end
 * of D falls after admission, before discharge, and is already past. Oldest first.
 */
export function nightsToCharge(admittedAt: Date, dischargedAt: Date | null, now: Date): string[] {
  const nights: string[] = [];
  for (let day = todayIst(admittedAt); ; day = addDays(day, 1)) {
    const midnight = istMidnight(addDays(day, 1));
    if (midnight > now) break;
    if (dischargedAt !== null && dischargedAt <= midnight) break;
    if (admittedAt < midnight) nights.push(day);
  }
  return nights;
}

/** The bed the patient held at a moment, from their assignments: the one that started by then and had not ended. */
export function heldAt<T extends { startedAt: Date; endedAt: Date | null }>(assignments: readonly T[], moment: Date): T | undefined {
  return assignments.find((assignment) => assignment.startedAt <= moment && (assignment.endedAt === null || assignment.endedAt > moment));
}

/**
 * The days a stay still open at `now` is charged for: one per midnight crossed so far, or the day of
 * admission when no midnight has passed yet, since an admission and discharge on the same day is
 * charged one day (docs/billing-rules.md). That day is the same key the first night would use, so it
 * is never charged twice if the patient stays after all.
 */
export function chargeableDays(admittedAt: Date, now: Date): string[] {
  const nights = nightsToCharge(admittedAt, null, now);
  return nights.length > 0 ? nights : [todayIst(admittedAt)];
}

/**
 * The bed whose room category prices a day: the one held at the midnight that closes it, or for a
 * same-day stay that has not crossed a midnight, the one held at `now`.
 */
export function bedForDay<T extends { startedAt: Date; endedAt: Date | null }>(assignments: readonly T[], day: string, now: Date): T | undefined {
  const midnight = istMidnight(addDays(day, 1));
  return heldAt(assignments, midnight <= now ? midnight : now);
}

/** Days among `days` that lack their room or their nursing charge. */
export function daysMissingCharges(days: readonly string[], posted: readonly { chargeDate: string; kind: string }[]): string[] {
  const done = new Set(posted.map((day) => `${day.chargeDate}:${day.kind}`));
  return days.filter((day) => !done.has(`${day}:room`) || !done.has(`${day}:nursing`));
}
