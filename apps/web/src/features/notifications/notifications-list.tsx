'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Notification } from '@devmsr/validation';
import { Bell, CircleDot, ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ErrorAlert } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Pager, useListParams } from '@/features/settings/list-controls';
import { api, csrfHeader } from '@/lib/api/client';
import { unwrap } from '@/lib/api/errors';
import { formatDateTime } from '@/lib/format';

const NOTIFICATIONS = ['notifications'] as const;

function asText(value: string | number | boolean | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

/** The words for a notification come from messages/en.json; the API sends only its facts. */
function useNotificationText(): (notification: Notification) => string {
  const t = useTranslations('notifications');
  return ({ kind, details }) => {
    if (kind === 'break_glass_started') {
      return t('break_glass_started', { name: asText(details['byName']), time: formatDateTime(asText(details['expiresAt'])) });
    }
    const values = { failures: Number(details['failures'] ?? 0), minutes: Number(details['windowMinutes'] ?? 0) };
    return details['scope'] === 'platform' ? t('failed_logins_platform', values) : t('failed_logins_hospital', values);
  };
}

export function NotificationsList() {
  const t = useTranslations('notifications');
  const tc = useTranslations('common');
  const text = useNotificationText();
  const router = useRouter();
  const queryClient = useQueryClient();
  const list = useListParams();
  const notifications = useQuery({
    queryKey: [...NOTIFICATIONS, list.params.page],
    queryFn: async () => unwrap(await api.GET('/api/v1/notifications', { params: { query: { page: list.params.page, pageSize: 50 } } })),
  });
  // The top bar's unread count is rendered on the server, so it refreshes with the route.
  const refreshed = async () => {
    await queryClient.invalidateQueries({ queryKey: NOTIFICATIONS });
    router.refresh();
  };
  const markRead = useMutation({
    mutationFn: async (id: string) => {
      unwrap(await api.POST('/api/v1/notifications/{id}/read', { params: { header: csrfHeader(), path: { id } } }));
    },
    onSuccess: refreshed,
  });
  const markAll = useMutation({
    mutationFn: async () => unwrap(await api.POST('/api/v1/notifications/read-all', { params: { header: csrfHeader() } })),
    onSuccess: refreshed,
  });
  const rows = notifications.data?.data ?? [];
  const error = notifications.error ?? markRead.error ?? markAll.error;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <Button
          variant="outline"
          disabled={markAll.isPending || !rows.some((row) => row.readAt === null)}
          onClick={() => {
            markAll.mutate();
          }}
        >
          {t('markAllRead')}
        </Button>
      </div>
      {error !== null && <ErrorAlert error={error} />}
      {notifications.isPending && <p className="text-sm text-text-muted">{tc('loading')}</p>}
      {notifications.isSuccess && rows.length === 0 && <p className="text-sm text-text-muted">{t('empty')}</p>}
      <ul className="space-y-2">
        {rows.map((notification) => {
          const Icon = notification.kind === 'break_glass_started' ? ShieldAlert : Bell;
          return (
            <li
              key={notification.id}
              className={notification.readAt === null ? 'rounded-md border border-primary bg-surface p-3' : 'rounded-md border border-border bg-surface p-3'}
            >
              <div className="flex items-start gap-3">
                <Icon className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden />
                <div className="flex-1 space-y-1">
                  <p className="text-sm">{text(notification)}</p>
                  <p className="text-xs text-text-muted tabular-nums">{formatDateTime(notification.createdAt)}</p>
                </div>
                {notification.readAt === null && (
                  <div className="flex items-center gap-2">
                    <StatusBadge tone="info" icon={CircleDot} label={t('unread')} />
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={markRead.isPending}
                      onClick={() => {
                        markRead.mutate(notification.id);
                      }}
                    >
                      {t('markRead')}
                    </Button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {notifications.data !== undefined && (
        <Pager page={notifications.data.page} pageSize={notifications.data.pageSize} total={notifications.data.total} onPage={list.setPage} />
      )}
    </section>
  );
}
