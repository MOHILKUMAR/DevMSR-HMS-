import type { ApprovalKind, ApprovalRequest } from '@devmsr/validation';

// Which buttons a user sees on a request. Hiding a button is a convenience: the API checks the
// permission, the finance limit and maker-checker on every decision.

export const DECIDE_PERMISSION: Record<ApprovalKind, string> = {
  discount: 'billing.discount.approve',
  credit_note: 'billing.credit-note.approve',
  refund: 'billing.refund.approve',
  receipt_void: 'billing.void.approve',
};

/** Every permission that lets someone decide some request: these users see the approvals inbox. */
export const APPROVER_PERMISSIONS = Object.values(DECIDE_PERMISSION);

export type DecideState = 'can-decide' | 'own-request' | 'md-only' | 'no-permission' | 'decided';

export function decideState(request: ApprovalRequest, me: { userId: string; permissions: readonly string[] }): DecideState {
  if (request.status !== 'pending') return 'decided';
  if (!me.permissions.includes(DECIDE_PERMISSION[request.kind])) return 'no-permission';
  // A whole-bill credit note is a bill void: it also needs the void permission.
  if (request.details.kind === 'credit_note' && request.details.wholeBill && !me.permissions.includes('billing.void.approve')) return 'no-permission';
  if (request.requestedById === me.userId) return 'own-request';
  if (request.aboveLimit && !me.permissions.includes('billing.discount.approve-above-limit')) return 'md-only';
  return 'can-decide';
}

/** An approved refund waiting to be paid, for a cashier who can pay it. */
export function canPayOut(request: ApprovalRequest, permissions: readonly string[]): boolean {
  return request.kind === 'refund' && request.status === 'approved' && request.refund === null && permissions.includes('payments.refund.pay');
}
