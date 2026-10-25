import type { Discharge } from '@devmsr/validation';

// Which step a discharge waits for. The API checks every step itself; this only decides what the
// screen offers and which action gets its one primary button (CLAUDE.md section 16).

export type Step = 'bill' | 'clear' | 'summary' | 'sign' | 'complete' | 'done';

type Account = Pick<Discharge, 'balance' | 'clearance'>;

/** Everything but money due is settled, so the MD can be asked to clear with dues. */
export function onlyDueLeft({ balance }: Account): boolean {
  return balance.duePaise > 0 && balance.unbilledCount === 0 && balance.missingRoomCharges.length === 0 && balance.depositHeldPaise === 0 && balance.refundablePaise === 0;
}

/** The clearance still holds while nothing has been billed, held or posted beyond what it cleared. */
export function clearanceHolds({ balance, clearance }: Account): boolean {
  return (
    clearance !== null &&
    balance.unbilledCount === 0 &&
    balance.missingRoomCharges.length === 0 &&
    balance.depositHeldPaise === 0 &&
    balance.refundablePaise === 0 &&
    balance.duePaise <= clearance.duePaise
  );
}

export function nextStep(discharge: Pick<Discharge, 'balance' | 'clearance' | 'completedAt' | 'summaryStatus'>): Step {
  if (discharge.completedAt !== null) return 'done';
  if (discharge.balance.unbilledCount > 0 || discharge.balance.missingRoomCharges.length > 0) return 'bill';
  if (!clearanceHolds(discharge)) return 'clear';
  if (discharge.summaryStatus !== 'signed') return discharge.summaryStatus === 'draft' ? 'sign' : 'summary';
  return 'complete';
}
