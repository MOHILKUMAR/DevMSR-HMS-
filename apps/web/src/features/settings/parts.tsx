'use client';

import { CircleCheck, CircleSlash, Eye } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ErrorAlert } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { TableMessage } from '@/components/ui/table';

export function ActiveBadge({ active }: { active: boolean }) {
  const t = useTranslations('common');
  return active ? (
    <StatusBadge tone="success" icon={CircleCheck} label={t('active')} />
  ) : (
    <StatusBadge tone="neutral" icon={CircleSlash} label={t('inactive')} />
  );
}

/** The heading of a settings block, with its one primary action when the user may change things. */
export function SectionHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold leading-tight">{title}</h2>
        <p className="max-w-2xl text-sm text-text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function ReadOnlyNote() {
  const t = useTranslations('settings');
  return (
    <p className="flex items-center gap-2 rounded-md bg-info-soft px-3 py-2 text-sm text-info">
      <Eye className="size-4 shrink-0" aria-hidden />
      {t('readOnly')}
    </p>
  );
}

/** Loading, failed and empty states as a table row, so the table keeps its shape. */
export function ListStateRow({
  colSpan,
  isPending,
  error,
  isEmpty,
  emptyText,
  onRetry,
}: {
  colSpan: number;
  isPending: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyText: string;
  onRetry: () => void;
}) {
  const t = useTranslations('common');
  if (isPending) return <TableMessage colSpan={colSpan}>{t('loading')}</TableMessage>;
  if (error !== null) {
    return (
      <TableMessage colSpan={colSpan}>
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-left">
          <ErrorAlert error={error} />
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t('retry')}
          </Button>
        </div>
      </TableMessage>
    );
  }
  return isEmpty ? <TableMessage colSpan={colSpan}>{emptyText}</TableMessage> : null;
}
