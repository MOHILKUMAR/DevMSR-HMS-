import { normalizeAadhaar, normalizeAbhaNumber, normalizeIndianMobile, type DuplicateReason } from '@devmsr/validation';

/** `"  Ravi   Kumar "` to `"Ravi Kumar"`, so the same name typed twice compares equal. */
export function collapseSpaces(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * The date of birth for someone who is `ageYears` old on `today` (IST dates): the same day and
 * month, that many years back. 29 February falls back to 28 February in a non-leap year.
 */
export function estimateDateOfBirth(today: string, ageYears: number): string {
  const [year = 0, month = 1, day = 1] = today.split('-').map(Number);
  const birthYear = year - ageYears;
  const date = new Date(Date.UTC(birthYear, month - 1, day));
  if (date.getUTCMonth() !== month - 1) date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

export function birthYearOf(dateOfBirth: string): number {
  return Number(dateOfBirth.slice(0, 4));
}

/** What a search box entry could mean. A 12-digit entry can be both a mobile with 91 and an Aadhaar. */
export type SearchTerm =
  | { by: 'uhid'; value: string }
  | { by: 'uhid_number'; value: string }
  | { by: 'phone'; value: string }
  | { by: 'aadhaar'; value: string }
  | { by: 'abha'; value: string }
  | { by: 'name'; value: string };

// Hospital codes may contain hyphens themselves (GEN-M), so only the year and number are fixed.
const UHID = /^[A-Za-z0-9][A-Za-z0-9-]*-\d{4}-\d{6,}$/;

/**
 * Reads a search entry: a full UHID, the number part of one, a mobile, Aadhaar or ABHA number, or
 * a name of at least 2 letters. Anything else finds nothing.
 */
export function classifySearch(q: string): SearchTerm[] {
  const text = collapseSpaces(q);
  if (UHID.test(text)) return [{ by: 'uhid', value: text.toUpperCase() }];

  const digits = text.replace(/[\s\-+()]/g, '');
  if (/^\d+$/.test(digits)) {
    const terms: SearchTerm[] = [];
    const phone = normalizeIndianMobile(text);
    if (phone !== null) terms.push({ by: 'phone', value: phone });
    const aadhaar = normalizeAadhaar(digits);
    if (aadhaar !== null) terms.push({ by: 'aadhaar', value: aadhaar });
    const abha = normalizeAbhaNumber(digits);
    if (abha !== null) terms.push({ by: 'abha', value: abha });
    // The number part of a UHID, typed without the leading zeros: "123" finds DEMO-2026-000123.
    if (terms.length === 0 && digits.length <= 7) terms.push({ by: 'uhid_number', value: digits.padStart(6, '0') });
    return terms;
  }
  return text.length >= 2 ? [{ by: 'name', value: text }] : [];
}

/** What a new registration is compared on. Blind indexes stand in for Aadhaar and ABHA numbers. */
export interface DuplicateProbe {
  fullName: string;
  birthYear: number | null;
  phone: string | null;
  aadhaarIndex: string | null;
  abhaIndex: string | null;
}

export interface DuplicateCandidate {
  fullName: string;
  dateOfBirth: Date | null;
  phone: string | null;
  aadhaarBlindIndex: string | null;
  abhaNumberBlindIndex: string | null;
}

/** Why an existing patient looks like the one being registered (docs/billing-rules.md). */
export function duplicateReasons(candidate: DuplicateCandidate, probe: DuplicateProbe): DuplicateReason[] {
  const reasons: DuplicateReason[] = [];
  if (probe.aadhaarIndex !== null && candidate.aadhaarBlindIndex === probe.aadhaarIndex) reasons.push('aadhaar');
  if (probe.abhaIndex !== null && candidate.abhaNumberBlindIndex === probe.abhaIndex) reasons.push('abha');
  if (probe.phone !== null && candidate.phone === probe.phone) reasons.push('phone');
  const sameName = collapseSpaces(candidate.fullName).toLowerCase() === collapseSpaces(probe.fullName).toLowerCase();
  if (sameName && probe.birthYear !== null && candidate.dateOfBirth !== null) {
    if (Math.abs(candidate.dateOfBirth.getUTCFullYear() - probe.birthYear) <= 1) reasons.push('name_and_birth_year');
  }
  return reasons;
}

/** Aadhaar and ABHA matches are refused; the other reasons are a warning staff may register past. */
export function isBlocking(reasons: readonly DuplicateReason[]): boolean {
  return reasons.includes('aadhaar') || reasons.includes('abha');
}
