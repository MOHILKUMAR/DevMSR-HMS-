import { Bell } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { serverApi, sessionCookieHeader } from '@/lib/api/server';

/** The unread count, fetched on the server with the page, so it costs the browser no request. */
async function unreadCount(): Promise<number> {
  const cookie = await sessionCookieHeader();
  if (cookie === undefined) return 0;
  const { data } = await serverApi.GET('/api/v1/notifications/unread-count', { headers: { cookie }, cache: 'no-store' });
  return data?.unread ?? 0;
}

export async function NotificationBell() {
  const t = await getTranslations('shell');
  const count = await unreadCount();
  return (
    <Link
      href="/notifications"
      aria-label={t('notificationsUnread', { count })}
      className="relative flex size-10 items-center justify-center rounded-md hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <Bell className="size-5 text-text-muted" aria-hidden />
      {count > 0 && (
        <span
          aria-hidden
          className="absolute top-1 right-1 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] leading-4 font-semibold text-surface tabular-nums"
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
