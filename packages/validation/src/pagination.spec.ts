import { describe, expect, it } from 'vitest';
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX, paginationQuerySchema } from './pagination.js';

describe('paginationQuerySchema', () => {
  it('applies defaults when the query is empty', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: PAGE_SIZE_DEFAULT });
  });

  it('coerces query string numbers', () => {
    expect(paginationQuerySchema.parse({ page: '3', pageSize: '20', sort: 'createdAt:desc' })).toEqual({
      page: 3,
      pageSize: 20,
      sort: 'createdAt:desc',
    });
  });

  it('rejects a page size above the maximum', () => {
    expect(paginationQuerySchema.safeParse({ pageSize: String(PAGE_SIZE_MAX + 1) }).success).toBe(false);
  });

  it('rejects a page below 1 and fractional pages', () => {
    expect(paginationQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ page: '1.5' }).success).toBe(false);
  });

  it('rejects a sort without a direction', () => {
    expect(paginationQuerySchema.safeParse({ sort: 'createdAt' }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ sort: 'createdAt:sideways' }).success).toBe(false);
  });
});
