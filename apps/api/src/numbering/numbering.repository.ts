import { Injectable } from '@nestjs/common';
import type { NumberKind } from '../generated/prisma/client.js';
import type { Tx } from '../common/prisma/tx.js';
import { takeNumber } from './take-number.js';

/** Number counters, always used inside the transaction of the record that takes the number. */
@Injectable()
export class NumberingRepository {
  async hospitalCode(hospitalId: string, tx: Tx): Promise<string> {
    const hospital = await tx.hospital.findUniqueOrThrow({ where: { id: hospitalId }, select: { code: true } });
    return hospital.code;
  }

  next(hospitalId: string, kind: NumberKind, period: string, tx: Tx): Promise<number> {
    return takeNumber(tx, hospitalId, kind, period);
  }
}
