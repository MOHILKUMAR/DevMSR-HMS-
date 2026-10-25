'use client';

import type { DischargeStatus, SummaryStatus } from '@devmsr/validation';
import { CircleCheck, CircleDashed, PenLine } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableHead, TableMessage, Td, Th } from '@/components/ui/table';
import { formatDateTime } from '@/lib/format';
import { useDischarges } from './queries';

function SummaryBadge({ status }: { status: SummaryStatus }) {
  const t = useTranslations('discharge.desk.summaryStatus');
  if (status === 'signed') return <StatusBadge tone="success" icon={CircleCheck} label={t('signed')} />;
  if (status === 'draft') return <StatusBadge tone="warning" icon={PenLine} label={t('draft')} />;
  return <StatusBadge tone="neutral" icon={CircleDashed} label={t('none')} />;
}

/** Patients marked fit for discharge, and the step each discharge has reached. */
export function DischargeDesk() {
  const t = useTranslations('discharge.desk');
  const [status, setStatus] = useState<DischargeStatus>('open');
  const discharges = useDischarges(status);
  const rows = discharges.data?.data;
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-text-muted">{t('description')}</p>
      </div>
      <div role="group" aria-label={t('show')} className="flex gap-2">
        {(['open', 'completed'] as const).map((value) => (
          <Button key={value} variant={status === value ? 'primary' : 'outline'} aria-pressed={status === value} onClick={() => { setStatus(value); }}>
            {t(`statuses.${value}`)}
          </Button>
        ))}
      </div>
      {discharges.error !== null && <ErrorAlert error={discharges.error} />}
      <Table>
        <TableHead>
          <tr>
            <Th>{t('number')}</Th>
            <Th>{t('patient')}</Th>
            <Th>{t('bed')}</Th>
            <Th>{t('fitAt')}</Th>
            <Th>{t('clearance')}</Th>
            <Th>{t('summary')}</Th>
            {status === 'completed' && <Th>{t('completedAt')}</Th>}
          </tr>
        </TableHead>
        <TableBody>
          {rows === undefined && <TableMessage colSpan={7}>{t('loading')}</TableMessage>}
          {rows?.length === 0 && <TableMessage colSpan={7}>{t(status === 'open' ? 'noneOpen' : 'noneCompleted')}</TableMessage>}
          {rows?.map((row) => (
            <tr key={row.id}>
              <Td>
                <Link href={`/discharge/${row.id}`} className="whitespace-nowrap font-mono text-primary underline-offset-4 hover:underline">
                  {row.admission.number}
                </Link>
              </Td>
              <Td>
                {row.admission.patient.fullName}
                <span className="block font-mono text-xs text-text-muted">{row.admission.patient.uhid}</span>
              </Td>
              <Td>{row.admission.bed === null ? '' : `${row.admission.bed.wardName} ${row.admission.bed.code}`}</Td>
              <Td className="whitespace-nowrap tabular-nums">{formatDateTime(row.fitAt)}</Td>
              <Td>
                {row.clearedAt === null ? (
                  <StatusBadge tone="neutral" icon={CircleDashed} label={t('notCleared')} />
                ) : (
                  <StatusBadge tone="success" icon={CircleCheck} label={t('cleared')} />
                )}
              </Td>
              <Td>
                <SummaryBadge status={row.summaryStatus} />
              </Td>
              {status === 'completed' && <Td className="whitespace-nowrap tabular-nums">{row.completedAt === null ? '' : formatDateTime(row.completedAt)}</Td>}
            </tr>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
