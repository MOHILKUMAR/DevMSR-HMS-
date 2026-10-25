'use client';

import type { CollectionReport, OperationsReport } from '@devmsr/validation';
import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert, TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableHead, TableMessage, Td, Th } from '@/components/ui/table';
import { formatDate, formatPaise, todayIst } from '@/lib/format';
import { useCollectionReport, useDayBookDownload, useOperationsReport } from './queries';

type Counts = CollectionReport['totals'];

function MoneyCells({ counts }: { counts: Counts }) {
  return (
    <>
      <Td numeric>{formatPaise(counts.paymentsPaise)}</Td>
      <Td numeric>{formatPaise(counts.depositsPaise)}</Td>
      <Td numeric>{formatPaise(counts.refundsPaise)}</Td>
      <Td numeric className="font-medium">
        {formatPaise(counts.netPaise)}
      </Td>
    </>
  );
}

/** Money taken and paid back in the day, by cashier and mode (docs/billing-rules.md). */
function Collection({ report }: { report: CollectionReport }) {
  const t = useTranslations('reports.collection');
  const tm = useTranslations('payments.modes');
  return (
    <div className="space-y-3">
      <Table>
        <TableHead>
          <tr>
            <Th>{t('cashier')}</Th>
            <Th>{t('mode')}</Th>
            <Th numeric>{t('payments')}</Th>
            <Th numeric>{t('deposits')}</Th>
            <Th numeric>{t('refunds')}</Th>
            <Th numeric>{t('net')}</Th>
          </tr>
        </TableHead>
        <TableBody>
          {report.rows.length === 0 && <TableMessage colSpan={6}>{t('none')}</TableMessage>}
          {report.rows.map((row) => (
            <tr key={`${row.cashierId}-${row.mode}`}>
              <Td>{row.cashierName ?? t('unknownCashier')}</Td>
              <Td>{tm(row.mode)}</Td>
              <MoneyCells counts={row} />
            </tr>
          ))}
          {report.byMode.map((row) => (
            <tr key={`mode-${row.mode}`} className="bg-neutral-soft">
              <Td>{t('allCashiers')}</Td>
              <Td>{tm(row.mode)}</Td>
              <MoneyCells counts={row} />
            </tr>
          ))}
          {report.rows.length > 0 && (
            <tr className="bg-primary-soft font-semibold">
              <Td>{t('total')}</Td>
              <Td />
              <MoneyCells counts={report.totals} />
            </tr>
          )}
        </TableBody>
      </Table>
      {report.voided.count > 0 && <p className="text-sm text-text-muted">{t('voided', { count: report.voided.count, amount: formatPaise(report.voided.amountPaise) })}</p>}
    </div>
  );
}

function Operations({ report }: { report: OperationsReport }) {
  const t = useTranslations('reports.operations');
  const figures = [
    [t('opdTokens'), report.opd.tokens],
    [t('opdSeen'), report.opd.seen],
    [t('opdCancelled'), report.opd.cancelled],
    [t('admissions'), report.admissions],
    [t('discharges'), report.discharges],
  ] as const;
  return (
    <div className="space-y-3">
      <dl className="grid gap-3 sm:grid-cols-5">
        {figures.map(([label, value]) => (
          <div key={label} className="rounded-md border border-border bg-surface p-3">
            <dt className="text-sm text-text-muted">{label}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-text-muted">
        {t('bedsNow', { occupied: report.beds.occupied, total: report.beds.total, free: report.beds.free, cleaning: report.beds.cleaning })}
      </p>
      {report.wards.length > 0 && (
        <Table>
          <TableHead>
            <tr>
              <Th>{t('ward')}</Th>
              <Th numeric>{t('occupied')}</Th>
              <Th numeric>{t('beds')}</Th>
            </tr>
          </TableHead>
          <TableBody>
            {report.wards.map((ward) => (
              <tr key={ward.name}>
                <Td>{ward.name}</Td>
                <Td numeric>{ward.occupied}</Td>
                <Td numeric>{ward.total}</Td>
              </tr>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

/** Phase 1 reports for a calendar day in IST: collection, the Tally day book and basic counts. */
export function ReportsView({ canCollections, canExport, canOperations }: { canCollections: boolean; canExport: boolean; canOperations: boolean }) {
  const t = useTranslations('reports');
  const [date, setDate] = useState(todayIst());
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= todayIst();
  const collection = useCollectionReport(date, canCollections && validDate);
  const operations = useOperationsReport(date, canOperations && validDate);
  const download = useDayBookDownload();

  return (
    <section className="max-w-5xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-text-muted">{t('description')}</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <TextField id="report-date" type="date" max={todayIst()} label={t('date')} value={date} error={validDate ? undefined : t('dateError')} onChange={(event) => { setDate(event.target.value); }} />
        </div>
        {canExport && (
          <Button variant="outline" disabled={!validDate || download.isPending} onClick={() => { download.mutate(date); }}>
            <Download aria-hidden />
            {t('downloadDayBook')}
          </Button>
        )}
      </div>
      {download.error !== null && <ErrorAlert error={download.error} />}

      {canCollections && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{t('collection.title', { date: validDate ? formatDate(date) : '' })}</h2>
          {collection.error !== null && <ErrorAlert error={collection.error} />}
          {collection.data === undefined ? <p className="text-text-muted">{t('loading')}</p> : <Collection report={collection.data} />}
        </div>
      )}

      {canOperations && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{t('operations.title', { date: validDate ? formatDate(date) : '' })}</h2>
          {operations.error !== null && <ErrorAlert error={operations.error} />}
          {operations.data === undefined ? <p className="text-text-muted">{t('loading')}</p> : <Operations report={operations.data} />}
        </div>
      )}
    </section>
  );
}
