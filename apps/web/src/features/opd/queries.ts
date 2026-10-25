'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CancelVisit, ConsultationNotes, IssueToken, OpdVisitStatus, PayOpdFee, PlaceOrder } from '@devmsr/validation';
import { api, csrfHeader } from '@/lib/api/client';
import { unwrap } from '@/lib/api/errors';

/** OPD changes move tokens, bills and receipts, so OPD and billing views refresh together. */
function useOpdMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['opd'] }), queryClient.invalidateQueries({ queryKey: ['billing'] })]);
    },
  });
}

const idempotent = (key: string) => ({ ...csrfHeader(), 'Idempotency-Key': key });

export function useOpdVisits(filter: { status?: OpdVisitStatus }, page = 1, enabled = true) {
  return useQuery({
    queryKey: ['opd', 'visits', filter, page],
    queryFn: async () => unwrap(await api.GET('/api/v1/opd-visits', { params: { query: { ...filter, page, pageSize: 100 } } })),
    placeholderData: keepPreviousData,
    // Desks see tokens issued and paid at other counters without reloading.
    refetchInterval: 20_000,
    enabled,
  });
}

/** The doctor's queue, refreshed as patients pay at the counter. */
export function useOpdQueue() {
  return useQuery({
    queryKey: ['opd', 'queue'],
    queryFn: async () => unwrap(await api.GET('/api/v1/opd-visits/queue')),
    refetchInterval: 15_000,
  });
}

export function useConsultation(id: string) {
  return useQuery({
    queryKey: ['opd', 'consultation', id],
    queryFn: async () => unwrap(await api.GET('/api/v1/opd-visits/{id}/consultation', { params: { path: { id } } })),
  });
}

export function useIssueToken() {
  return useOpdMutation(async ({ body, key }: { body: IssueToken; key: string }) =>
    unwrap(await api.POST('/api/v1/opd-visits', { params: { header: idempotent(key) }, body })),
  );
}

export function useCancelVisit(id: string) {
  return useOpdMutation(async (body: CancelVisit) => unwrap(await api.POST('/api/v1/opd-visits/{id}/cancel', { params: { header: csrfHeader(), path: { id } }, body })));
}

export function usePayOpdFee(id: string) {
  return useOpdMutation(async ({ body, key }: { body: PayOpdFee; key: string }) =>
    unwrap(await api.POST('/api/v1/opd-visits/{id}/fee', { params: { header: idempotent(key), path: { id } }, body })),
  );
}

export function useCallIn(id: string) {
  return useOpdMutation(async () => unwrap(await api.POST('/api/v1/opd-visits/{id}/call', { params: { header: csrfHeader(), path: { id } } })));
}

export function useSaveNotes(id: string) {
  return useOpdMutation(async (body: ConsultationNotes) => unwrap(await api.PUT('/api/v1/opd-visits/{id}/notes', { params: { header: csrfHeader(), path: { id } }, body })));
}

export function usePlaceOrder(id: string) {
  return useOpdMutation(async ({ body, key }: { body: PlaceOrder; key: string }) =>
    unwrap(await api.POST('/api/v1/opd-visits/{id}/orders', { params: { header: idempotent(key), path: { id } }, body })),
  );
}

export function useCompleteVisit(id: string) {
  return useOpdMutation(async () => unwrap(await api.POST('/api/v1/opd-visits/{id}/complete', { params: { header: csrfHeader(), path: { id } } })));
}
