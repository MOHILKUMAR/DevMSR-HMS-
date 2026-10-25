import type { BillBalance } from '../billing/billing.repository.js';
import { owedOn } from '../billing/dto/billing.mapper.js';

/** Where a patient's account stands for billing clearance (docs/billing-rules.md, discharge). */
export interface AccountState {
  unbilledCount: number;
  unbilledPaise: bigint;
  duePaise: bigint;
  depositHeldPaise: bigint;
  refundablePaise: bigint;
  missingRoomCharges: string[];
}

export function accountState(input: {
  unbilledCount: number;
  unbilledPaise: bigint;
  bills: readonly { totalPaise: bigint; balance: BillBalance }[];
  depositHeldPaise: bigint;
  missingRoomCharges: readonly string[];
}): AccountState {
  let duePaise = 0n;
  let refundablePaise = 0n;
  for (const bill of input.bills) {
    const owed = owedOn(bill.totalPaise, bill.balance);
    if (owed > 0n) duePaise += owed;
    else refundablePaise -= owed;
  }
  return {
    unbilledCount: input.unbilledCount,
    unbilledPaise: input.unbilledPaise,
    duePaise,
    depositHeldPaise: input.depositHeldPaise,
    refundablePaise,
    missingRoomCharges: [...input.missingRoomCharges],
  };
}

/**
 * Settled enough to clear or complete a discharge: every day's room and nursing charge posted, nothing
 * unbilled, no deposit held or overpayment left to refund, and no more due than `allowedDuePaise`:
 * zero, or the amount the MD approved.
 */
export function isSettled(state: AccountState, allowedDuePaise: bigint): boolean {
  return (
    state.missingRoomCharges.length === 0 &&
    state.unbilledCount === 0 &&
    state.depositHeldPaise === 0n &&
    state.refundablePaise === 0n &&
    state.duePaise <= allowedDuePaise
  );
}

/** Everything but the amount due is settled, so the MD can be asked to clear with dues. */
export function onlyDueLeft(state: AccountState): boolean {
  return isSettled({ ...state, duePaise: 0n }, 0n) && state.duePaise > 0n;
}
