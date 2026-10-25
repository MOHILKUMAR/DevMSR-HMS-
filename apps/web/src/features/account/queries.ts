'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChangeOwnPassword } from '@devmsr/validation';
import { api, csrfHeader } from '@/lib/api/client';
import { unwrap } from '@/lib/api/errors';

const SESSIONS = ['account', 'sessions'] as const;

export function useOwnSessions() {
  return useQuery({
    queryKey: SESSIONS,
    queryFn: async () => unwrap(await api.GET('/api/v1/auth/sessions')),
  });
}

/** Mutations here end sessions, so each one refreshes the list afterwards. */
function useSessionsMutation<TInput, TResult>(run: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSIONS }),
  });
}

export function useEndSession() {
  return useSessionsMutation(async (id: string) => {
    unwrap(await api.POST('/api/v1/auth/sessions/{id}/end', { params: { header: csrfHeader(), path: { id } } }));
  });
}

export function useEndOtherSessions() {
  return useSessionsMutation(async () => unwrap(await api.POST('/api/v1/auth/sessions/end-others', { params: { header: csrfHeader() } })));
}

export function useChangePassword() {
  return useSessionsMutation(async (body: ChangeOwnPassword) => {
    unwrap(await api.POST('/api/v1/auth/password', { params: { header: csrfHeader() }, body }));
  });
}
