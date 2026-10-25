'use client';

import type { Bed } from '@devmsr/validation';
import { Ban, Bookmark, CircleCheck, SprayCan, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { StatusBadge } from '@/components/ui/status-badge';

// Section 16: Free = success, Occupied = info, Cleaning = warning, Reserved = accent, Blocked = muted.
const STYLES = {
  free: { tone: 'success', icon: CircleCheck },
  occupied: { tone: 'info', icon: User },
  cleaning: { tone: 'warning', icon: SprayCan },
  reserved: { tone: 'accent', icon: Bookmark },
  blocked: { tone: 'neutral', icon: Ban },
} as const;

export function BedStatusBadge({ status }: { status: Bed['status'] }) {
  const t = useTranslations('bedStatus');
  const { tone, icon } = STYLES[status];
  return <StatusBadge tone={tone} icon={icon} label={t(status)} />;
}
