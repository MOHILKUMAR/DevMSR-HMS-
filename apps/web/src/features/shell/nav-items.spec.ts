import { describe, expect, it } from 'vitest';
import { isActive, NAV_ITEMS, visibleNavItems } from './nav-items';

const keys = (permissions: string[]) => visibleNavItems(permissions).map((item) => item.key);

describe('visibleNavItems', () => {
  it('shows the super admin home and break-glass access only', () => {
    expect(keys(['auth.session.manage-own', 'platform.hospital.manage', 'platform.break-glass.use'])).toEqual(['home', 'breakGlass']);
  });

  it('shows a super admin during break-glass the read-only hospital sections', () => {
    const during = ['platform.break-glass.use', 'patients.patient.read', 'billing.account.read', 'masters.data.read', 'beds.bed.read', 'audit.event.read'];
    expect(keys(during)).toEqual(['home', 'patients', 'beds', 'settings', 'breakGlass']);
  });

  it('shows the receptionist patients, OPD, IPD and beds, and nothing about money', () => {
    expect(
      keys([
        'auth.session.manage-own',
        'patients.patient.read',
        'patients.patient.create',
        'opd.appointment.manage',
        'ipd.admission.create',
        'beds.bed.read',
      ]),
    ).toEqual(['home', 'patients', 'opd', 'ipd', 'beds']);
  });

  it('shows the cashier payments but not billing', () => {
    const visible = keys(['patients.patient.read', 'payments.receipt.create', 'billing.refund.request']);
    expect(visible).toContain('payments');
    expect(visible).not.toContain('billing');
  });

  it('gives every section except home at least one permission', () => {
    for (const item of NAV_ITEMS) {
      if (item.key !== 'home') expect(item.anyOf.length, item.key).toBeGreaterThan(0);
    }
  });
});

describe('isActive', () => {
  const [home, patients] = NAV_ITEMS;

  it('matches home exactly and sections by prefix', () => {
    if (home === undefined || patients === undefined) throw new Error('missing nav items');
    expect(isActive(home, '/')).toBe(true);
    expect(isActive(home, '/patients')).toBe(false);
    expect(isActive(patients, '/patients')).toBe(true);
    expect(isActive(patients, '/patients/0b4b6f0e-5c1d-4f7a-9d3e-2a1b0c9d8e7f')).toBe(true);
    expect(isActive(patients, '/patients-archive')).toBe(false);
  });
});
