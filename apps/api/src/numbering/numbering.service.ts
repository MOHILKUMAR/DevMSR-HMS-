import { Injectable } from '@nestjs/common';
import { financialYearOf, todayIst } from '../common/dates.js';
import type { Tx } from '../common/prisma/tx.js';
import { NumberingRepository } from './numbering.repository.js';
import { formatDocumentNumber, formatUhid, type DocumentKind } from './take-number.js';

/** Gapless numbers for records that need one: UHIDs per calendar year, bills and receipts per financial year. */
@Injectable()
export class NumberingService {
  constructor(private readonly numbers: NumberingRepository) {}

  /** The next UHID of the hospital, in the registration's transaction. The year restarts the series. */
  async nextUhid(hospitalId: string, tx: Tx, now: Date = new Date()): Promise<string> {
    const year = todayIst(now).slice(0, 4);
    const code = await this.numbers.hospitalCode(hospitalId, tx);
    const value = await this.numbers.next(hospitalId, 'uhid', year, tx);
    return formatUhid(code, year, value);
  }

  /**
   * The next OPD token of the day (IST) for the whole hospital, in the transaction of the visit that
   * takes it. Tokens restart at 1 every day (docs/billing-rules.md).
   */
  async nextOpdToken(hospitalId: string, tx: Tx, now: Date = new Date()): Promise<{ tokenNumber: number; visitDate: string }> {
    const visitDate = todayIst(now);
    return { tokenNumber: await this.numbers.next(hospitalId, 'opd_token', visitDate, tx), visitDate };
  }

  /**
   * The next bill or receipt number of the financial year (1 April to 31 March, IST), in the
   * transaction of the document that takes it.
   */
  async nextDocumentNumber(hospitalId: string, kind: DocumentKind, tx: Tx, now: Date = new Date()): Promise<{ number: string; financialYear: string }> {
    const financialYear = financialYearOf(todayIst(now));
    const code = await this.numbers.hospitalCode(hospitalId, tx);
    const value = await this.numbers.next(hospitalId, kind, financialYear, tx);
    return { number: formatDocumentNumber(code, kind, financialYear, value), financialYear };
  }
}
