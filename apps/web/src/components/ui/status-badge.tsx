import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const TONES = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  accent: 'bg-accent-soft text-accent',
  neutral: 'bg-neutral-soft text-text-muted',
} as const;

/** Status is never shown by colour alone (section 16): always an icon and a word as well. */
export function StatusBadge({ tone, icon: Icon, label }: { tone: keyof typeof TONES; icon: LucideIcon; label: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium', TONES[tone])}>
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}
