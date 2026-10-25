'use client';

import type { Shift } from '@devmsr/validation';
import { CircleCheck, Clock, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/form-fields';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableHead, TableMessage, Td, Th } from '@/components/ui/table';
import { useShifts } from '@/features/billing/queries';
import { Pager } from '@/features/settings/list-controls';
import { formatDateTime, formatPaise } from '@/lib/format';

function ShiftState({ shift }: { shift: Shift }) {
  const t = useTranslations('payments.shifts');
  if (shift.closedAt === null) return <StatusBadge tone="info" icon={Clock} label={t('open')} />;
  return shift.differencePaise === 0 ? (
    <StatusBadge tone="success" icon={CircleCheck} label={t('tallied')} />
  ) : (
    <StatusBadge tone="danger" icon={TriangleAlert} label={t('difference')} />
  );
}

/** Every cashier's shifts for finance: what each drawer should have held, what was counted, and why it differed. */
export function ShiftsList() {
  const t = useTranslations('payments.shifts');
  const [page, setPage] = useState(1);
  const shifts = useShifts(page);
  const rows = shifts.data?.data;

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-text-muted">{t('description')}</p>
      </div>
      {shifts.error !== null && <ErrorAlert error={shifts.error} />}
      <Table>
        <TableHead>
          <tr>
            <Th>{t('cashier')}</Th>
            <Th>{t('opened')}</Th>
            <Th>{t('closed')}</Th>
            <Th numeric>{t('expected')}</Th>
            <Th numeric>{t('counted')}</Th>
            <Th numeric>{t('differenceColumn')}</Th>
            <Th>{t('status')}</Th>
            <Th>{t('reason')}</Th>
          </tr>
        </TableHead>
        <TableBody>
          {rows === undefined && <TableMessage colSpan={8}>{t('loading')}</TableMessage>}
          {rows?.length === 0 && <TableMessage colSpan={8}>{t('none')}</TableMessage>}
          {rows?.map((shift) => (
            <tr key={shift.id}>
              <Td className="font-medium">{shift.cashierName ?? t('unknownCashier')}</Td>
              <Td className="whitespace-nowrap tabular-nums">{formatDateTime(shift.openedAt)}</Td>
              <Td className="whitespace-nowrap tabular-nums">{shift.closedAt === null ? '' : formatDateTime(shift.closedAt)}</Td>
              <Td numeric>{formatPaise(shift.expectedCashPaise)}</Td>
              <Td numeric>{shift.countedCashPaise === null ? '' : formatPaise(shift.countedCashPaise)}</Td>
              <Td numeric className={shift.differencePaise !== null && shift.differencePaise !== 0 ? 'text-danger' : ''}>
                {shift.differencePaise === null ? '' : formatPaise(shift.differencePaise)}
              </Td>
              <Td>
                <ShiftState shift={shift} />
              </Td>
              <Td>{shift.differenceReason ?? ''}</Td>
            </tr>
          ))}
        </TableBody>
      </Table>
      {shifts.data !== undefined && <Pager page={shifts.data.page} pageSize={shifts.data.pageSize} total={shifts.data.total} onPage={setPage} />}
    </section>
  );
}
