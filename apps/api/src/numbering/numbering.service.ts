import { Injectable } from '@nestjs/common';
import { todayIst } from '../common/dates.js';
import type { Tx } from '../common/prisma/tx.js';
import { NumberingRepository } from './numbering.repository.js';
import { formatUhid } from './take-number.js';

/** Gapless numbers for records that need one. Only UHIDs so far; invoice and receipt formats are still open. */
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
}
