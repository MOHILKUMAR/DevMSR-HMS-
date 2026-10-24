import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import type { Tx } from './tx.js';

/** Lets services run several repository calls in one transaction without touching Prisma themselves. */
@Injectable()
export class TransactionRunner {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work);
  }
}
