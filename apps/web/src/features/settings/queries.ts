'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { PAGE_SIZE_MAX, type ServiceKind } from '@devmsr/validation';
import { api } from '@/lib/api/client';
import { unwrap } from '@/lib/api/errors';

/** What a list screen asks for: one page, an optional search and whether retired records show. */
export interface ListParams {
  page: number;
  q: string;
  includeInactive: boolean;
}

function listQuery({ page, q, includeInactive }: ListParams) {
  return {
    page,
    pageSize: PAGE_SIZE_MAX,
    ...(q.trim() === '' ? {} : { q: q.trim() }),
    ...(includeInactive ? { includeInactive: 'true' } : {}),
  };
}

// Dropdowns list only active records. A hospital has well under 100 departments or room categories.
const ACTIVE_OPTIONS = { page: 1, pageSize: PAGE_SIZE_MAX } as const;

export const settingsKeys = {
  all: ['settings'] as const,
  hospital: ['settings', 'hospital'] as const,
  users: (params?: ListParams) => ['settings', 'users', params] as const,
  doctorLogins: ['settings', 'users', 'doctor-logins'] as const,
  roles: ['settings', 'roles'] as const,
  departments: (params?: ListParams) => ['settings', 'departments', params] as const,
  roomCategories: (params?: ListParams) => ['settings', 'room-categories', params] as const,
  doctors: (params?: ListParams) => ['settings', 'doctors', params] as const,
  wards: (params?: ListParams) => ['settings', 'wards', params] as const,
  beds: (wardId: string) => ['settings', 'beds', wardId] as const,
  serviceItems: (params?: ListParams & { kind: ServiceKind | '' }) => ['settings', 'service-items', params] as const,
  rates: (serviceItemId: string) => ['settings', 'rates', serviceItemId] as const,
};

export function useHospitalProfile() {
  return useQuery({
    queryKey: settingsKeys.hospital,
    queryFn: async () => unwrap(await api.GET('/api/v1/hospital-profile')),
  });
}

export function useStaffUsers(params: ListParams) {
  return useQuery({
    queryKey: settingsKeys.users(params),
    queryFn: async () => unwrap(await api.GET('/api/v1/users', { params: { query: listQuery(params) } })),
    placeholderData: keepPreviousData,
  });
}

/** Active logins that can be linked to a doctor: users who hold the doctor's own queue permission. */
export function useDoctorLogins(enabled: boolean) {
  return useQuery({
    queryKey: settingsKeys.doctorLogins,
    queryFn: async () =>
      unwrap(await api.GET('/api/v1/users', { params: { query: { ...ACTIVE_OPTIONS, permission: 'opd.queue.read-own' } } })),
    enabled,
  });
}

export function useRoles() {
  return useQuery({
    queryKey: settingsKeys.roles,
    queryFn: async () => unwrap(await api.GET('/api/v1/roles')),
    staleTime: 5 * 60_000,
  });
}

export function useDepartments(params: ListParams | null) {
  return useQuery({
    queryKey: settingsKeys.departments(params ?? undefined),
    queryFn: async () =>
      unwrap(await api.GET('/api/v1/departments', { params: { query: params === null ? ACTIVE_OPTIONS : listQuery(params) } })),
    placeholderData: keepPreviousData,
  });
}

export function useRoomCategories(params: ListParams | null) {
  return useQuery({
    queryKey: settingsKeys.roomCategories(params ?? undefined),
    queryFn: async () =>
      unwrap(await api.GET('/api/v1/room-categories', { params: { query: params === null ? ACTIVE_OPTIONS : listQuery(params) } })),
    placeholderData: keepPreviousData,
  });
}

export function useDoctors(params: ListParams | null) {
  return useQuery({
    queryKey: settingsKeys.doctors(params ?? undefined),
    queryFn: async () =>
      unwrap(await api.GET('/api/v1/doctors', { params: { query: params === null ? ACTIVE_OPTIONS : listQuery(params) } })),
    placeholderData: keepPreviousData,
  });
}

export function useWards(params: ListParams) {
  return useQuery({
    queryKey: settingsKeys.wards(params),
    queryFn: async () => unwrap(await api.GET('/api/v1/wards', { params: { query: listQuery(params) } })),
    placeholderData: keepPreviousData,
  });
}

export function useBeds(wardId: string) {
  return useQuery({
    queryKey: settingsKeys.beds(wardId),
    queryFn: async () => unwrap(await api.GET('/api/v1/wards/{id}/beds', { params: { path: { id: wardId } } })),
  });
}

export function useServiceItems(params: ListParams & { kind: ServiceKind | '' }) {
  return useQuery({
    queryKey: settingsKeys.serviceItems(params),
    queryFn: async () =>
      unwrap(
        await api.GET('/api/v1/service-items', {
          params: { query: { ...listQuery(params), ...(params.kind === '' ? {} : { kind: params.kind }) } },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useRates(serviceItemId: string) {
  return useQuery({
    queryKey: settingsKeys.rates(serviceItemId),
    queryFn: async () => unwrap(await api.GET('/api/v1/service-items/{id}/rates', { params: { path: { id: serviceItemId } } })),
  });
}

/**
 * A save from a dialog: on success it refreshes the given lists, then calls onSaved (usually to
 * close the dialog). Errors stay on the mutation for the form to show.
 */
export function useSave<TInput, TResult>(
  save: (input: TInput) => Promise<TResult>,
  { invalidate, onSaved }: { invalidate: readonly QueryKey[]; onSaved?: (result: TResult) => void },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: save,
    onSuccess: async (result) => {
      await Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      onSaved?.(result);
    },
  });
}
