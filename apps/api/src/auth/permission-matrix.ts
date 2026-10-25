/**
 * The permission matrix: every permission code and the seeded roles that bundle them.
 * Code checks permission codes, never role names. This file seeds the roles and drives the permission matrix test.
 * Roles follow CLAUDE.md section 8. A code is added here only when a role in that table needs it.
 */

export const PERMISSIONS = {
  // Every role
  'auth.session.manage-own': 'View own profile, change own password, sign out, see and end own sessions',
  'notifications.notification.read-own': 'See and mark read own notifications',

  // DevMSR platform
  'platform.hospital.manage': 'Create and configure hospitals',
  'platform.break-glass.use': "Open a hospital's records read-only for 1 hour, with a written reason",

  // Administration
  'users.user.manage': 'Create, edit and deactivate staff users',
  'users.role.manage': 'Create custom roles and choose their permissions',
  'settings.hospital.manage': 'Edit hospital settings',
  'masters.data.manage': 'Edit masters such as wards, beds, departments and doctors',
  'masters.data.read': 'View masters: departments, doctors, wards, beds, hospital details',
  'audit.event.read': 'View the audit log and login history',

  // Patients, OPD and clinical
  'patients.patient.read': 'Search and view patient records',
  'patients.patient.create': 'Register patients',
  'patients.patient.update': 'Edit patient details',
  'opd.appointment.manage': 'Book appointments and issue tokens',
  'opd.queue.read-own': 'View own consultation queue',
  'opd.visit.read': "View the day's OPD tokens and visits, without clinical notes",
  'clinical.order.create': 'Order tests and procedures, which post their charges',
  'clinical.note.write': 'Write consultation notes and orders',

  // IPD, beds and nursing
  'ipd.admission.create': 'Admit patients',
  'ipd.admission.read': 'View admissions, beds held and room charges posted',
  'ipd.transfer.create': 'Move an admitted patient to another bed',
  'ipd.discharge.mark-fit': 'Mark a patient fit for discharge',
  'ipd.discharge.complete': 'Complete a discharge: the patient leaves and the bed goes to cleaning',
  'ipd.discharge-summary.write': 'Draft the discharge summary of own patients',
  'ipd.discharge-summary.sign': 'Sign off discharge summaries drafted by doctors',
  'ipd.discharge-summary.read': 'Read and print discharge summaries',
  'beds.bed.read': 'View the ward and bed board',
  'beds.bed.update-status': 'Change bed status, for example to cleaning',
  'nursing.vitals.record': 'Record vitals',
  'nursing.return.create': 'Return unused medicines',

  // Billing
  'billing.account.read': "View a patient's charges, bills, receipts and deposits",
  'billing.charge.create': 'Post charges',
  'billing.invoice.create': 'Prepare interim and final bills',
  'billing.invoice.issue': 'Issue and lock bills',
  'billing.discount.request': 'Request a discount',
  'billing.discount.approve': "Approve a discount requested by someone else, up to the hospital's finance limit",
  'billing.discount.approve-above-limit': "Approve a discount above the hospital's finance limit",
  'billing.credit-note.request': 'Request a credit note, or a whole bill void',
  'billing.credit-note.approve': 'Approve a credit note requested by someone else',
  'billing.refund.request': 'Request a refund',
  'billing.refund.approve': 'Approve a refund requested by someone else',
  'billing.void.approve': 'Approve a void requested by someone else',
  'billing.clearance.grant': 'Give billing clearance for discharge, or ask the MD to clear with money still due',
  'billing.clearance.approve-dues': 'Approve billing clearance with money still due',

  // Payments
  'payments.receipt.create': 'Take payments and print receipts',
  'payments.deposit.create': 'Take advance deposits',
  'payments.shift.manage-own': 'Open and close own cash shift',
  'payments.refund.pay': 'Pay out an approved refund from own shift',
  'payments.receipt.void-request': 'Ask for a receipt entered by mistake to be voided',

  // Finance and reports
  'tariffs.tariff.manage': 'Edit service items and their rates',
  'tariffs.tariff.read': 'View service items and their current rates',
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

const SELF = ['auth.session.manage-own', 'notifications.notification.read-own'] as const satisfies readonly PermissionCode[];
/** Every hospital role: own session and notifications, and the masters every screen needs (departments, doctors, wards). */
const STAFF = [...SELF, 'masters.data.read'] as const satisfies readonly PermissionCode[];

export const ROLES = {
  super_admin: {
    name: 'Super admin',
    scope: 'platform',
    // No hospital permissions: patient records only through logged break-glass access (BREAK_GLASS_PERMISSIONS).
    permissions: [...SELF, 'platform.hospital.manage', 'platform.break-glass.use'],
  },
  hospital_admin: {
    name: 'Hospital admin',
    scope: 'hospital',
    permissions: [
      ...STAFF,
      'users.user.manage',
      'users.role.manage',
      'settings.hospital.manage',
      'masters.data.manage',
      'tariffs.tariff.read',
      'audit.event.read',
    ],
  },
  md: {
    name: 'MD or owner',
    scope: 'hospital',
    permissions: [
      ...STAFF,
      'reports.collection.read',
      'reports.operations.read',
      'reports.profit.read',
      'reports.finance.export',
      'opd.visit.read',
      'ipd.admission.read',
      'billing.account.read',
      'billing.discount.approve',
      'billing.discount.approve-above-limit',
      'billing.credit-note.approve',
      'billing.refund.approve',
      'billing.void.approve',
      'billing.clearance.approve-dues',
      'ipd.discharge-summary.sign',
      'ipd.discharge-summary.read',
      'tariffs.tariff.read',
      'audit.event.read',
    ],
  },
  accountant: {
    name: 'Finance head or accountant',
    scope: 'hospital',
    permissions: [
      ...STAFF,
      'tariffs.tariff.manage',
      'tariffs.tariff.read',
      'costing.cost-rate.manage',
      // No refund approval: every refund is approved by the MD (docs/billing-rules.md).
      'billing.account.read',
      'billing.discount.approve',
      'billing.credit-note.approve',
      'billing.void.approve',
      'reports.finance.export',
      'reports.collection.read',
    ],
  },
  billing_clerk: {
    name: 'Billing clerk',
    scope: 'hospital',
    permissions: [
      ...STAFF,
      'patients.patient.read',
      'billing.account.read',
      'billing.charge.create',
      'billing.invoice.create',
      'billing.invoice.issue',
      'billing.discount.request',
      'billing.credit-note.request',
      'billing.clearance.grant',
      'ipd.admission.read',
      'tariffs.tariff.read',
    ],
  },
  cashier: {
    name: 'Cashier',
    scope: 'hospital',
    // Refund request: section 12 has the cashier refund excess deposit at discharge, after approval.
    permissions: [
      ...STAFF,
      'patients.patient.read',
      'billing.account.read',
      'payments.receipt.create',
      'payments.deposit.create',
      'payments.shift.manage-own',
      'payments.refund.pay',
      // The OPD tokens waiting for their consultation fee.
      'opd.visit.read',
      'ipd.admission.read',
      'payments.receipt.void-request',
      'billing.refund.request',
      'tariffs.tariff.read',
    ],
  },
  receptionist: {
    name: 'Receptionist',
    scope: 'hospital',
    permissions: [
      ...STAFF,
      'patients.patient.read',
      'patients.patient.create',
      'patients.patient.update',
      'opd.appointment.manage',
      'opd.visit.read',
      'ipd.admission.create',
      'ipd.admission.read',
      'ipd.transfer.create',
      'ipd.discharge.complete',
      'beds.bed.read',
      'tariffs.tariff.read',
    ],
  },
  doctor: {
    name: 'Doctor',
    scope: 'hospital',
    permissions: [
      ...STAFF,
      'patients.patient.read',
      'opd.queue.read-own',
      'clinical.note.write',
      'clinical.order.create',
      'ipd.admission.read',
      'ipd.discharge.mark-fit',
      'ipd.discharge-summary.write',
      'ipd.discharge-summary.read',
      // To choose tests and procedures to order, with their rates.
      'tariffs.tariff.read',
    ],
  },
  nurse: {
    name: 'Nurse',
    scope: 'hospital',
    permissions: [
      ...STAFF,
      'patients.patient.read',
      'ipd.admission.read',
      'ipd.transfer.create',
      'ipd.discharge.complete',
      // The ward hands the signed summary to the patient.
      'ipd.discharge-summary.read',
      'beds.bed.read',
      'beds.bed.update-status',
      'nursing.vitals.record',
      'nursing.return.create',
    ],
  },
  pharmacist: {
    name: 'Pharmacist',
    scope: 'hospital',
    permissions: [...STAFF, 'patients.patient.read', 'pharmacy.department.manage'],
  },
  lab_technician: {
    name: 'Lab technician',
    scope: 'hospital',
    permissions: [...STAFF, 'patients.patient.read', 'lab.department.manage'],
  },
  ot_coordinator: {
    name: 'OT coordinator',
    scope: 'hospital',
    permissions: [...STAFF, 'patients.patient.read', 'ot.department.manage'],
  },
} as const satisfies Record<string, RoleDefinition>;

export type RoleCode = keyof typeof ROLES;

/**
 * What a super admin may do inside a hospital during break-glass access, on top of their own codes:
 * read only (the developer decided this). Emergency fixes are made by the developer, not through it.
 */
export const BREAK_GLASS_PERMISSIONS: readonly PermissionCode[] = [
  'patients.patient.read',
  'billing.account.read',
  'masters.data.read',
  'tariffs.tariff.read',
  'beds.bed.read',
  'audit.event.read',
];

/**
 * Holding any of these makes two-factor sign-in compulsory (CLAUDE.md section 9: super admin, hospital
 * admin and finance). Checked by permission code, never role name, so a custom role that can manage
 * users or rates needs two-factor too.
 */
export const TWO_FACTOR_PERMISSIONS: readonly PermissionCode[] = ['platform.hospital.manage', 'users.user.manage', 'tariffs.tariff.manage'];

export function requiresTwoFactor(permissions: Iterable<string>): boolean {
  return [...permissions].some((code) => (TWO_FACTOR_PERMISSIONS as readonly string[]).includes(code));
}

export function isPermissionCode(value: string): value is PermissionCode {
  return Object.hasOwn(PERMISSIONS, value);
}
