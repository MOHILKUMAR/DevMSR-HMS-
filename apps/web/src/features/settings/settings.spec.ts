import type { StaffUser, TariffRate } from '@devmsr/validation';
import { describe, expect, it } from 'vitest';
import { changedFields, staffUserChanges } from './changes';
import { cancellableRateId, rateStatus, toRateBody } from './rate-form';
import { visibleSettingsSections } from './sections';

const keys = (permissions: string[]) => visibleSettingsSections(permissions).map((section) => section.key);

describe('visibleSettingsSections', () => {
  it('gives the hospital admin every section', () => {
    expect(keys(['users.user.manage', 'masters.data.read', 'masters.data.manage', 'tariffs.tariff.read', 'settings.hospital.manage'])).toEqual([
      'users',
      'departments',
      'doctors',
      'wards',
      'rates',
      'hospital',
    ]);
  });

  it('never shows staff users without the permission to manage them', () => {
    expect(keys(['masters.data.read', 'tariffs.tariff.read', 'tariffs.tariff.manage'])).not.toContain('users');
  });

  it('shows nothing to someone with no settings permissions, such as the super admin', () => {
    expect(keys(['auth.session.manage-own', 'platform.hospital.manage'])).toEqual([]);
  });
});

const USER: StaffUser = {
  id: '0b4b6f0e-5c1d-4f7a-9d3e-2a1b0c9d8e7f',
  username: 'ravi',
  displayName: 'Ravi Kumar',
  isActive: true,
  locked: false,
  roles: [
    { code: 'cashier', name: 'Cashier' },
    { code: 'receptionist', name: 'Receptionist' },
  ],
  lastLoginAt: null,
  createdAt: '2026-10-25T00:00:00.000Z',
};

describe('staffUserChanges', () => {
  it('sends nothing when nothing changed, whatever the role order', () => {
    expect(staffUserChanges(USER, { displayName: 'Ravi Kumar', isActive: true, roleCodes: ['receptionist', 'cashier'] })).toBeNull();
  });

  it('sends only what changed', () => {
    expect(staffUserChanges(USER, { displayName: 'Ravi K', isActive: true, roleCodes: ['cashier', 'receptionist'] })).toEqual({
      displayName: 'Ravi K',
    });
    expect(staffUserChanges(USER, { displayName: 'Ravi Kumar', isActive: false, roleCodes: ['cashier'] })).toEqual({
      isActive: false,
      roleCodes: ['cashier'],
    });
  });

  it('never sends roles or status when an admin edits themself', () => {
    expect(staffUserChanges(USER, { displayName: 'Ravi Kumar Singh' })).toEqual({ displayName: 'Ravi Kumar Singh' });
  });
});

describe('changedFields', () => {
  it('treats an emptied optional field as null, the way the API stores it', () => {
    const before = { name: 'Dr A', qualification: null as string | null, isActive: true };
    expect(changedFields(before, { name: 'Dr A', qualification: '', isActive: true })).toBeNull();
    expect(changedFields(before, { name: 'Dr A', qualification: 'MBBS', isActive: false })).toEqual({ qualification: 'MBBS', isActive: false });
  });
});

describe('toRateBody', () => {
  it('turns the form into paise and basis points', () => {
    expect(toRateBody({ rupees: '1,250.50', taxPercent: '18', effectiveFrom: '2026-11-01' })).toEqual({
      ratePaise: 125_050,
      taxRateBp: 1800,
      effectiveFrom: '2026-11-01',
    });
  });

  it('gives nothing for text that is not an amount', () => {
    expect(toRateBody({ rupees: 'twelve', taxPercent: '0', effectiveFrom: '2026-11-01' })).toBeNull();
    expect(toRateBody({ rupees: '12', taxPercent: '120', effectiveFrom: '2026-11-01' })).toBeNull();
  });
});

describe('rate status and cancelling', () => {
  const TODAY = '2026-10-25';
  const rate = (id: string, effectiveFrom: string, effectiveTo: string | null, cancelledAt: string | null = null): TariffRate => ({
    id,
    ratePaise: 50_000,
    taxRateBp: 0,
    effectiveFrom,
    effectiveTo,
    createdAt: '2026-10-25T00:00:00.000Z',
    cancelledAt,
    cancelReason: cancelledAt === null ? null : 'Wrong amount',
  });

  it('names where each rate stands today', () => {
    expect(rateStatus(rate('a', '2026-04-01', null), TODAY)).toBe('inForce');
    expect(rateStatus(rate('a', '2026-04-01', TODAY), TODAY)).toBe('inForce');
    expect(rateStatus(rate('a', '2026-04-01', '2026-10-24'), TODAY)).toBe('ended');
    expect(rateStatus(rate('a', '2026-11-01', null), TODAY)).toBe('scheduled');
    expect(rateStatus(rate('a', '2026-11-01', null, '2026-10-25T05:00:00.000Z'), TODAY)).toBe('cancelled');
  });

  it('offers to cancel only the latest rate, and only before it starts', () => {
    const current = rate('current', '2026-04-01', '2026-10-31');
    const scheduled = rate('scheduled', '2026-11-01', null);
    expect(cancellableRateId([scheduled, current], TODAY)).toBe('scheduled');
    expect(cancellableRateId([rate('current', '2026-04-01', null)], TODAY)).toBeNull();
    expect(cancellableRateId([rate('today', TODAY, null)], TODAY)).toBeNull();
    // Once the scheduled rate is cancelled, the rate before it is the latest again, and it has started.
    expect(cancellableRateId([rate('scheduled', '2026-11-01', null, '2026-10-25T05:00:00.000Z'), rate('current', '2026-04-01', null)], TODAY)).toBeNull();
  });
});
