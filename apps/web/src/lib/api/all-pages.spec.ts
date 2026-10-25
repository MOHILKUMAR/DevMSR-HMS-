import { describe, expect, it, vi } from 'vitest';
import { allPages, MAX_OPTION_PAGES } from './all-pages';

/** A fake list endpoint over `total` numbered records. */
function pagedList(total: number, pageSize = 100) {
  return vi.fn((page: number) => {
    const start = (page - 1) * pageSize;
    const data = Array.from({ length: Math.max(0, Math.min(pageSize, total - start)) }, (_, i) => start + i);
    return Promise.resolve({ data, pageSize, total });
  });
}

describe('allPages', () => {
  it('returns every record past the first 100', async () => {
    const fetchPage = pagedList(250);
    const items = await allPages(fetchPage);
    expect(items).toHaveLength(250);
    expect(items[249]).toBe(249);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('asks once when everything fits on one page, or the list is empty', async () => {
    for (const total of [0, 40, 100]) {
      const fetchPage = pagedList(total);
      expect(await allPages(fetchPage)).toHaveLength(total);
      expect(fetchPage).toHaveBeenCalledTimes(1);
    }
  });

  it('stops at the page limit even if the list keeps growing', async () => {
    const fetchPage = pagedList(1_000_000);
    expect(await allPages(fetchPage)).toHaveLength(MAX_OPTION_PAGES * 100);
    expect(fetchPage).toHaveBeenCalledTimes(MAX_OPTION_PAGES);
  });
});
