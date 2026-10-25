import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Dense tables at 14px (section 16). Numbers use the `numeric` cell: tabular figures, right aligned.

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-surface">
      <table className={cn('w-full border-collapse text-sm', className)} {...props} />
    </div>
  );
}

export function TableHead(props: ComponentProps<'thead'>) {
  return <thead className="border-b border-border bg-neutral-soft text-left" {...props} />;
}

export function TableBody(props: ComponentProps<'tbody'>) {
  return <tbody className="divide-y divide-border" {...props} />;
}

export function Th({ className, numeric = false, ...props }: ComponentProps<'th'> & { numeric?: boolean }) {
  return <th scope="col" className={cn('px-3 py-2 font-medium text-text-muted', numeric && 'text-right', className)} {...props} />;
}

export function Td({ className, numeric = false, ...props }: ComponentProps<'td'> & { numeric?: boolean }) {
  return <td className={cn('px-3 py-2 align-middle', numeric && 'text-right tabular-nums', className)} {...props} />;
}

/** A row spanning the table, for "nothing here yet" and loading states. */
export function TableMessage({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-6 text-center text-text-muted">
        {children}
      </td>
    </tr>
  );
}
