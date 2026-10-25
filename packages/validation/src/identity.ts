// Indian identifiers as staff type them: mobile numbers, Aadhaar and ABHA numbers. Shared by the
// screens and the API so both accept and refuse exactly the same input.

/** Spaces, hyphens, dots and brackets that people type between digit groups. */
const SEPARATORS = /[\s\-.()]/g;

/**
 * A 10-digit Indian mobile number, typed with or without +91, 91 or a leading 0, as E.164
 * (`+919876543210`). Null when it is not a mobile number.
 */
export function normalizeIndianMobile(text: string): string | null {
  const digits = text.replace(SEPARATORS, '').replace(/^\+91/, '').replace(/^91(?=\d{10}$)/, '').replace(/^0(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

// Verhoeff tables: the check digit scheme Aadhaar numbers use. It catches every single-digit
// mistake and every swap of two neighbouring digits.
const MULTIPLY = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
] as const;
const PERMUTE = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
] as const;
const INVERSE = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9] as const;

/** Runs the digits from the right, the way the Verhoeff scheme reads them. */
function verhoeff(digits: string, offset: number): number {
  let check = 0;
  for (let i = 0; i < digits.length; i += 1) {
    const digit = Number(digits.charAt(digits.length - 1 - i));
    check = MULTIPLY[check]?.[PERMUTE[(i + offset) % 8]?.[digit] ?? 0] ?? 0;
  }
  return check;
}

/** The Verhoeff check digit for a string of digits, for making valid test numbers. */
export function verhoeffCheckDigit(digits: string): number {
  return INVERSE[verhoeff(digits, 1)] ?? 0;
}

/** A 12-digit Aadhaar number with a valid check digit. Aadhaar numbers never start with 0 or 1. */
export function normalizeAadhaar(text: string): string | null {
  const digits = text.replace(SEPARATORS, '');
  return /^[2-9]\d{11}$/.test(digits) && verhoeff(digits, 0) === 0 ? digits : null;
}

/** A 14-digit ABHA number, typed with or without the hyphens of `91-1234-5678-9012`. */
export function normalizeAbhaNumber(text: string): string | null {
  const digits = text.replace(SEPARATORS, '');
  return /^\d{14}$/.test(digits) ? digits : null;
}
