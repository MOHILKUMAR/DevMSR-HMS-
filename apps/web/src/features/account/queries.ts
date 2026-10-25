'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChangeOwnPassword, TotpCodeBody } from '@devmsr/validation';
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

const TWO_FACTOR = ['account', 'two-factor'] as const;

export function useTwoFactorStatus() {
  return useQuery({
    queryKey: TWO_FACTOR,
    queryFn: async () => unwrap(await api.GET('/api/v1/auth/two-factor')),
  });
}

/** Two-factor changes refresh the status afterwards. */
function useTwoFactorMutation<TInput, TResult>(run: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TWO_FACTOR }),
  });
}

export function useStartTwoFactorSetup() {
  return useMutation({
    mutationFn: async () => unwrap(await api.POST('/api/v1/auth/two-factor/setup', { params: { header: csrfHeader() } })),
  });
}

export function useEnableTwoFactor() {
  return useTwoFactorMutation(async (body: TotpCodeBody) =>
    unwrap(await api.POST('/api/v1/auth/two-factor/enable', { params: { header: csrfHeader() }, body })),
  );
}

export function useNewRecoveryCodes() {
  return useTwoFactorMutation(async (body: TotpCodeBody) =>
    unwrap(await api.POST('/api/v1/auth/two-factor/recovery-codes', { params: { header: csrfHeader() }, body })),
  );
}

export function useDisableTwoFactor() {
  return useTwoFactorMutation(async (body: TotpCodeBody) => {
    unwrap(await api.POST('/api/v1/auth/two-factor/disable', { params: { header: csrfHeader() }, body }));
  });
}
