'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdmissionStatus, Admit, MinimumAdvance, SetBedStatus, Transfer } from '@devmsr/validation';
import { api, csrfHeader } from '@/lib/api/client';
import { unwrap } from '@/lib/api/errors';

/** Admissions move beds and post charges, so IPD, bed and billing views refresh together. */
function useIpdMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all(['ipd', 'beds', 'billing'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    },
  });
}

export function useAdmissions(status: AdmissionStatus | undefined, page = 1) {
  return useQuery({
    queryKey: ['ipd', 'admissions', status, page],
    queryFn: async () => unwrap(await api.GET('/api/v1/admissions', { params: { query: { ...(status === undefined ? {} : { status }), page, pageSize: 50 } } })),
    placeholderData: keepPreviousData,
  });
}

export function useAdmission(id: string) {
  return useQuery({
    queryKey: ['ipd', 'admission', id],
    queryFn: async () => unwrap(await api.GET('/api/v1/admissions/{id}', { params: { path: { id } } })),
  });
}

export function useAdmissionAdvised() {
  return useQuery({
    queryKey: ['ipd', 'advised'],
    queryFn: async () => unwrap(await api.GET('/api/v1/admissions/advised')),
  });
}

export function useInterimBill(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['billing', 'interim', id],
    queryFn: async () => unwrap(await api.GET('/api/v1/admissions/{id}/interim-bill', { params: { path: { id } } })),
    enabled,
  });
}

/** The bed board, refreshed as beds are taken, moved and cleaned at other desks. */
export function useBedBoard() {
  return useQuery({
    queryKey: ['beds', 'board'],
    queryFn: async () => unwrap(await api.GET('/api/v1/bed-board')),
    refetchInterval: 20_000,
  });
}

export function useAdvances() {
  return useQuery({
    queryKey: ['ipd', 'advances'],
    queryFn: async () => unwrap(await api.GET('/api/v1/room-categories/minimum-advances')),
  });
}

export function useAdmit() {
  return useIpdMutation(async ({ body, key }: { body: Admit; key: string }) =>
    unwrap(await api.POST('/api/v1/admissions', { params: { header: { ...csrfHeader(), 'Idempotency-Key': key } }, body })),
  );
}

export function useTransfer(id: string) {
  return useIpdMutation(async (body: Transfer) => unwrap(await api.POST('/api/v1/admissions/{id}/transfers', { params: { header: csrfHeader(), path: { id } }, body })));
}

export function useSetBedStatus() {
  return useIpdMutation(async ({ id, body }: { id: string; body: SetBedStatus }) => { unwrap(await api.PUT('/api/v1/beds/{id}/status', { params: { header: csrfHeader(), path: { id } }, body })); },
  );
}

export function useSetAdvance() {
  return useIpdMutation(async ({ id, body }: { id: string; body: MinimumAdvance }) =>
    unwrap(await api.PUT('/api/v1/room-categories/{id}/minimum-advance', { params: { header: csrfHeader(), path: { id } }, body })),
  );
}
