import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** The browser's own select: keyboard friendly and light. Styled like Input. */
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      data-slot="select"
      className={cn(
        'h-10 w-full min-w-0 rounded-md border border-border bg-surface px-3 text-base text-text disabled:cursor-not-allowed disabled:bg-neutral-soft aria-invalid:border-danger',
        className,
      )}
      {...props}
    />
  );
}
