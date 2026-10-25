import { describe, expect, it } from 'vitest';
import { normalizeAadhaar, normalizeAbhaNumber, normalizeIndianMobile, verhoeffCheckDigit } from './identity.js';
import { duplicateCheckSchema, registerPatientSchema, updatePatientSchema } from './patients.js';

/** A made-up Aadhaar number with a valid check digit. */
function fakeAadhaar(first11: string): string {
  return `${first11}${String(verhoeffCheckDigit(first11))}`;
}

describe('normalizeIndianMobile', () => {
  it('accepts the ways people type a mobile number and stores E.164', () => {
    for (const typed of ['9876543210', '+91 98765 43210', '+919876543210', '919876543210', '09876543210', '98765-43210']) {
      expect(normalizeIndianMobile(typed), typed).toBe('+919876543210');
    }
  });

  it('refuses landlines, short numbers and numbers that cannot be mobiles', () => {
    for (const typed of ['5876543210', '987654321', '98765432100', '+14155550100', 'abcdefghij', '']) {
      expect(normalizeIndianMobile(typed), typed).toBeNull();
    }
  });
});

describe('Aadhaar and ABHA numbers', () => {
  it('knows the Verhoeff check digit of a published test vector', () => {
    expect(verhoeffCheckDigit('236')).toBe(3);
  });

  it('accepts an Aadhaar number with a valid check digit, with or without spaces', () => {
    const aadhaar = fakeAadhaar('23456789012');
    expect(normalizeAadhaar(aadhaar)).toBe(aadhaar);
    expect(normalizeAadhaar(`${aadhaar.slice(0, 4)} ${aadhaar.slice(4, 8)} ${aadhaar.slice(8)}`)).toBe(aadhaar);
  });

  it('catches a mistyped digit, two swapped digits, and numbers starting with 0 or 1', () => {
    const aadhaar = fakeAadhaar('23456789012');
    const lastDigit = Number(aadhaar.slice(-1));
    expect(normalizeAadhaar(`${aadhaar.slice(0, 11)}${String((lastDigit + 1) % 10)}`)).toBeNull();
    expect(normalizeAadhaar(`${aadhaar.slice(0, 2)}${aadhaar[3] ?? ''}${aadhaar[2] ?? ''}${aadhaar.slice(4)}`)).toBeNull();
    expect(normalizeAadhaar(fakeAadhaar('03456789012'))).toBeNull();
    expect(normalizeAadhaar(fakeAadhaar('13456789012'))).toBeNull();
  });

  it('accepts a 14-digit ABHA number typed with hyphens', () => {
    expect(normalizeAbhaNumber('91-1234-5678-9012')).toBe('91123456789012');
    expect(normalizeAbhaNumber('9112345678901')).toBeNull();
  });
});

describe('registerPatientSchema', () => {
  const minimal = { fullName: ' Ravi Kumar ', sex: 'male', ageYears: 34, phone: '98765 43210' };

  it('needs only name, sex, age or date of birth, and a mobile number', () => {
    const parsed = registerPatientSchema.parse(minimal);
    expect(parsed).toMatchObject({ fullName: 'Ravi Kumar', sex: 'male', ageYears: 34, phone: '+919876543210' });
    for (const missing of ['fullName', 'sex', 'phone', 'ageYears'] as const) {
      const { [missing]: _left, ...rest } = minimal;
      expect(registerPatientSchema.safeParse(rest).success, missing).toBe(false);
    }
  });

  it('takes an age or a date of birth, never both, and no future birth date', () => {
    expect(registerPatientSchema.safeParse({ ...minimal, ageYears: undefined, dateOfBirth: '1990-05-01' }).success).toBe(true);
    expect(registerPatientSchema.safeParse({ ...minimal, dateOfBirth: '1990-05-01' }).success).toBe(false);
    expect(registerPatientSchema.safeParse({ ...minimal, ageYears: undefined, dateOfBirth: '2999-01-01' }).success).toBe(false);
    expect(registerPatientSchema.safeParse({ ...minimal, ageYears: 131 }).success).toBe(false);
  });

  it('stores optional fields left empty as null, and checks Aadhaar and the guardian pair', () => {
    const parsed = registerPatientSchema.parse({ ...minimal, addressLine: '', aadhaar: '', emergencyContactPhone: '' });
    expect(parsed).toMatchObject({ addressLine: null, aadhaar: null, emergencyContactPhone: null });
    expect(registerPatientSchema.safeParse({ ...minimal, aadhaar: '123456789012' }).success).toBe(false);
    expect(registerPatientSchema.safeParse({ ...minimal, guardianRelation: 'son_of' }).success).toBe(false);
    expect(registerPatientSchema.safeParse({ ...minimal, guardianRelation: 'son_of', guardianName: 'Mohan Kumar' }).success).toBe(true);
  });
});

describe('updatePatientSchema and duplicateCheckSchema', () => {
  it('leaves fields that are not sent unchanged, and clears fields sent empty', () => {
    expect(updatePatientSchema.parse({ city: 'Pune' })).toEqual({ city: 'Pune' });
    expect(updatePatientSchema.parse({ aadhaar: '' })).toEqual({ aadhaar: null });
    expect(updatePatientSchema.safeParse({}).success).toBe(false);
  });

  it('checks duplicates on the same normalised values as registration', () => {
    expect(duplicateCheckSchema.parse({ fullName: 'Asha Rao', phone: '+91 98765 43210' })).toMatchObject({ phone: '+919876543210' });
  });
});

describe('error reporting', () => {
  it('reports a missing age or date of birth together with the other missing fields', () => {
    const result = registerPatientSchema.safeParse({ fullName: '' });
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((issue) => issue.path.join('.')) ?? [];
    expect(paths).toEqual(expect.arrayContaining(['fullName', 'sex', 'phone', 'ageYears']));
  });
});

describe('input that is not an object', () => {
  it('fails validation instead of throwing', () => {
    for (const body of [undefined, null, 'text', 42]) {
      expect(registerPatientSchema.safeParse(body).success).toBe(false);
    }
  });
});
