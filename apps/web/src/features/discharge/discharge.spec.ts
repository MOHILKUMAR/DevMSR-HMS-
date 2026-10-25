import type { Discharge } from '@devmsr/validation';
import { describe, expect, it } from 'vitest';
import { clearanceHolds, nextStep, onlyDueLeft } from './steps';

const settled: Discharge['balance'] = { unbilledCount: 0, unbilledPaise: 0, duePaise: 0, depositHeldPaise: 0, refundablePaise: 0, missingRoomCharges: [], settled: true };
const clearance = (duePaise: number): Discharge['clearance'] => ({ clearedAt: '2026-10-26T06:00:00.000Z', clearedByName: 'Clerk', duePaise, approvalRequestId: null });
const discharge = (overrides: Partial<Pick<Discharge, 'balance' | 'clearance' | 'completedAt' | 'summaryStatus'>> = {}) => ({
  balance: settled,
  clearance: null,
  completedAt: null,
  summaryStatus: 'none' as const,
  ...overrides,
});

describe('nextStep', () => {
  it('bills first, then clears, then the summary, then the patient leaves', () => {
    expect(nextStep(discharge({ balance: { ...settled, unbilledCount: 2, unbilledPaise: 130_000, settled: false } }))).toBe('bill');
    expect(nextStep(discharge({ balance: { ...settled, missingRoomCharges: ['2026-10-26'], settled: false } }))).toBe('bill');
    expect(nextStep(discharge())).toBe('clear');
    expect(nextStep(discharge({ clearance: clearance(0) }))).toBe('summary');
    expect(nextStep(discharge({ clearance: clearance(0), summaryStatus: 'draft' }))).toBe('sign');
    expect(nextStep(discharge({ clearance: clearance(0), summaryStatus: 'signed' }))).toBe('complete');
    expect(nextStep(discharge({ completedAt: '2026-10-26T08:00:00.000Z' }))).toBe('done');
  });

  it('goes back to clearance when the account grows beyond what was cleared', () => {
    const due = { ...settled, duePaise: 170_000, settled: false };
    expect(clearanceHolds({ balance: due, clearance: clearance(170_000) })).toBe(true);
    expect(clearanceHolds({ balance: due, clearance: clearance(130_000) })).toBe(false);
    expect(nextStep(discharge({ balance: due, clearance: clearance(130_000), summaryStatus: 'signed' }))).toBe('clear');
  });
});

describe('onlyDueLeft', () => {
  it('lets billing ask the MD only when money due is all that is left', () => {
    expect(onlyDueLeft({ balance: { ...settled, duePaise: 80_000, settled: false }, clearance: null })).toBe(true);
    expect(onlyDueLeft({ balance: { ...settled, duePaise: 80_000, depositHeldPaise: 10_000, settled: false }, clearance: null })).toBe(false);
    expect(onlyDueLeft({ balance: settled, clearance: null })).toBe(false);
  });
});
