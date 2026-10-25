'use client';

import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ListParams } from './queries';

/** Search text, page and the "show inactive" switch for a list screen. Search waits for typing to pause. */
export function useListParams() {
  const [search, setSearch] = useState('');
  const [params, setParams] = useState<ListParams>({ page: 1, q: '', includeInactive: false });

  useEffect(() => {
    const timer = setTimeout(() => {
      setParams((current) => (current.q === search ? current : { ...current, q: search, page: 1 }));
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [search]);

  return {
    params,
    search,
    setSearch,
    setPage: (page: number) => {
      setParams((current) => ({ ...current, page }));
    },
    setIncludeInactive: (includeInactive: boolean) => {
      setParams((current) => ({ ...current, includeInactive, page: 1 }));
    },
  };
}

export function ListToolbar({
  id,
  searchLabel,
  search,
  onSearch,
  includeInactive,
  onIncludeInactive,
  children,
}: {
  id: string;
  searchLabel: string;
  search: string;
  onSearch: (value: string) => void;
  includeInactive: boolean;
  onIncludeInactive: (value: boolean) => void;
  children?: ReactNode;
}) {
  const t = useTranslations('common');
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full max-w-xs">
        <label htmlFor={`${id}-search`} className="sr-only">
          {searchLabel}
        </label>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted" aria-hidden />
        <Input
          id={`${id}-search`}
          type="search"
          placeholder={searchLabel}
          value={search}
          onChange={(event) => {
            onSearch(event.target.value);
          }}
          className="pl-9"
        />
      </div>
      {children}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={includeInactive}
          onChange={(event) => {
            onIncludeInactive(event.target.checked);
          }}
        />
        {t('showInactive')}
      </label>
    </div>
  );
}

/** "1 to 100 of 240" with previous and next. Hidden when everything fits on one page. */
export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const t = useTranslations('common');
  if (total <= pageSize && page === 1) return null;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-end gap-2 text-sm">
      <span className="text-text-muted tabular-nums">{t('pageRange', { from, to, total })}</span>
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => {
          onPage(page - 1);
        }}
      >
        <ChevronLeft aria-hidden />
        {t('previous')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={to >= total}
        onClick={() => {
          onPage(page + 1);
        }}
      >
        {t('next')}
        <ChevronRight aria-hidden />
      </Button>
    </div>
  );
}
