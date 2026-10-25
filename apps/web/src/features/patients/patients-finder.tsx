'use client';

import { Search, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableHead, TableMessage, Td, Th } from '@/components/ui/table';
import { Pager } from '@/features/settings/list-controls';
import { useDebounced } from '@/lib/use-debounced';
import { AgeSex } from './age-sex';
import { formatMobile } from './format';
import { MIN_SEARCH_LENGTH, usePatientSearch } from './queries';

/**
 * The Patients section: one search box for UHID, mobile, name, Aadhaar or ABHA, and the way in to
 * registration. What is typed stays in the page, never in the address bar.
 */
export function PatientsFinder({ canRegister }: { canRegister: boolean }) {
  const t = useTranslations('patients');
  const [text, setText] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounced(text, 300);
  const results = usePatientSearch(q, { page });
  const searching = q.trim().length >= MIN_SEARCH_LENGTH;
  const rows = searching ? (results.data?.data ?? []) : [];

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <p className="text-text-muted">{t('description')}</p>
        </div>
        {canRegister && (
          <Button asChild>
            <Link href="/patients/new">
              <UserPlus aria-hidden />
              {t('register')}
            </Link>
          </Button>
        )}
      </div>

      <div className="max-w-xl space-y-1.5">
        <label htmlFor="patients-search" className="text-sm font-medium">
          {t('searchLabel')}
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-text-muted" aria-hidden />
          <Input
            id="patients-search"
            type="search"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            aria-describedby="patients-search-hint"
            className="h-12 pl-10 text-lg"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <p id="patients-search-hint" className="text-sm text-text-muted">
          {t('searchHint')}
        </p>
      </div>

      {results.error !== null && <ErrorAlert error={results.error} />}

      <Table aria-label={t('resultsLabel')}>
        <TableHead>
          <tr>
            <Th className="w-48">{t('columns.uhid')}</Th>
            <Th>{t('columns.name')}</Th>
            <Th>{t('columns.ageSex')}</Th>
            <Th>{t('columns.mobile')}</Th>
            <Th className="text-right">{t('columns.actions')}</Th>
          </tr>
        </TableHead>
        <TableBody>
          {!searching && <TableMessage colSpan={5}>{t('typeToSearch')}</TableMessage>}
          {searching && rows.length === 0 && <TableMessage colSpan={5}>{results.isFetching ? t('searching') : t('noMatches')}</TableMessage>}
          {rows.map((row) => (
            <tr key={row.id}>
              <Td className="font-mono">{row.uhid}</Td>
              <Td className="font-medium">{row.fullName}</Td>
              <Td>
                <AgeSex patient={row} />
              </Td>
              <Td className="tabular-nums">{row.phone === null ? '' : formatMobile(row.phone)}</Td>
              <Td className="text-right">
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/patients/${row.id}`} aria-label={t('openNamed', { name: row.fullName })}>
                    {t('open')}
                  </Link>
                </Button>
              </Td>
            </tr>
          ))}
        </TableBody>
      </Table>
      {searching && results.data !== undefined && (
        <Pager page={results.data.page} pageSize={results.data.pageSize} total={results.data.total} onPage={setPage} />
      )}
    </section>
  );
}
