'use client';

import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ComponentProps, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { errorMessageKey, type ErrorMessageKey } from '@/lib/api/errors';

interface FieldText {
  label: string;
  /** Shown under the field while it is valid. */
  hint?: string;
  /** Shown instead of the hint when the field is invalid. */
  error?: string | undefined;
}

function describedBy(id: string, { hint, error }: FieldText): string | undefined {
  if (error !== undefined) return `${id}-error`;
  return hint === undefined ? undefined : `${id}-hint`;
}

function FieldFooter({ id, hint, error }: { id: string } & Omit<FieldText, 'label'>) {
  if (error !== undefined) {
    return (
      <p id={`${id}-error`} className="text-sm text-danger">
        {error}
      </p>
    );
  }
  return hint === undefined ? null : (
    <p id={`${id}-hint`} className="text-sm text-text-muted">
      {hint}
    </p>
  );
}

/** A labelled input with its hint or error. Takes React Hook Form's `register(...)` props, ref included. */
export function TextField({ id, label, hint, error, ...props }: ComponentProps<'input'> & FieldText & { id: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={describedBy(id, { label, hint, error })}
        {...props}
      />
      <FieldFooter id={id} hint={hint} error={error} />
    </div>
  );
}

export function SelectField({
  id,
  label,
  hint,
  error,
  children,
  ...props
}: ComponentProps<'select'> & FieldText & { id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select id={id} aria-invalid={error === undefined ? undefined : true} aria-describedby={describedBy(id, { label, hint, error })} {...props}>
        {children}
      </Select>
      <FieldFooter id={id} hint={hint} error={error} />
    </div>
  );
}

export function CheckboxField({ id, label, hint, ...props }: Omit<ComponentProps<'input'>, 'type'> & Omit<FieldText, 'error'> & { id: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="checkbox"
          className="size-4 accent-primary disabled:cursor-not-allowed"
          aria-describedby={hint === undefined ? undefined : `${id}-hint`}
          {...props}
        />
        <Label htmlFor={id}>{label}</Label>
      </div>
      {hint !== undefined && (
        <p id={`${id}-hint`} className="pl-6 text-sm text-text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * The message for a failed request. Staff never see raw API text (section 16). A screen can give a
 * more specific message for a code, such as what a CONFLICT means on that form.
 */
export function ErrorAlert({ error, overrides }: { error: unknown; overrides?: Partial<Record<ErrorMessageKey, string>> }) {
  const t = useTranslations('errors');
  const key = errorMessageKey(error);
  return (
    <div role="alert" className="flex gap-2 rounded-md bg-danger-soft p-3 text-sm text-danger">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{overrides?.[key] ?? t(key)}</span>
    </div>
  );
}

/** Save and cancel at the foot of a dialog form. Save is the one primary button. */
export function FormActions({ pending, onCancel }: { pending: boolean; onCancel: () => void }) {
  const t = useTranslations('common');
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button type="button" variant="outline" onClick={onCancel}>
        {t('cancel')}
      </Button>
      <Button type="submit" disabled={pending}>
        {pending ? t('saving') : t('save')}
      </Button>
    </div>
  );
}
