'use client';

import type { BED_STATUSES } from '@devmsr/validation';
import { Ban, BedDouble, BedSingle, Bookmark, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { StatusBadge } from '@/components/ui/status-badge';

/** Section 16's bed colours, always with an icon and a word: free, occupied, cleaning, reserved, blocked. */
export function BedStatusBadge({ status }: { status: (typeof BED_STATUSES)[number] }) {
  const t = useTranslations('bedStatus');
  switch (status) {
    case 'free':
      return <StatusBadge tone="success" icon={BedSingle} label={t('free')} />;
    case 'occupied':
      return <StatusBadge tone="info" icon={BedDouble} label={t('occupied')} />;
    case 'cleaning':
      return <StatusBadge tone="warning" icon={Sparkles} label={t('cleaning')} />;
    case 'reserved':
      return <StatusBadge tone="accent" icon={Bookmark} label={t('reserved')} />;
    case 'blocked':
      return <StatusBadge tone="neutral" icon={Ban} label={t('blocked')} />;
  }
}
