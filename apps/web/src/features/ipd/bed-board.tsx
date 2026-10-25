'use client';

import { SETTABLE_BED_STATUSES, type BedBoard as Board } from '@devmsr/validation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ErrorAlert } from '@/components/form-fields';
import { formatPaise } from '@/lib/format';
import { BedStatusBadge } from './bed-status';
import { useBedBoard, useSetBedStatus } from './queries';

type BoardBed = Board['wards'][number]['beds'][number];

/** One bed: its state, who is in it, and (for nurses) a way to set an empty bed's state. */
function BedTile({ bed, canSetStatus }: { bed: BoardBed; canSetStatus: boolean }) {
  const t = useTranslations('ipd.board');
  const tb = useTranslations('bedStatus');
  const setStatus = useSetBedStatus();
  return (
    <li className="space-y-2 rounded-md border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono font-semibold">{bed.code}</span>
        <BedStatusBadge status={bed.status} />
      </div>
      {bed.occupant !== null && (
        <Link href={`/ipd/admissions/${bed.occupant.admissionId}`} className="block text-sm text-primary underline-offset-4 hover:underline">
          {bed.occupant.patientName}
          <span className="block font-mono text-xs text-text-muted">{bed.occupant.admissionNumber}</span>
        </Link>
      )}
      {bed.occupant === null && canSetStatus && (
        <select
          aria-label={t('setStatusFor', { bed: bed.code })}
          className="h-10 w-full rounded-md border border-input-border bg-surface px-2 text-sm"
          value={bed.status}
          disabled={setStatus.isPending}
          onChange={(event) => {
            const next = SETTABLE_BED_STATUSES.find((status) => status === event.target.value);
            if (next !== undefined) setStatus.mutate({ id: bed.id, body: { status: next } });
          }}
        >
          {SETTABLE_BED_STATUSES.map((status) => (
            <option key={status} value={status}>
              {tb(status)}
            </option>
          ))}
        </select>
      )}
      {setStatus.error !== null && <ErrorAlert error={setStatus.error} />}
    </li>
  );
}

/** Every ward and bed at a glance, by state, refreshed as beds change at other desks. */
export function BedBoard({ canSetStatus }: { canSetStatus: boolean }) {
  const t = useTranslations('ipd.board');
  const board = useBedBoard();
  // A ward with no active beds has nothing to show on the board.
  const wards = board.data?.wards.filter((ward) => ward.beds.length > 0);
  const beds = (wards ?? []).flatMap((ward) => ward.beds);
  const count = (status: string) => beds.filter((bed) => bed.status === status).length;

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-text-muted">
          {t('summary', { free: count('free'), occupied: count('occupied'), cleaning: count('cleaning'), total: beds.length })}
        </p>
      </div>
      {board.error !== null && <ErrorAlert error={board.error} />}
      {wards === undefined && <p className="text-text-muted">{t('loading')}</p>}
      {wards?.length === 0 && <p className="text-text-muted">{t('noWards')}</p>}
      {wards?.map((ward) => (
        <div key={ward.id} className="space-y-2">
          <h2 className="text-lg font-semibold">
            {ward.name}
            <span className="ml-2 text-sm font-normal text-text-muted">
              {ward.roomCategory === null ? t('noCategory') : t('category', { name: ward.roomCategory.name, advance: formatPaise(ward.roomCategory.minimumAdvancePaise) })}
            </span>
          </h2>
          <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {ward.beds.map((bed) => (
              <BedTile key={bed.id} bed={bed} canSetStatus={canSetStatus} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
