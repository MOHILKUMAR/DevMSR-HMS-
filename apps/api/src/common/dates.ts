// Calendar dates (YYYY-MM-DD) as the hospital sees them, in IST. Instants stay in UTC.

const istDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Today's date in IST, for example `2026-10-25`. */
export function todayIst(now: Date = new Date()): string {
  return istDate.format(now);
}

/** A DATE column value as Prisma returns it (midnight UTC) to `YYYY-MM-DD`. */
export function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` to the Date Prisma expects for a DATE column. */
export function fromDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function addDays(value: string, days: number): string {
  const date = fromDateOnly(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateOnly(date);
}

/**
 * The Indian financial year (1 April to 31 March) of an IST date, as bill numbers write it:
 * `2026-04-01` and `2027-03-31` are both in `2026-27`.
 */
export function financialYearOf(date: string): string {
  const year = Number(date.slice(0, 4));
  const start = Number(date.slice(5, 7)) >= 4 ? year : year - 1;
  return `${String(start)}-${String((start + 1) % 100).padStart(2, '0')}`;
}
