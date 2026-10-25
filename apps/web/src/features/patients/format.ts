// How patient details read on screen. Dates are IST calendar dates (YYYY-MM-DD).

export type AgeUnit = 'years' | 'months' | 'days';

/**
 * Age on `today` in the unit staff use: whole years from 1 year old, whole months under that,
 * days under a month.
 */
export function ageParts(dateOfBirth: string, today: string): { count: number; unit: AgeUnit } {
  const [by = 0, bm = 1, bd = 1] = dateOfBirth.split('-').map(Number);
  const [ty = 0, tm = 1, td = 1] = today.split('-').map(Number);
  let months = (ty - by) * 12 + (tm - bm);
  if (td < bd) months -= 1;
  if (months >= 12) return { count: Math.floor(months / 12), unit: 'years' };
  if (months >= 1) return { count: months, unit: 'months' };
  const days = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(by, bm - 1, bd)) / 86_400_000);
  return { count: Math.max(0, days), unit: 'days' };
}

/** `+919876543210` as `+91 98765 43210`. Anything else is shown as stored. */
export function formatMobile(phone: string): string {
  const match = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return match === null ? phone : `+91 ${match[1] ?? ''} ${match[2] ?? ''}`;
}

/** The mobile number as a form shows it for editing: the 10 digits without +91. */
export function mobileInput(phone: string | null): string {
  return phone?.replace(/^\+91/, '') ?? '';
}

/** Aadhaar as UIDAI masks it: `XXXX XXXX 1234`. The full number never reaches the screen. */
export function maskedAadhaar(last4: string): string {
  return `XXXX XXXX ${last4}`;
}

/** ABHA number masked the same way: `XX-XXXX-XXXX-5678`. */
export function maskedAbha(last4: string): string {
  return `XX-XXXX-XXXX-${last4}`;
}
