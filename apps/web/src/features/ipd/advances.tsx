'use client';

import type { RoomCategoryAdvance } from '@devmsr/validation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorAlert } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableHead, TableMessage, Td, Th } from '@/components/ui/table';
import { formatPaise } from '@/lib/format';
import { paiseToRupeesInput, parseRupeesToPaise } from '@/lib/money';
import { useAdvances, useSetAdvance } from './queries';

function AdvanceRow({ row, canManage }: { row: RoomCategoryAdvance; canManage: boolean }) {
  const t = useTranslations('settings.advances');
  const save = useSetAdvance();
  const [text, setText] = useState(paiseToRupeesInput(row.minimumAdvancePaise));
  const paise = parseRupeesToPaise(text);
  return (
    <tr>
      <Td className="font-medium">{row.name}</Td>
      <Td className="font-mono">{row.code}</Td>
      <Td numeric>
        {canManage ? (
          <input
            aria-label={t('amountFor', { name: row.name })}
            aria-invalid={paise === null ? true : undefined}
            inputMode="decimal"
            className="h-10 w-36 rounded-md border border-input-border bg-surface px-2 text-right text-base tabular-nums aria-invalid:border-danger"
            value={text}
            onChange={(event) => { setText(event.target.value); }}
          />
        ) : (
          formatPaise(row.minimumAdvancePaise)
        )}
      </Td>
      {canManage && (
        <Td>
          <div className="flex items-center justify-end gap-2">
            {save.error !== null && <ErrorAlert error={save.error} />}
            <Button
              variant="outline"
              disabled={paise === null || paise === row.minimumAdvancePaise || save.isPending}
              onClick={() => {
                if (paise !== null) save.mutate({ id: row.id, body: { minimumAdvancePaise: paise } });
              }}
            >
              {t('save')}
            </Button>
          </div>
        </Td>
      )}
    </tr>
  );
}

/** Finance sets the advance expected at admission for each room category. Less gives a warning only. */
export function Advances({ canManage }: { canManage: boolean }) {
  const t = useTranslations('settings.advances');
  const advances = useAdvances();
  const rows = advances.data?.data;
  return (
    <section className="space-y-3">
      <p className="text-text-muted">{t('description')}</p>
      {advances.error !== null && <ErrorAlert error={advances.error} />}
      <Table>
        <TableHead>
          <tr>
            <Th>{t('category')}</Th>
            <Th>{t('code')}</Th>
            <Th numeric>{t('amount')}</Th>
            {canManage && (
              <Th>
                <span className="sr-only">{t('actions')}</span>
              </Th>
            )}
          </tr>
        </TableHead>
        <TableBody>
          {rows === undefined && <TableMessage colSpan={4}>{t('loading')}</TableMessage>}
          {rows?.length === 0 && <TableMessage colSpan={4}>{t('none')}</TableMessage>}
          {rows?.map((row) => (
            <AdvanceRow key={`${row.id}-${String(row.minimumAdvancePaise)}`} row={row} canManage={canManage} />
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
