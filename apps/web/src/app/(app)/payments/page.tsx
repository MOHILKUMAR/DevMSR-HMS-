import { notFound, redirect } from 'next/navigation';
import { CashierDesk } from '@/features/payments/cashier-desk';
import { getCurrentUser } from '@/lib/api/server';

/** The cash counter for a cashier. Finance, who only read the shifts, go straight to the shift list. */
export default async function PaymentsPage() {
  const me = await getCurrentUser();
  if (me === null) redirect('/login');
  const canSeeShifts = me.permissions.includes('reports.collection.read');
  if (!me.permissions.includes('payments.shift.manage-own')) {
    if (canSeeShifts) redirect('/payments/shifts');
    notFound();
  }
  return <CashierDesk canSeeShifts={canSeeShifts} canSeeOpdFees={me.permissions.includes('opd.visit.read')} />;
}
