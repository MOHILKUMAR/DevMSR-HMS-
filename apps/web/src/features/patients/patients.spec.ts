import type { Patient, RegisterPatient } from '@devmsr/validation';
import { describe, expect, it } from 'vitest';
import { patientChanges } from './changes';
import { ageParts, formatMobile, mobileInput } from './format';

describe('ageParts', () => {
  const today = '2026-10-25';

  it('counts whole years from the first birthday', () => {
    expect(ageParts('1992-10-25', today)).toEqual({ count: 34, unit: 'years' });
    expect(ageParts('1992-10-26', today)).toEqual({ count: 33, unit: 'years' });
    expect(ageParts('2025-10-25', today)).toEqual({ count: 1, unit: 'years' });
  });

  it('counts months for babies under a year, and days under a month', () => {
    expect(ageParts('2026-02-10', today)).toEqual({ count: 8, unit: 'months' });
    expect(ageParts('2026-10-13', today)).toEqual({ count: 12, unit: 'days' });
    expect(ageParts('2026-10-25', today)).toEqual({ count: 0, unit: 'days' });
  });
});

describe('mobile numbers', () => {
  it('groups an Indian mobile for reading, and gives the 10 digits back for editing', () => {
    expect(formatMobile('+919876543210')).toBe('+91 98765 43210');
    expect(formatMobile('+14155550100')).toBe('+14155550100');
    expect(mobileInput('+919876543210')).toBe('9876543210');
    expect(mobileInput(null)).toBe('');
  });
});

describe('patientChanges', () => {
  const patient: Patient = {
    id: '0b4b6f0e-5c1d-4f7a-9d3e-2a1b0c9d8e7f',
    uhid: 'DEMO-2026-000051',
    fullName: 'Ravi Kumar',
    sex: 'male',
    dateOfBirth: '1992-10-25',
    dateOfBirthEstimated: true,
    phone: '+919876543210',
    addressLine: null,
    city: 'Pune',
    state: null,
    pincode: null,
    guardianRelation: null,
    guardianName: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    aadhaarLast4: '1234',
    abhaNumberLast4: null,
    registeredAt: '2026-10-25T04:30:00.000Z',
    registeredByName: 'Demo Receptionist',
    updatedAt: '2026-10-25T04:30:00.000Z',
  };
  const unchanged: RegisterPatient = { fullName: 'Ravi Kumar', sex: 'male', dateOfBirth: '1992-10-25', phone: '+919876543210', city: 'Pune' };
  const keep = { aadhaar: false, abha: false };

  it('sends nothing when nothing changed, and keeps Aadhaar when its box is left empty', () => {
    expect(patientChanges(patient, unchanged, keep)).toBeNull();
    expect(patientChanges(patient, { ...unchanged, aadhaar: null }, keep)).toBeNull();
  });

  it('sends only the changed fields, an emptied field as null, and a typed age instead of the date', () => {
    expect(patientChanges(patient, { ...unchanged, city: null, ageYears: 35 }, keep)).toEqual({ city: null, ageYears: 35 });
    expect(patientChanges(patient, { ...unchanged, guardianRelation: 'son_of', guardianName: 'Mohan Kumar' }, keep)).toEqual({
      guardianRelation: 'son_of',
      guardianName: 'Mohan Kumar',
    });
  });

  it('removes Aadhaar only when asked, and sends a new number when one is typed', () => {
    expect(patientChanges(patient, unchanged, { aadhaar: true, abha: false })).toEqual({ aadhaar: null });
    expect(patientChanges(patient, { ...unchanged, aadhaar: '234567890124' }, keep)).toEqual({ aadhaar: '234567890124' });
  });
});
