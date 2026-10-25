// Display formats from CLAUDE.md section 16. Values are stored in UTC and shown in IST.

const dateTime = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** `24 Oct 2026, 10:30 am` in IST. */
export function formatDateTime(value: Date | string): string {
  return dateTime.format(typeof value === 'string' ? new Date(value) : value).replace(/\s?(AM|PM)$/i, (m) => ` ${m.trim().toLowerCase()}`);
}

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

/** Amounts are stored as integer paise; this is the only place they become rupees, for display. */
export function formatPaise(paise: bigint | number): string {
  const value = typeof paise === 'bigint' ? paise : BigInt(paise);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  // Split in integer arithmetic so large amounts never pass through floating point.
  const rupees = absolute / 100n;
  const remainder = Number(absolute % 100n);
  const formatted = money.format(rupees).replace(/\.00$/, `.${String(remainder).padStart(2, '0')}`);
  return negative ? `-${formatted}` : formatted;
}
