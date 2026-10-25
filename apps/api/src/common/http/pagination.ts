import type { Paginated } from '@devmsr/types';

export interface PageRequest {
  page: number;
  pageSize: number;
}

export function pageArgs({ page, pageSize }: PageRequest): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function paged<T>(data: T[], total: number, { page, pageSize }: PageRequest): Paginated<T> {
  return { data, page, pageSize, total };
}
