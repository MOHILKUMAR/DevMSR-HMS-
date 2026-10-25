'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DischargeStatus, DischargeSummaryInput, MarkFit, RequestClearanceDues } from '@devmsr/validation';
import { api, csrfHeader } from '@/lib/api/client';
import { unwrap } from '@/lib/api/errors';

/** A discharge step can bill, take money, free a bed or decide a request, so these views refresh together. */
function useDischargeMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all(['discharge', 'ipd', 'beds', 'billing', 'approvals'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    },
  });
}

export function useDischarges(status: DischargeStatus | undefined, page = 1) {
  return useQuery({
    queryKey: ['discharge', 'list', status, page],
    queryFn: async () => unwrap(await api.GET('/api/v1/discharges', { params: { query: { ...(status === undefined ? {} : { status }), page, pageSize: 50 } } })),
    placeholderData: keepPreviousData,
  });
}

export function useDischarge(id: string) {
  return useQuery({
    queryKey: ['discharge', 'one', id],
    queryFn: async () => unwrap(await api.GET('/api/v1/discharges/{id}', { params: { path: { id } } })),
  });
}

export function useDischargeSummary(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['discharge', 'summary', id],
    queryFn: async () => unwrap(await api.GET('/api/v1/discharges/{id}/summary', { params: { path: { id } } })),
    enabled,
  });
}

export function useMarkFit() {
  return useDischargeMutation(async (body: MarkFit) => unwrap(await api.POST('/api/v1/discharges', { params: { header: csrfHeader() }, body })));
}

/** Drafting the final bill posts charges, so it carries an Idempotency-Key. */
export function useFinalBill(id: string) {
  return useDischargeMutation(async (key: string) =>
    unwrap(await api.POST('/api/v1/discharges/{id}/final-bill', { params: { header: { ...csrfHeader(), 'Idempotency-Key': key }, path: { id } } })),
  );
}

export function useClear(id: string) {
  return useDischargeMutation(async () => unwrap(await api.POST('/api/v1/discharges/{id}/clearance', { params: { header: csrfHeader(), path: { id } } })));
}

export function useRequestDues() {
  return useDischargeMutation(async (body: RequestClearanceDues) => unwrap(await api.POST('/api/v1/clearance-requests', { params: { header: csrfHeader() }, body })));
}

export function useSaveSummary(id: string) {
  return useDischargeMutation(async (body: DischargeSummaryInput) =>
    unwrap(await api.PUT('/api/v1/discharges/{id}/summary', { params: { header: csrfHeader(), path: { id } }, body })),
  );
}

export function useSignSummary(id: string) {
  return useDischargeMutation(async () => unwrap(await api.POST('/api/v1/discharges/{id}/summary/sign', { params: { header: csrfHeader(), path: { id } } })));
}

export function useCompleteDischarge(id: string) {
  return useDischargeMutation(async () => unwrap(await api.POST('/api/v1/discharges/{id}/complete', { params: { header: csrfHeader(), path: { id } } })));
}
