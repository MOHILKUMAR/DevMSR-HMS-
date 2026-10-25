import type { LucideIcon } from 'lucide-react';
import {
  BedDouble,
  ChartColumn,
  DoorOpen,
  Hospital,
  House,
  ReceiptIndianRupee,
  Settings,
  Stethoscope,
  Users,
  Wallet,
} from 'lucide-react';

export type NavKey = 'home' | 'patients' | 'opd' | 'ipd' | 'beds' | 'billing' | 'payments' | 'discharge' | 'reports' | 'settings';

export interface NavItem {
  key: NavKey;
  href: string;
  icon: LucideIcon;
  /** Shown when the user holds any of these codes. Empty means every signed-in user. */
  anyOf: readonly string[];
}

// Codes come from apps/api/src/auth/permission-matrix.ts. Hiding an item is a convenience only:
// the API checks the permission on every request.
export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'home', href: '/', icon: House, anyOf: [] },
  { key: 'patients', href: '/patients', icon: Users, anyOf: ['patients.patient.read'] },
  { key: 'opd', href: '/opd', icon: Stethoscope, anyOf: ['opd.appointment.manage', 'opd.queue.read-own'] },
  { key: 'ipd', href: '/ipd', icon: Hospital, anyOf: ['ipd.admission.create', 'ipd.discharge.mark-fit'] },
  { key: 'beds', href: '/beds', icon: BedDouble, anyOf: ['beds.bed.read'] },
  {
    key: 'billing',
    href: '/billing',
    icon: ReceiptIndianRupee,
    anyOf: [
      'billing.charge.create',
      'billing.invoice.create',
      'billing.invoice.issue',
      'billing.discount.request',
      'billing.discount.approve',
      'billing.refund.approve',
      'billing.void.approve',
    ],
  },
  {
    key: 'payments',
    href: '/payments',
    icon: Wallet,
    anyOf: [
      'payments.receipt.create',
      'payments.deposit.create',
      'payments.shift.manage-own',
      'billing.refund.request',
      // Finance reads every cashier's shifts there.
      'reports.collection.read',
    ],
  },
  { key: 'discharge', href: '/discharge', icon: DoorOpen, anyOf: ['ipd.discharge.mark-fit', 'billing.invoice.issue'] },
  {
    key: 'reports',
    href: '/reports',
    icon: ChartColumn,
    anyOf: ['reports.collection.read', 'reports.operations.read', 'reports.profit.read', 'reports.finance.export'],
  },
  {
    key: 'settings',
    href: '/settings',
    icon: Settings,
    anyOf: [
      'settings.hospital.manage',
      'users.user.manage',
      'users.role.manage',
      'masters.data.manage',
      'tariffs.tariff.manage',
      'costing.cost-rate.manage',
      'audit.event.read',
    ],
  },
];

export function visibleNavItems(permissions: readonly string[]): NavItem[] {
  return NAV_ITEMS.filter((item) => item.anyOf.length === 0 || item.anyOf.some((code) => permissions.includes(code)));
}

/** The item for the current path: an exact match for home, a prefix match for sections. */
export function isActive(item: NavItem, pathname: string): boolean {
  return item.href === '/' ? pathname === '/' : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
