'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApplyDeposit, CloseShift, CreateInvoice, InvoiceStatus, OpenShift, PostCharge, TakeDeposit, TakePayment } from '@devmsr/validation';
import { PAGE_SIZE_MAX } from '@devmsr/validation';
import { allPages } from '@/lib/api/all-pages';
import { api, csrfHeader } from '@/lib/api/client';
import { unwrap } from '@/lib/api/errors';

/** Header for a POST that creates a charge, bill, payment or deposit: one key per attempt (CLAUDE.md section 7). */
function idempotent(key: string) {
  return { ...csrfHeader(), 'Idempotency-Key': key };
}

/** Everything billing shows: refreshed together after any money changes. */
const BILLING = ['billing'] as const;

export function useAccount(patientId: string) {
  return useQuery({
    queryKey: ['billing', 'account', patientId],
    queryFn: async () => unwrap(await api.GET('/api/v1/patients/{id}/account', { params: { path: { id: patientId } } })),
  });
}

export function usePendingCharges(patientId: string) {
  return useQuery({
    queryKey: ['billing', 'charges', patientId],
    queryFn: async () =>
      unwrap(await api.GET('/api/v1/patients/{id}/charges', { params: { path: { id: patientId }, query: { status: 'pending' } } })),
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: ['billing', 'invoice', id],
    queryFn: async () => unwrap(await api.GET('/api/v1/invoices/{id}', { params: { path: { id } } })),
  });
}

export function useInvoices(status: InvoiceStatus, page = 1) {
  return useQuery({
    queryKey: ['billing', 'invoices', status, page],
    queryFn: async () => unwrap(await api.GET('/api/v1/invoices', { params: { query: { status, page, pageSize: 20 } } })),
    placeholderData: keepPreviousData,
  });
}

/** Every active service item with today's rate, for the charge form. */
export function useServiceItemOptions() {
  return useQuery({
    queryKey: ['billing', 'service-items'],
    queryFn: () =>
      allPages(async (page) => unwrap(await api.GET('/api/v1/service-items', { params: { query: { page, pageSize: PAGE_SIZE_MAX } } }))),
    staleTime: 5 * 60_000,
  });
}

export function useCurrentShift() {
  return useQuery({
    queryKey: ['billing', 'shift'],
    queryFn: async () => unwrap(await api.GET('/api/v1/cash-shifts/current')),
  });
}

export function useShifts(page: number) {
  return useQuery({
    queryKey: ['billing', 'shifts', page],
    queryFn: async () => unwrap(await api.GET('/api/v1/cash-shifts', { params: { query: { page, pageSize: 50 } } })),
    placeholderData: keepPreviousData,
  });
}

export function useReceipt(id: string) {
  return useQuery({
    queryKey: ['billing', 'receipt', id],
    queryFn: async () => unwrap(await api.GET('/api/v1/receipts/{id}', { params: { path: { id } } })),
  });
}

/** A billing change: on success every billing view refreshes, since money moved. */
function useBillingMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: BILLING });
    },
  });
}

export function usePostCharge(patientId: string) {
  return useBillingMutation(async ({ body, key }: { body: PostCharge; key: string }) =>
    unwrap(await api.POST('/api/v1/patients/{id}/charges', { params: { header: idempotent(key), path: { id: patientId } }, body })),
  );
}

export function useCreateDraft() {
  return useBillingMutation(async ({ body, key }: { body: CreateInvoice; key: string }) =>
    unwrap(await api.POST('/api/v1/invoices', { params: { header: idempotent(key) }, body })),
  );
}

export function useIssueInvoice(id: string) {
  return useBillingMutation(async (key: string) =>
    unwrap(await api.POST('/api/v1/invoices/{id}/issue', { params: { header: idempotent(key), path: { id } } })),
  );
}

export function useDiscardInvoice(id: string) {
  return useBillingMutation(async () => unwrap(await api.POST('/api/v1/invoices/{id}/discard', { params: { header: csrfHeader(), path: { id } } })));
}

export function useOpenShift() {
  return useBillingMutation(async (body: OpenShift) => unwrap(await api.POST('/api/v1/cash-shifts', { params: { header: csrfHeader() }, body })));
}

export function useCloseShift(id: string) {
  return useBillingMutation(async (body: CloseShift) =>
    unwrap(await api.POST('/api/v1/cash-shifts/{id}/close', { params: { header: csrfHeader(), path: { id } }, body })),
  );
}

export function useTakePayment() {
  return useBillingMutation(async ({ body, key }: { body: TakePayment; key: string }) =>
    unwrap(await api.POST('/api/v1/payments', { params: { header: idempotent(key) }, body })),
  );
}

export function useTakeDeposit() {
  return useBillingMutation(async ({ body, key }: { body: TakeDeposit; key: string }) =>
    unwrap(await api.POST('/api/v1/deposits', { params: { header: idempotent(key) }, body })),
  );
}

export function useApplyDeposit(invoiceId: string) {
  return useBillingMutation(async ({ body, key }: { body: ApplyDeposit; key: string }) =>
    unwrap(await api.POST('/api/v1/invoices/{id}/apply-deposit', { params: { header: idempotent(key), path: { id: invoiceId } }, body })),
  );
}
