/**
 * The permission matrix: every permission code and the seeded roles that bundle them.
 * Code checks permission codes, never role names. This file seeds the roles and drives the permission matrix test.
 * Roles follow CLAUDE.md section 8. A code is added here only when a role in that table needs it.
 */

export const PERMISSIONS = {
  // Every role
  'auth.session.manage-own': 'View own profile, sign out, see and end own sessions',

  // DevMSR platform
  'platform.hospital.manage': 'Create and configure hospitals',

  // Administration
  'users.user.manage': 'Create, edit and deactivate staff users',
  'users.role.manage': 'Create custom roles and choose their permissions',
  'settings.hospital.manage': 'Edit hospital settings',
  'masters.data.manage': 'Edit masters such as wards, beds, departments and services',
  'audit.event.read': 'View the audit log and login history',

  // Patients, OPD and clinical
  'patients.patient.read': 'Search and view patient records',
  'patients.patient.create': 'Register patients',
  'patients.patient.update': 'Edit patient details',
  'opd.appointment.manage': 'Book appointments and issue tokens',
  'opd.queue.read-own': 'View own consultation queue',
  'clinical.note.write': 'Write consultation notes and orders',

  // IPD, beds and nursing
  'ipd.admission.create': 'Admit patients',
  'ipd.discharge.mark-fit': 'Mark a patient fit for discharge',
  'beds.bed.read': 'View the ward and bed board',
  'beds.bed.update-status': 'Change bed status, for example to cleaning',
  'nursing.vitals.record': 'Record vitals',
  'nursing.return.create': 'Return unused medicines',

  // Billing
  'billing.charge.create': 'Post charges',
  'billing.invoice.create': 'Prepare interim and final bills',
  'billing.invoice.issue': 'Issue and lock bills',
  'billing.discount.request': 'Request a discount',
  'billing.discount.approve': 'Approve a discount requested by someone else',
  'billing.refund.request': 'Request a refund',
  'billing.refund.approve': 'Approve a refund requested by someone else',
  'billing.void.approve': 'Approve a void requested by someone else',

  // Payments
  'payments.receipt.create': 'Take payments and print receipts',
  'payments.deposit.create': 'Take advance deposits',
  'payments.shift.manage-own': 'Open and close own cash shift',

  // Finance and reports
  'tariffs.tariff.manage': 'Edit tariffs',
  'costing.cost-rate.manage': 'Edit cost rates',
  'reports.collection.read': 'View collection reports',
  'reports.finance.export': 'Export to Tally',
  'reports.operations.read': 'View operational reports',
  'reports.profit.read': 'View profit and costing reports',

  // Departments (phases 2 and 3)
  'pharmacy.department.manage': 'Work in the pharmacy',
  'lab.department.manage': 'Work in the laboratory',
  'ot.department.manage': 'Coordinate the operation theatre',
} as const;

export type PermissionCode = keyof typeof PERMISSIONS;

export type RoleScope = 'platform' | 'hospital';

export interface RoleDefinition {
  name: string;
  scope: RoleScope;
  permissions: readonly PermissionCode[];
}

const SELF: PermissionCode = 'auth.session.manage-own';

export const ROLES = {
  super_admin: {
    name: 'Super admin',
    scope: 'platform',
    // No hospital permissions: patient records only through logged break-glass access (a later slice).
    permissions: [SELF, 'platform.hospital.manage'],
  },
  hospital_admin: {
    name: 'Hospital admin',
    scope: 'hospital',
    permissions: [
      SELF,
      'users.user.manage',
      'users.role.manage',
      'settings.hospital.manage',
      'masters.data.manage',
      'audit.event.read',
    ],
  },
  md: {
    name: 'MD or owner',
    scope: 'hospital',
    permissions: [
      SELF,
      'reports.collection.read',
      'reports.operations.read',
      'reports.profit.read',
      'reports.finance.export',
      'billing.discount.approve',
      'billing.refund.approve',
      'billing.void.approve',
      'audit.event.read',
    ],
  },
  accountant: {
    name: 'Finance head or accountant',
    scope: 'hospital',
    permissions: [
      SELF,
      'tariffs.tariff.manage',
      'costing.cost-rate.manage',
      'billing.refund.approve',
      'reports.finance.export',
      'reports.collection.read',
    ],
  },
  billing_clerk: {
    name: 'Billing clerk',
    scope: 'hospital',
    permissions: [
      SELF,
      'patients.patient.read',
      'billing.charge.create',
      'billing.invoice.create',
      'billing.invoice.issue',
      'billing.discount.request',
    ],
  },
  cashier: {
    name: 'Cashier',
    scope: 'hospital',
    // Refund request: section 12 has the cashier refund excess deposit at discharge, after approval.
    permissions: [
      SELF,
      'patients.patient.read',
      'payments.receipt.create',
      'payments.deposit.create',
      'payments.shift.manage-own',
      'billing.refund.request',
    ],
  },
  receptionist: {
    name: 'Receptionist',
    scope: 'hospital',
    permissions: [
      SELF,
      'patients.patient.read',
      'patients.patient.create',
      'patients.patient.update',
      'opd.appointment.manage',
      'ipd.admission.create',
      'beds.bed.read',
    ],
  },
  doctor: {
    name: 'Doctor',
    scope: 'hospital',
    permissions: [SELF, 'patients.patient.read', 'opd.queue.read-own', 'clinical.note.write', 'ipd.discharge.mark-fit'],
  },
  nurse: {
    name: 'Nurse',
    scope: 'hospital',
    permissions: [
      SELF,
      'patients.patient.read',
      'beds.bed.read',
      'beds.bed.update-status',
      'nursing.vitals.record',
      'nursing.return.create',
    ],
  },
  pharmacist: {
    name: 'Pharmacist',
    scope: 'hospital',
    permissions: [SELF, 'patients.patient.read', 'pharmacy.department.manage'],
  },
  lab_technician: {
    name: 'Lab technician',
    scope: 'hospital',
    permissions: [SELF, 'patients.patient.read', 'lab.department.manage'],
  },
  ot_coordinator: {
    name: 'OT coordinator',
    scope: 'hospital',
    permissions: [SELF, 'patients.patient.read', 'ot.department.manage'],
  },
} as const satisfies Record<string, RoleDefinition>;

export type RoleCode = keyof typeof ROLES;

/** Roles that must use two-factor login (CLAUDE.md section 9). Enforced in the auth slice that adds TOTP. */
export const ROLES_REQUIRING_TOTP: readonly RoleCode[] = ['super_admin', 'hospital_admin', 'accountant'];

export function isPermissionCode(value: string): value is PermissionCode {
  return Object.hasOwn(PERMISSIONS, value);
}
