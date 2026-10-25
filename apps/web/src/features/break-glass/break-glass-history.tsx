'use client';

import { useQuery } from '@tanstack/react-query';
import { CircleDot, CircleOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ErrorAlert } from '@/components/form-fields';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableHead, TableMessage, Td, Th } from '@/components/ui/table';
import { Pager, useListParams } from '@/features/settings/list-controls';
import { SectionHeader } from '@/features/settings/parts';
import { api } from '@/lib/api/client';
import { unwrap } from '@/lib/api/errors';
import { formatDateTime } from '@/lib/format';

/** The hospital's own break-glass history, read only, for its admins and the MD. */
export function BreakGlassHistory() {
  const t = useTranslations('breakGlass');
  const tc = useTranslations('common');
  const list = useListParams();
  const grants = useQuery({
    queryKey: ['break-glass', 'history', list.params.page],
    queryFn: async () => unwrap(await api.GET('/api/v1/break-glass', { params: { query: { page: list.params.page, pageSize: 50 } } })),
  });
  const rows = grants.data?.data ?? [];

  return (
    <section className="space-y-4">
      <SectionHeader title={t('title')} description={t('historyDescription')} />
      {grants.error !== null && <ErrorAlert error={grants.error} />}
      <Table>
        <TableHead>
          <tr>
            <Th>{t('by')}</Th>
            <Th>{t('reason')}</Th>
            <Th>{t('started')}</Th>
            <Th>{t('ends')}</Th>
            <Th>{t('status')}</Th>
          </tr>
        </TableHead>
        <TableBody>
          {grants.isPending && <TableMessage colSpan={5}>{tc('loading')}</TableMessage>}
          {grants.isSuccess && rows.length === 0 && <TableMessage colSpan={5}>{t('empty')}</TableMessage>}
          {rows.map((grant) => (
            <tr key={grant.id}>
              <Td className="whitespace-nowrap">
                {grant.user.displayName} <span className="font-mono text-text-muted">({grant.user.username})</span>
              </Td>
              <Td className="max-w-md">{grant.reason}</Td>
              <Td className="tabular-nums whitespace-nowrap">{formatDateTime(grant.createdAt)}</Td>
              <Td className="tabular-nums whitespace-nowrap">{formatDateTime(grant.endedAt ?? grant.expiresAt)}</Td>
              <Td>
                {grant.active ? (
                  <StatusBadge tone="warning" icon={CircleDot} label={t('open')} />
                ) : (
                  <StatusBadge tone="neutral" icon={CircleOff} label={t('closed')} />
                )}
              </Td>
            </tr>
          ))}
        </TableBody>
      </Table>
      {grants.data !== undefined && <Pager page={grants.data.page} pageSize={grants.data.pageSize} total={grants.data.total} onPage={list.setPage} />}
    </section>
  );
}
