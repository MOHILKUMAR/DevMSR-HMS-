'use client';

import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { unwrap } from '@/lib/api/errors';

export function useCollectionReport(date: string, enabled: boolean) {
  return useQuery({
    queryKey: ['reports', 'collections', date],
    queryFn: async () => unwrap(await api.GET('/api/v1/reports/collections', { params: { query: { date } } })),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useOperationsReport(date: string, enabled: boolean) {
  return useQuery({
    queryKey: ['reports', 'operations', date],
    queryFn: async () => unwrap(await api.GET('/api/v1/reports/operations', { params: { query: { date } } })),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Downloads the day book CSV as a file. Exports are limited per hour, so an error shows on the screen. */
export function useDayBookDownload() {
  return useMutation({
    mutationFn: async (date: string) => {
      const csv = unwrap(await api.GET('/api/v1/reports/day-book', { params: { query: { date } }, parseAs: 'text' }));
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `day-book-${date}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    },
  });
}
