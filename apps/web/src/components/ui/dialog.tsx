'use client';

import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/** A modal with a title, an optional description and a close button. Focus stays inside until it closes. */
export function DialogContent({
  title,
  description,
  closeLabel,
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { title: string; description?: string; closeLabel: string; children: ReactNode }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/50" />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        // Without a description Radix warns unless aria-describedby is set to undefined explicitly.
        {...(description === undefined ? { 'aria-describedby': undefined } : {})}
        className={cn(
          'fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md border border-border bg-surface p-6 shadow-lg',
          className,
        )}
        {...props}
      >
        <div className="mb-4 space-y-1 pr-8">
          <DialogPrimitive.Title className="text-lg font-semibold leading-tight">{title}</DialogPrimitive.Title>
          {description !== undefined && <DialogPrimitive.Description className="text-sm text-text-muted">{description}</DialogPrimitive.Description>}
        </div>
        {children}
        <DialogPrimitive.Close
          className="absolute top-4 right-4 rounded-md p-1 text-text-muted hover:bg-primary-soft hover:text-text"
          aria-label={closeLabel}
        >
          <X className="size-4" aria-hidden />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
