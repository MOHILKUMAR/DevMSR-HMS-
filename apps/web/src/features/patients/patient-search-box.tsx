'use client';

import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useDebounced } from '@/lib/use-debounced';
import { cn } from '@/lib/utils';
import { AgeSex } from './age-sex';
import { formatMobile } from './format';
import { MIN_SEARCH_LENGTH, usePatientSearch } from './queries';

const LIST_ID = 'patient-search-results';

/** True when a key press belongs to a field the user is typing in. */
function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

/**
 * The patient search in the top bar: type a UHID, mobile number or name, then pick a patient with
 * the arrow keys and Enter, or the mouse. "/" jumps here from anywhere on the page.
 */
export function PatientSearchBox() {
  const t = useTranslations('shell');
  const tp = useTranslations('patients');
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const q = useDebounced(text, 250);
  const results = usePatientSearch(q, { pageSize: 8 });
  const searching = q.trim().length >= MIN_SEARCH_LENGTH;
  const rows = searching ? (results.data?.data ?? []) : [];
  const expanded = open && searching;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === '/' && !isTyping(event.target)) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const openPatient = (id: string) => {
    setText('');
    setOpen(false);
    router.push(`/patients/${id}`);
  };

  return (
    <form
      role="search"
      aria-label={t('searchLabel')}
      className="relative w-full max-w-md"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <label htmlFor="patient-search" className="sr-only">
        {t('searchLabel')}
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted" aria-hidden />
      <Input
        ref={inputRef}
        id="patient-search"
        type="search"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        aria-expanded={expanded}
        aria-controls={LIST_ID}
        aria-autocomplete="list"
        aria-activedescendant={expanded && rows[active] !== undefined ? `patient-option-${rows[active].id}` : undefined}
        placeholder={t('searchPlaceholder')}
        value={text}
        className="pl-9"
        onChange={(event) => {
          setText(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
        }}
        onBlur={() => {
          // Leave time for a click on a result to land first.
          setTimeout(() => {
            setOpen(false);
          }, 150);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && rows.length > 0) {
            event.preventDefault();
            setOpen(true);
            setActive((current) => (current + 1) % rows.length);
          } else if (event.key === 'ArrowUp' && rows.length > 0) {
            event.preventDefault();
            setActive((current) => (current - 1 + rows.length) % rows.length);
          } else if (event.key === 'Enter') {
            const row = rows[active];
            if (expanded && row !== undefined) {
              event.preventDefault();
              openPatient(row.id);
            }
          } else if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {expanded && (
        <ul
          id={LIST_ID}
          role="listbox"
          aria-label={tp('resultsLabel')}
          className="absolute top-full right-0 left-0 z-30 mt-1 max-h-96 overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-lg"
        >
          {rows.map((row, index) => (
            <li
              key={row.id}
              id={`patient-option-${row.id}`}
              role="option"
              aria-selected={index === active}
              className={cn('cursor-pointer px-3 py-2 text-sm', index === active && 'bg-primary-soft')}
              onMouseDown={(event) => {
                event.preventDefault();
                openPatient(row.id);
              }}
              onMouseEnter={() => {
                setActive(index);
              }}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{row.fullName}</span>
                <span className="font-mono text-xs text-text-muted">{row.uhid}</span>
              </span>
              <span className="text-xs text-text-muted">
                <AgeSex patient={row} />
                {row.phone !== null && <>, {formatMobile(row.phone)}</>}
              </span>
            </li>
          ))}
          {rows.length === 0 && (
            <li role="presentation" className="px-3 py-2 text-sm text-text-muted">
              {results.isFetching ? tp('searching') : tp('noMatches')}
            </li>
          )}
        </ul>
      )}
    </form>
  );
}
