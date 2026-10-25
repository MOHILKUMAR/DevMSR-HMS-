import { REFUND_MODES, type PayRefund, type RefundMode, type RequestCreditNote, type RequestDiscount, type RequestRefund } from '@devmsr/validation';
import { z } from 'zod';
import { parsePercentToBp, parseRupeesToPaise } from '@/lib/money';

// What staff type into the request dialogs, and the API bodies made from it. Amounts are text in
// rupees until they are turned into paise here, never through floating point.

const reason = z.string().trim().min(3).max(500);
const positivePaise = (text: string) => (parseRupeesToPaise(text) ?? 0) > 0;

export const discountFormSchema = z
  .object({
    scope: z.enum(['bill_amount', 'bill_percent', 'lines']),
    rupees: z.string(),
    percent: z.string(),
    lines: z.array(z.string()),
    reason,
  })
  .superRefine((value, ctx) => {
    if (value.scope === 'bill_amount' && !positivePaise(value.rupees)) ctx.addIssue({ code: 'custom', path: ['rupees'], message: 'rupees' });
    if (value.scope === 'bill_percent' && (parsePercentToBp(value.percent) ?? 0) <= 0) ctx.addIssue({ code: 'custom', path: ['percent'], message: 'percent' });
    if (value.scope === 'lines') {
      value.lines.forEach((text, index) => {
        if (text.trim() !== '' && parseRupeesToPaise(text) === null) ctx.addIssue({ code: 'custom', path: ['lines', index], message: 'line' });
      });
      if (!value.lines.some(positivePaise)) ctx.addIssue({ code: 'custom', path: ['lines'], message: 'lines' });
    }
  });
export type DiscountFormValues = z.infer<typeof discountFormSchema>;

/** The API body for a discount. `lineNos` are the bill's line numbers, in the order of `values.lines`. */
export function discountBody(invoiceId: string, lineNos: readonly number[], values: DiscountFormValues): RequestDiscount | null {
  const base = { invoiceId, reason: values.reason.trim() };
  switch (values.scope) {
    case 'bill_amount': {
      const amountPaise = parseRupeesToPaise(values.rupees);
      return amountPaise === null || amountPaise <= 0 ? null : { ...base, discount: { scope: 'bill_amount', amountPaise } };
    }
    case 'bill_percent': {
      const percentBp = parsePercentToBp(values.percent);
      return percentBp === null || percentBp <= 0 ? null : { ...base, discount: { scope: 'bill_percent', percentBp } };
    }
    case 'lines': {
      const lines = lineNos
        .map((lineNo, index) => ({ lineNo, discountPaise: parseRupeesToPaise(values.lines[index] ?? '') ?? 0 }))
        .filter((line) => line.discountPaise > 0);
      return lines.length === 0 ? null : { ...base, discount: { scope: 'lines', lines } };
    }
  }
}

export const creditFormSchema = z
  .object({
    scope: z.enum(['whole_bill', 'lines']),
    lines: z.array(z.object({ how: z.enum(['none', 'quantity', 'amount']), value: z.string() })),
    reason,
  })
  .superRefine((value, ctx) => {
    if (value.scope !== 'lines') return;
    value.lines.forEach((line, index) => {
      const valid = line.how === 'none' || (line.how === 'quantity' ? /^\d{1,3}$/.test(line.value.trim()) && Number(line.value) > 0 : positivePaise(line.value));
      if (!valid) ctx.addIssue({ code: 'custom', path: ['lines', index, 'value'], message: 'value' });
    });
    if (value.lines.every((line) => line.how === 'none')) ctx.addIssue({ code: 'custom', path: ['lines'], message: 'lines' });
  });
export type CreditFormValues = z.infer<typeof creditFormSchema>;

export function creditBody(invoiceId: string, lineNos: readonly number[], values: CreditFormValues): RequestCreditNote | null {
  const base = { invoiceId, reason: values.reason.trim() };
  if (values.scope === 'whole_bill') return { ...base, credit: { scope: 'whole_bill' } };
  const lines: ({ lineNo: number; quantity: number } | { lineNo: number; amountPaise: number })[] = [];
  values.lines.forEach((line, index) => {
    const lineNo = lineNos[index];
    if (lineNo === undefined || line.how === 'none') return;
    if (line.how === 'quantity') lines.push({ lineNo, quantity: Number(line.value.trim()) });
    else lines.push({ lineNo, amountPaise: parseRupeesToPaise(line.value) ?? 0 });
  });
  return lines.length === 0 ? null : { ...base, credit: { scope: 'lines', lines } };
}

export const refundFormSchema = z.object({
  /** `deposit:<receipt id>` or `bill:<invoice id>`. */
  source: z.string().regex(/^(deposit|bill):[0-9a-f-]{36}$/),
  rupees: z.string().refine(positivePaise),
  mode: z.enum(REFUND_MODES),
  reason,
});
export type RefundFormValues = z.infer<typeof refundFormSchema>;

export function refundBody(values: RefundFormValues): RequestRefund | null {
  const amountPaise = parseRupeesToPaise(values.rupees);
  const [kind, id = ''] = values.source.split(':');
  if (amountPaise === null || amountPaise <= 0) return null;
  const base = { reason: values.reason.trim(), amountPaise, mode: values.mode };
  if (kind === 'deposit') return { ...base, source: { kind: 'deposit', receiptId: id } };
  if (kind === 'bill') return { ...base, source: { kind: 'bill', invoiceId: id } };
  return null;
}

/** Cash needs nothing; UPI its UTR; a transfer or cheque its number and bank. */
export function payRefundSchema(mode: RefundMode) {
  return z.object({ reference: z.string().trim(), bankName: z.string().trim() }).superRefine((value, ctx) => {
    if (mode !== 'cash' && (value.reference.length < 4 || value.reference.length > 40)) ctx.addIssue({ code: 'custom', path: ['reference'], message: 'reference' });
    if ((mode === 'bank_transfer' || mode === 'cheque') && (value.bankName.length < 2 || value.bankName.length > 80)) {
      ctx.addIssue({ code: 'custom', path: ['bankName'], message: 'bankName' });
    }
  });
}

export function payRefundBody(mode: RefundMode, values: { reference: string; bankName: string }): PayRefund {
  if (mode === 'cash') return {};
  if (mode === 'upi') return { reference: values.reference.trim() };
  return { reference: values.reference.trim(), bankName: values.bankName.trim() };
}
