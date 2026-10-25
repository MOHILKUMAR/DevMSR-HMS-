import { PAYMENT_MODES, type PaymentMode } from '@devmsr/validation';
import { z } from 'zod';
import { parseRupeesToPaise } from '@/lib/money';

/** What the cashier types: the amount in rupees as text, the mode, and that mode's details. */
export const paymentFormSchema = z
  .object({
    rupees: z.string().refine((value) => (parseRupeesToPaise(value) ?? 0) > 0),
    mode: z.enum(PAYMENT_MODES),
    reference: z.string().trim(),
    cardLast4: z.string().trim(),
    bankName: z.string().trim(),
  })
  // Each mode's own details (docs/billing-rules.md), reported on the field that is missing.
  .superRefine((value, ctx) => {
    const needsReference = value.mode !== 'cash';
    if (needsReference && (value.reference.length < 4 || value.reference.length > 40)) {
      ctx.addIssue({ code: 'custom', path: ['reference'], message: 'reference' });
    }
    if (value.mode === 'card' && !/^\d{4}$/.test(value.cardLast4)) {
      ctx.addIssue({ code: 'custom', path: ['cardLast4'], message: 'cardLast4' });
    }
    if ((value.mode === 'bank_transfer' || value.mode === 'cheque') && (value.bankName.length < 2 || value.bankName.length > 80)) {
      ctx.addIssue({ code: 'custom', path: ['bankName'], message: 'bankName' });
    }
  });

export type PaymentFormValues = z.infer<typeof paymentFormSchema>;

export const EMPTY_PAYMENT: PaymentFormValues = { rupees: '', mode: 'cash', reference: '', cardLast4: '', bankName: '' };

/** The API's payment fields: the amount in paise, and only the details the mode takes. */
export function paymentBody(values: PaymentFormValues): {
  mode: PaymentMode;
  amountPaise: number;
  reference?: string;
  cardLast4?: string;
  bankName?: string;
} | null {
  const amountPaise = parseRupeesToPaise(values.rupees);
  if (amountPaise === null || amountPaise <= 0) return null;
  switch (values.mode) {
    case 'cash':
      return { mode: 'cash', amountPaise };
    case 'upi':
      return { mode: 'upi', amountPaise, reference: values.reference };
    case 'card':
      return { mode: 'card', amountPaise, reference: values.reference, cardLast4: values.cardLast4 };
    case 'bank_transfer':
    case 'cheque':
      return { mode: values.mode, amountPaise, reference: values.reference, bankName: values.bankName };
  }
}
