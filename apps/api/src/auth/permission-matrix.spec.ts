import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLES, isPermissionCode, type PermissionCode } from './permission-matrix.js';

const roles = Object.entries(ROLES);
const PLATFORM_ONLY: PermissionCode[] = ['platform.hospital.manage'];

describe('permission matrix', () => {
  it('uses module.resource.action codes', () => {
    for (const code of Object.keys(PERMISSIONS)) {
      expect(code).toMatch(/^[a-z]+\.[a-z-]+\.[a-z-]+$/);
    }
  });

  it('grants only known codes, without duplicates', () => {
    for (const [, role] of roles) {
      for (const code of role.permissions) {
        expect(isPermissionCode(code)).toBe(true);
      }
      expect(new Set(role.permissions).size).toBe(role.permissions.length);
    }
  });

  it('gives every role its own session permission', () => {
    for (const [, role] of roles) {
      expect(role.permissions).toContain('auth.session.manage-own');
    }
  });

  it('keeps platform permissions out of hospital roles and hospital permissions out of platform roles', () => {
    for (const [, role] of roles) {
      const platformCodes = role.permissions.filter((code) => PLATFORM_ONLY.includes(code));
      if (role.scope === 'hospital') {
        expect(platformCodes).toEqual([]);
      } else {
        expect(role.permissions.filter((code) => code !== 'auth.session.manage-own')).toEqual(platformCodes);
      }
    }
  });

  it('never lets one seeded role both request and approve the same action (maker-checker)', () => {
    for (const [, role] of roles) {
      for (const code of role.permissions) {
        if (code.endsWith('.request')) {
          expect(role.permissions).not.toContain(code.replace(/\.request$/, '.approve'));
        }
      }
    }
  });

  it('uses every permission code in at least one role', () => {
    const granted = new Set(roles.flatMap(([, role]) => role.permissions));
    expect(Object.keys(PERMISSIONS).filter((code) => !granted.has(code as PermissionCode))).toEqual([]);
  });

  it('lets only the MD approve refunds (docs/billing-rules.md)', () => {
    const approvers = roles.filter(([, role]) => (role.permissions as readonly string[]).includes('billing.refund.approve')).map(([code]) => code);
    expect(approvers).toEqual(['md']);
  });

  it('matches the role table: clerks and cashiers cannot approve, doctors and nurses cannot bill', () => {
    const approvals = (code: keyof typeof ROLES) => ROLES[code].permissions.filter((p: string) => p.endsWith('.approve'));
    expect(approvals('billing_clerk')).toEqual([]);
    expect(approvals('cashier')).toEqual([]);
    expect(approvals('hospital_admin')).toEqual([]);
    for (const code of ['doctor', 'nurse'] as const) {
      expect(ROLES[code].permissions.some((p: string) => p.startsWith('billing.') || p.startsWith('payments.'))).toBe(false);
    }
  });
});
