// Turning what staff type into integer paise and basis points. Everything is done on the digits as
// text, so an amount never passes through floating point (CLAUDE.md section 7).

const RUPEES = /^(\d{1,13})(?:\.(\d{1,2}))?$/;
const PERCENT = /^(\d{1,3})(?:\.(\d{1,2}))?$/;

/** `"1,234.5"`, `"₹ 1234.50"` or `"1234"` to paise. Null when it is not a valid amount. */
export function parseRupeesToPaise(text: string): number | null {
  const match = RUPEES.exec(text.replace(/[₹,\s]/g, ''));
  if (match === null) return null;
  const [, rupees = '0', fraction = ''] = match;
  const paise = BigInt(rupees) * 100n + BigInt(fraction.padEnd(2, '0'));
  return paise <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(paise) : null;
}

/** Paise as an editable amount, such as `"1000.00"`, to prefill a form. */
export function paiseToRupeesInput(paise: number): string {
  const value = BigInt(paise);
  return `${String(value / 100n)}.${String(value % 100n).padStart(2, '0')}`;
}

/** A tax percentage such as `"18"` or `"2.5"` to basis points (1800, 250). Null above 100% or if invalid. */
export function parsePercentToBp(text: string): number | null {
  const match = PERCENT.exec(text.replace(/[%\s]/g, ''));
  if (match === null) return null;
  const [, whole = '0', fraction = ''] = match;
  const bp = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return bp <= 10_000 ? bp : null;
}

/** Basis points as a percentage for display: 1800 is `"18%"`, 250 is `"2.5%"`. */
export function formatBp(bp: number): string {
  const whole = Math.trunc(bp / 100);
  const fraction = String(bp % 100).padStart(2, '0').replace(/0+$/, '');
  return fraction === '' ? `${String(whole)}%` : `${String(whole)}.${fraction}%`;
}
