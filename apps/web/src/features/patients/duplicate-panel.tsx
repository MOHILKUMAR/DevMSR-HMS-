'use client';

import type { DuplicateMatch } from '@devmsr/validation';
import { ExternalLink, OctagonAlert, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AgeSex } from './age-sex';
import { formatMobile } from './format';

function MatchList({ matches }: { matches: readonly DuplicateMatch[] }) {
  const t = useTranslations('patients.duplicates');
  return (
    <ul className="divide-y divide-border rounded-md border border-border bg-surface">
      {matches.map((match) => (
        <li key={match.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
          <span>
            <span className="font-medium">{match.fullName}</span>{' '}
            <span className="font-mono text-xs text-text-muted">{match.uhid}</span>
            <span className="block text-text-muted">
              <AgeSex patient={match} />
              {match.phone !== null && <>, {formatMobile(match.phone)}</>}
              {'. '}
              {match.reasons.map((reason) => t(`reasons.${reason}`)).join(', ')}
            </span>
          </span>
          {/* A new tab, so the form typed so far is not lost. */}
          <a
            href={`/patients/${match.id}`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
          >
            {t('open')}
            <ExternalLink className="size-3.5" aria-hidden />
            <span className="sr-only">{t('newTab')}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * Shown before registering when someone already looks like this patient. The same Aadhaar or ABHA
 * blocks registration; a shared mobile or name and birth year asks staff to decide.
 */
export function DuplicatePanel({
  blocking,
  possible,
  pending,
  onRegisterAnyway,
  onBack,
}: {
  blocking: readonly DuplicateMatch[];
  possible: readonly DuplicateMatch[];
  pending: boolean;
  onRegisterAnyway: () => void;
  onBack: () => void;
}) {
  const t = useTranslations('patients.duplicates');
  const blocked = blocking.length > 0;
  const Icon = blocked ? OctagonAlert : TriangleAlert;
  // The panel opens below a long form: bring it into view and move keyboard focus to it.
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.scrollIntoView({ block: 'center' });
    panel.current?.focus();
  }, []);

  return (
    <section
      ref={panel}
      tabIndex={-1}
      role="alert"
      aria-labelledby="duplicate-title"
      className={cn('space-y-3 rounded-md border p-4', blocked ? 'border-danger bg-danger-soft' : 'border-warning bg-warning-soft')}
    >
      <h2 id="duplicate-title" className={cn('flex items-center gap-2 text-base font-semibold', blocked ? 'text-danger' : 'text-warning')}>
        <Icon className="size-5" aria-hidden />
        {blocked ? t('blockedTitle') : t('possibleTitle')}
      </h2>
      <p className="text-sm">{blocked ? t('blockedBody') : t('possibleBody')}</p>
      <MatchList matches={blocked ? blocking : possible} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          {t('back')}
        </Button>
        {!blocked && (
          <Button type="button" variant="outline" disabled={pending} onClick={onRegisterAnyway}>
            {t('registerAnyway')}
          </Button>
        )}
      </div>
    </section>
  );
}
