'use client';

import { CircleCheck, MonitorSmartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ErrorAlert } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableHead, TableMessage, Td, Th } from '@/components/ui/table';
import { formatDateTime } from '@/lib/format';
import { useEndOtherSessions, useEndSession, useOwnSessions } from './queries';
import { describeUserAgent } from './user-agent';

/** The signed-in user's own sessions, with a way to end any but the one in use. */
export function OwnSessions() {
  const t = useTranslations('account.sessions');
  const tc = useTranslations('common');
  const sessions = useOwnSessions();
  const endOne = useEndSession();
  const endOthers = useEndOtherSessions();
  const rows = sessions.data?.data ?? [];
  const hasOthers = rows.some((session) => !session.current);
  const error = sessions.error ?? endOne.error ?? endOthers.error;

  return (
    <section aria-labelledby="sessions-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="sessions-title" className="text-lg font-semibold">
            {t('title')}
          </h2>
          <p className="text-sm text-text-muted">{t('description')}</p>
        </div>
        <Button
          variant="outline"
          disabled={!hasOthers || endOthers.isPending}
          onClick={() => {
            endOthers.mutate(undefined);
          }}
        >
          {t('endOthers')}
        </Button>
      </div>

      {endOthers.data !== undefined && (
        <p role="status" className="flex items-center gap-2 text-sm text-success">
          <CircleCheck className="size-4" aria-hidden />
          {t('ended', { count: endOthers.data.ended })}
        </p>
      )}
      {error !== null && <ErrorAlert error={error} />}

      <Table>
        <TableHead>
          <tr>
            <Th>{t('device')}</Th>
            <Th>{t('ipAddress')}</Th>
            <Th>{t('signedIn')}</Th>
            <Th>{t('lastActive')}</Th>
            <Th className="text-right">{tc('actions')}</Th>
          </tr>
        </TableHead>
        <TableBody>
          {sessions.isPending && <TableMessage colSpan={5}>{tc('loading')}</TableMessage>}
          {rows.map((session) => {
            const device = describeUserAgent(session.userAgent) ?? t('unknownDevice');
            return (
              <tr key={session.id}>
                <Td>
                  <span className="flex items-center gap-2">
                    <MonitorSmartphone className="size-4 text-text-muted" aria-hidden />
                    {device}
                  </span>
                </Td>
                <Td className="font-mono">{session.ipAddress ?? t('unknownAddress')}</Td>
                <Td className="tabular-nums">{formatDateTime(session.createdAt)}</Td>
                <Td className="tabular-nums">{formatDateTime(session.lastSeenAt)}</Td>
                <Td className="text-right">
                  {session.current ? (
                    <StatusBadge tone="success" icon={CircleCheck} label={t('thisDevice')} />
                  ) : (
                    <Button
                      variant="ghost"
                      aria-label={t('endNamed', { device })}
                      disabled={endOne.isPending}
                      onClick={() => {
                        endOne.mutate(session.id);
                      }}
                    >
                      {t('end')}
                    </Button>
                  )}
                </Td>
              </tr>
            );
          })}
          {sessions.isSuccess && !hasOthers && <TableMessage colSpan={5}>{t('empty')}</TableMessage>}
        </TableBody>
      </Table>
    </section>
  );
}
