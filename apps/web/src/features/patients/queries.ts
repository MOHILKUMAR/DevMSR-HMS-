'use client';

import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import type { DuplicateCheck, RegisterPatient, UpdatePatient } from '@devmsr/validation';
import { api, csrfHeader } from '@/lib/api/client';
import { unwrap } from '@/lib/api/errors';

/** Searching starts at this many characters, as the API's name search needs them. */
export const MIN_SEARCH_LENGTH = 2;

/**
 * Patients matching a search box entry. A POST, so the name or number typed never appears in a
 * URL, a browser history entry or a server log.
 */
export function usePatientSearch(q: string, { page = 1, pageSize = 50 }: { page?: number; pageSize?: number } = {}) {
  const term = q.trim();
  return useQuery({
    queryKey: ['patients', 'search', term, page, pageSize],
    queryFn: async () =>
      unwrap(await api.POST('/api/v1/patients/search', { params: { header: csrfHeader() }, body: { q: term, page, pageSize } })),
    enabled: term.length >= MIN_SEARCH_LENGTH,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

export function useDuplicateCheck() {
  return useMutation({
    mutationFn: async (body: DuplicateCheck) =>
      unwrap(await api.POST('/api/v1/patients/duplicate-check', { params: { header: csrfHeader() }, body })),
  });
}

/**
 * Registers a patient. `idempotencyKey` stays the same for one form, so sending it again after a
 * lost response returns the same patient instead of registering a second one.
 */
export function useRegisterPatient(idempotencyKey: string) {
  return useMutation({
    mutationFn: async (body: RegisterPatient) =>
      unwrap(
        await api.POST('/api/v1/patients', {
          params: { header: { ...csrfHeader(), 'Idempotency-Key': idempotencyKey } },
          body,
        }),
      ),
  });
}

export function useUpdatePatient(id: string) {
  return useMutation({
    mutationFn: async (body: UpdatePatient) =>
      unwrap(await api.PATCH('/api/v1/patients/{id}', { params: { header: csrfHeader(), path: { id } }, body })),
  });
}
