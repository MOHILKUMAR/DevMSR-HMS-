'use client';

import type { OpdVisitStatus } from '@devmsr/validation';
import { Ban, CircleCheck, CircleDollarSign, Clock, Stethoscope } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { StatusBadge } from '@/components/ui/status-badge';

/** A visit's state: always an icon and a word as well as a colour (section 16). */
export function VisitStatus({ status }: { status: OpdVisitStatus }) {
  const t = useTranslations('opd.status');
  switch (status) {
    case 'awaiting_payment':
      return <StatusBadge tone="warning" icon={CircleDollarSign} label={t('awaiting_payment')} />;
    case 'waiting':
      return <StatusBadge tone="info" icon={Clock} label={t('waiting')} />;
    case 'with_doctor':
      return <StatusBadge tone="accent" icon={Stethoscope} label={t('with_doctor')} />;
    case 'completed':
      return <StatusBadge tone="success" icon={CircleCheck} label={t('completed')} />;
    case 'cancelled':
      return <StatusBadge tone="neutral" icon={Ban} label={t('cancelled')} />;
  }
}
