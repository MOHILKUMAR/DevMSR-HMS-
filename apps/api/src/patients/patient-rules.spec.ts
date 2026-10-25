import { verhoeffCheckDigit } from '@devmsr/validation';
import { describe, expect, it } from 'vitest';
import { classifySearch, collapseSpaces, duplicateReasons, estimateDateOfBirth, isBlocking, type DuplicateProbe } from './patient-rules.js';

describe('estimateDateOfBirth', () => {
  it('goes back the given number of years from today', () => {
    expect(estimateDateOfBirth('2026-10-25', 34)).toBe('1992-10-25');
    expect(estimateDateOfBirth('2026-10-25', 0)).toBe('2026-10-25');
  });

  it('turns 29 February into 28 February in a year without it', () => {
    expect(estimateDateOfBirth('2028-02-29', 3)).toBe('2025-02-28');
    expect(estimateDateOfBirth('2028-02-29', 4)).toBe('2024-02-29');
  });
});

describe('classifySearch', () => {
  const aadhaar = `23456789012${String(verhoeffCheckDigit('23456789012'))}`;

  it('reads a full UHID in any case', () => {
    expect(classifySearch(' demo-2026-000123 ')).toEqual([{ by: 'uhid', value: 'DEMO-2026-000123' }]);
    expect(classifySearch('gen-m-2026-000123')).toEqual([{ by: 'uhid', value: 'GEN-M-2026-000123' }]);
  });

  it('reads the number part of a UHID without leading zeros', () => {
    expect(classifySearch('123')).toEqual([{ by: 'uhid_number', value: '000123' }]);
    expect(classifySearch('000123')).toEqual([{ by: 'uhid_number', value: '000123' }]);
  });

  it('reads mobile, Aadhaar and ABHA numbers however they are typed', () => {
    expect(classifySearch('98765 43210')).toEqual([{ by: 'phone', value: '+919876543210' }]);
    expect(classifySearch('+91-98765-43210')).toEqual([{ by: 'phone', value: '+919876543210' }]);
    expect(classifySearch(`${aadhaar.slice(0, 4)} ${aadhaar.slice(4, 8)} ${aadhaar.slice(8)}`)).toEqual([{ by: 'aadhaar', value: aadhaar }]);
    expect(classifySearch('91-1234-5678-9012')).toEqual([{ by: 'abha', value: '91123456789012' }]);
  });

  it('searches names of 2 letters or more, and finds nothing for odd digit strings', () => {
    expect(classifySearch('  ravi   kumar ')).toEqual([{ by: 'name', value: 'ravi kumar' }]);
    expect(classifySearch('r')).toEqual([]);
    expect(classifySearch('12345678901')).toEqual([]);
  });

  it('collapses runs of spaces', () => {
    expect(collapseSpaces('  Ravi \t  Kumar ')).toBe('Ravi Kumar');
  });
});

describe('duplicateReasons', () => {
  const probe: DuplicateProbe = { fullName: 'Ravi Kumar', birthYear: 1992, phone: '+919876543210', aadhaarIndex: 'A1', abhaIndex: null };
  const candidate = { fullName: 'ravi  kumar', dateOfBirth: new Date('1991-03-01T00:00:00Z'), phone: '+919999999999', aadhaarBlindIndex: null, abhaNumberBlindIndex: null };

  it('matches the same name with a birth year within one year, in any case and spacing', () => {
    expect(duplicateReasons(candidate, probe)).toEqual(['name_and_birth_year']);
    expect(duplicateReasons({ ...candidate, dateOfBirth: new Date('1989-01-01T00:00:00Z') }, probe)).toEqual([]);
  });

  it('matches a shared mobile as a warning, and the same Aadhaar as a block', () => {
    const shared = duplicateReasons({ ...candidate, fullName: 'Sita Kumar', phone: '+919876543210' }, probe);
    expect(shared).toEqual(['phone']);
    expect(isBlocking(shared)).toBe(false);
    const sameAadhaar = duplicateReasons({ ...candidate, fullName: 'Someone Else', aadhaarBlindIndex: 'A1' }, probe);
    expect(sameAadhaar).toEqual(['aadhaar']);
    expect(isBlocking(sameAadhaar)).toBe(true);
  });
});
