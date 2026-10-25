import type { Metadata } from 'next';
import { NotificationsList } from '@/features/notifications/notifications-list';

export const metadata: Metadata = { title: 'Notifications | DevMSR HMS' };

export default function NotificationsPage() {
  return <NotificationsList />;
}
