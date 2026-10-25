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
