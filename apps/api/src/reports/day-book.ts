import { todayIst } from '../common/dates.js';

/** One voucher of the day book, in the order it happened. */
export interface DayBookEntry {
  at: Date;
  type: 'Sales' | 'Receipt' | 'Deposit' | 'Receipt, void' | 'Credit note' | 'Refund';
  number: string;
  uhid: string;
  mode: string;
  /** The bill a receipt, credit note or refund is against, or the deposit a refund comes from. */
  against: string;
  taxablePaise: bigint | null;
  cgstPaise: bigint | null;
  sgstPaise: bigint | null;
  roundOffPaise: bigint | null;
  amountPaise: bigint;
}

const HEADER = ['Date', 'Voucher type', 'Number', 'Patient UHID', 'Mode', 'Against', 'Taxable', 'CGST', 'SGST', 'Round off', 'Amount'];

/** Paise as rupees with two decimals, `-0.50` or `1234.00`, without float arithmetic. */
export function rupees(paise: bigint): string {
  const sign = paise < 0n ? '-' : '';
  const whole = paise < 0n ? -paise : paise;
  return `${sign}${String(whole / 100n)}.${String(whole % 100n).padStart(2, '0')}`;
}

/** A text cell: quoted when needed (RFC 4180), and never read as a formula by a spreadsheet. */
export function textCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function amountCell(paise: bigint | null): string {
  return paise === null ? '' : rupees(paise);
}

/**
 * The daily CSV day book for Tally (docs/billing-rules.md): bills issued, receipts and deposits,
 * credit notes and refunds of one IST day. A void receipt keeps its row, at nothing, so the numbers
 * stay gapless for the accountant.
 */
export function dayBookCsv(entries: readonly DayBookEntry[]): string {
  const lines = [HEADER.join(',')];
  for (const entry of [...entries].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    lines.push(
      [
        todayIst(entry.at),
        textCell(entry.type),
        textCell(entry.number),
        textCell(entry.uhid),
        textCell(entry.mode),
        textCell(entry.against),
        amountCell(entry.taxablePaise),
        amountCell(entry.cgstPaise),
        amountCell(entry.sgstPaise),
        amountCell(entry.roundOffPaise),
        rupees(entry.amountPaise),
      ].join(','),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}
