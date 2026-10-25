import { Controller, Get, Res } from '@nestjs/common';
import {
  collectionReportSchema,
  dayBookCsvSchema,
  operationsReportSchema,
  reportDateQuerySchema,
  type CollectionReport,
  type OperationsReport,
  type ReportDateQuery,
} from '@devmsr/validation';
import type { Response } from 'express';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth, ExportRateLimit, RequirePermission } from '../auth/decorators.js';
import { ApiContract, ValidQuery } from '../common/contract/api-contract.js';
import { ReqMeta, type RequestMeta } from '../common/http/app-request.js';
import { ReportsService } from './reports.service.js';

/** Basic phase 1 reports. A report day is a calendar day in IST. */
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('collections')
  @RequirePermission('reports.collection.read')
  @ApiContract({ summary: 'Day-end collection by cashier and payment mode, void receipts left out and refunds taken off', query: reportDateQuerySchema, response: collectionReportSchema })
  collection(@CurrentAuth() auth: AuthContext, @ValidQuery() query: ReportDateQuery, @ReqMeta() meta: RequestMeta): Promise<CollectionReport> {
    return this.reports.collection(auth, query, meta);
  }

  @Get('day-book')
  @ExportRateLimit()
  @RequirePermission('reports.finance.export')
  @ApiContract({ summary: 'The day book for Tally as CSV: bills, receipts, credit notes and refunds', query: reportDateQuerySchema, response: dayBookCsvSchema, contentType: 'text/csv' })
  async dayBook(
    @CurrentAuth() auth: AuthContext,
    @ValidQuery() query: ReportDateQuery,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const { date, csv } = await this.reports.dayBook(auth, query, meta);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="day-book-${date}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    return csv;
  }

  @Get('operations')
  @RequirePermission('reports.operations.read')
  @ApiContract({ summary: "The day's OPD visits, admissions and discharges, and the beds now", query: reportDateQuerySchema, response: operationsReportSchema })
  operations(@CurrentAuth() auth: AuthContext, @ValidQuery() query: ReportDateQuery, @ReqMeta() meta: RequestMeta): Promise<OperationsReport> {
    return this.reports.operations(auth, query, meta);
  }
}
