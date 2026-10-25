import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-10 w-full min-w-0 rounded-md border border-border bg-surface px-3 text-base text-text placeholder:text-text-muted disabled:cursor-not-allowed disabled:bg-neutral-soft aria-invalid:border-danger',
        className,
      )}
      {...props}
    />
  );
}
