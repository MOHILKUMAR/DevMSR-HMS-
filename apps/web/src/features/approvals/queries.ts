'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApprovalKind,
  ApprovalStatus,
  ApproveRequest,
  PayRefund,
  RejectRequest,
  RequestCreditNote,
  RequestDiscount,
  RequestReceiptVoid,
  RequestRefund,
} from '@devmsr/validation';
import { api, csrfHeader } from '@/lib/api/client';
import { unwrap } from '@/lib/api/errors';

/** Requests change bills, receipts and shifts, so every billing view refreshes after one. */
const BILLING = ['billing'] as const;

export interface ApprovalFilter {
  status?: ApprovalStatus;
  kind?: ApprovalKind;
  invoiceId?: string;
  patientId?: string;
}

export function useApprovalRequests(filter: ApprovalFilter, page = 1, enabled = true) {
  return useQuery({
    queryKey: ['billing', 'approvals', filter, page],
    queryFn: async () => unwrap(await api.GET('/api/v1/approval-requests', { params: { query: { ...filter, page, pageSize: 50 } } })),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useCreditNote(id: string) {
  return useQuery({
    queryKey: ['billing', 'credit-note', id],
    queryFn: async () => unwrap(await api.GET('/api/v1/credit-notes/{id}', { params: { path: { id } } })),
  });
}

export function useRefund(id: string) {
  return useQuery({
    queryKey: ['billing', 'refund', id],
    queryFn: async () => unwrap(await api.GET('/api/v1/refunds/{id}', { params: { path: { id } } })),
  });
}

function useBillingMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: BILLING });
    },
  });
}

export function useRequestDiscount() {
  return useBillingMutation(async (body: RequestDiscount) => unwrap(await api.POST('/api/v1/discount-requests', { params: { header: csrfHeader() }, body })));
}

export function useRequestCreditNote() {
  return useBillingMutation(async (body: RequestCreditNote) =>
    unwrap(await api.POST('/api/v1/credit-note-requests', { params: { header: csrfHeader() }, body })),
  );
}

export function useRequestRefund() {
  return useBillingMutation(async (body: RequestRefund) => unwrap(await api.POST('/api/v1/refund-requests', { params: { header: csrfHeader() }, body })));
}

export function useRequestVoid() {
  return useBillingMutation(async (body: RequestReceiptVoid) => unwrap(await api.POST('/api/v1/void-requests', { params: { header: csrfHeader() }, body })));
}

/** Approving can create a bill, credit note or void, so it carries an Idempotency-Key (one per dialog). */
export function useApprove(kind: ApprovalKind, id: string) {
  return useBillingMutation(async ({ body, key }: { body: ApproveRequest; key: string }) => {
    const params = { header: { ...csrfHeader(), 'Idempotency-Key': key }, path: { id } };
    switch (kind) {
      case 'discount':
        return unwrap(await api.POST('/api/v1/discount-requests/{id}/approve', { params, body }));
      case 'credit_note':
        return unwrap(await api.POST('/api/v1/credit-note-requests/{id}/approve', { params, body }));
      case 'refund':
        return unwrap(await api.POST('/api/v1/refund-requests/{id}/approve', { params, body }));
      case 'receipt_void':
        return unwrap(await api.POST('/api/v1/void-requests/{id}/approve', { params, body }));
      case 'clearance_dues':
        return unwrap(await api.POST('/api/v1/clearance-requests/{id}/approve', { params, body }));
    }
  });
}

export function useReject(kind: ApprovalKind, id: string) {
  return useBillingMutation(async (body: RejectRequest) => {
    const params = { header: csrfHeader(), path: { id } };
    switch (kind) {
      case 'discount':
        return unwrap(await api.POST('/api/v1/discount-requests/{id}/reject', { params, body }));
      case 'credit_note':
        return unwrap(await api.POST('/api/v1/credit-note-requests/{id}/reject', { params, body }));
      case 'refund':
        return unwrap(await api.POST('/api/v1/refund-requests/{id}/reject', { params, body }));
      case 'receipt_void':
        return unwrap(await api.POST('/api/v1/void-requests/{id}/reject', { params, body }));
      case 'clearance_dues':
        return unwrap(await api.POST('/api/v1/clearance-requests/{id}/reject', { params, body }));
    }
  });
}

export function usePayRefund(id: string) {
  return useBillingMutation(async ({ body, key }: { body: PayRefund; key: string }) =>
    unwrap(await api.POST('/api/v1/refund-requests/{id}/pay', { params: { header: { ...csrfHeader(), 'Idempotency-Key': key }, path: { id } }, body })),
  );
}
