import { describe, expect, it, vi } from 'vitest';
import { NumberingService } from './numbering.service.js';
import { formatUhid } from './take-number.js';

describe('formatUhid', () => {
  it('pads the number to 6 digits and never cuts a longer one', () => {
    expect(formatUhid('DEMO', '2026', 1)).toBe('DEMO-2026-000001');
    expect(formatUhid('DEMO', '2026', 123_456)).toBe('DEMO-2026-123456');
    expect(formatUhid('DEMO', '2026', 1_234_567)).toBe('DEMO-2026-1234567');
  });
});

describe('NumberingService.nextUhid', () => {
  function setup(value: number) {
    const repo = { hospitalCode: vi.fn().mockResolvedValue('DEMO'), next: vi.fn().mockResolvedValue(value) };
    return { service: new NumberingService(repo), repo };
  }

  it('takes the year from the IST date, so 1 January starts a new series at midnight IST', async () => {
    const { service, repo } = setup(1);
    // 31 Dec 2026, 19:00 UTC is already 1 Jan 2027 in India.
    expect(await service.nextUhid('h1', {} as never, new Date('2026-12-31T19:00:00Z'))).toBe('DEMO-2027-000001');
    expect(repo.next).toHaveBeenCalledWith('h1', 'uhid', '2027', {});
    await service.nextUhid('h1', {} as never, new Date('2026-12-31T18:00:00Z'));
    expect(repo.next).toHaveBeenLastCalledWith('h1', 'uhid', '2026', {});
  });
});
