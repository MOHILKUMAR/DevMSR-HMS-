'use client';

import { Search } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { useDebounced } from '@/lib/use-debounced';
import { AgeSex } from './age-sex';
import { formatMobile } from './format';
import { MIN_SEARCH_LENGTH, usePatientSearch } from './queries';

/**
 * Finds a patient and links to a desk's page for them, such as their bill or payments. The search
 * text stays in the page, never in a URL.
 */
export function PatientPicker({ id, label, hrefFor }: { id: string; label: string; hrefFor: (patientId: string) => string }) {
  const t = useTranslations('patients');
  const [text, setText] = useState('');
  const q = useDebounced(text, 300);
  const results = usePatientSearch(q, { pageSize: 8 });
  const searching = q.trim().length >= MIN_SEARCH_LENGTH;
  const rows = searching ? (results.data?.data ?? []) : [];

  return (
    <div className="max-w-xl space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted" aria-hidden />
        <Input
          id={id}
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder={t('searchHint')}
          className="pl-9"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
      </div>
      {searching && (
        <ul aria-label={t('resultsLabel')} className="divide-y divide-border rounded-md border border-border bg-surface">
          {rows.map((row) => (
            <li key={row.id}>
              <Link href={hrefFor(row.id)} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm hover:bg-primary-soft">
                <span>
                  <span className="font-medium">{row.fullName}</span>
                  <span className="block text-xs text-text-muted">
                    <AgeSex patient={row} />
                    {row.phone !== null && <>, {formatMobile(row.phone)}</>}
                  </span>
                </span>
                <span className="font-mono text-xs text-text-muted">{row.uhid}</span>
              </Link>
            </li>
          ))}
          {rows.length === 0 && <li className="px-3 py-2 text-sm text-text-muted">{results.isFetching ? t('searching') : t('noMatches')}</li>}
        </ul>
      )}
    </div>
  );
}
