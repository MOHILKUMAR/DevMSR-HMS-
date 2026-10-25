import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { DocumentSize } from './invoice-document';
import { PrintToolbar } from './print-toolbar';

/** Reads `?size=` and `?auto=` from a print link. Anything unknown is A4, printed straight away. */
export function printOptions(search: Record<string, string | string[] | undefined>): { size: DocumentSize; auto: boolean } {
  return { size: search.size === 'thermal' ? 'thermal' : 'a4', auto: search.auto !== '0' };
}

/** A sheet of A4 or an 80 mm thermal slip, with the paper size set for the print dialog. */
export function PrintPage({ size, auto, children }: { size: DocumentSize; auto: boolean; children: ReactNode }) {
  return (
    <>
      <style>{size === 'thermal' ? '@page { size: 80mm auto; margin: 3mm; }' : '@page { size: A4; margin: 12mm; }'}</style>
      <div className={cn('mx-auto', size === 'thermal' ? 'w-[74mm]' : 'max-w-[186mm]')}>
        <PrintToolbar auto={auto} />
        {children}
      </div>
    </>
  );
}
