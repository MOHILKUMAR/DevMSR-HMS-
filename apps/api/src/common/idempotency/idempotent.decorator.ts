import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENT = 'api:idempotent';

/**
 * Marks a financial POST route (charges, payments, refunds, invoices). The client must send an
 * Idempotency-Key header, and a repeat of the same request returns the stored response instead of
 * running again.
 */
export const Idempotent = () => SetMetadata(IDEMPOTENT, true);
