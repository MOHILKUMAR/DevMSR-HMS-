import type { MeResponse } from '@devmsr/validation';
import { ShieldAlert } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { formatDateTime } from '@/lib/format';
import { EndBreakGlassButton } from './break-glass-panel';

/** Shown on every screen while break-glass access is open, so the super admin never forgets it. */
export async function BreakGlassBanner({ me }: { me: MeResponse }) {
  if (me.breakGlass === null) return null;
  const t = await getTranslations('breakGlass');
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 border-b border-warning bg-warning-soft px-4 py-2 text-sm text-warning">
      <ShieldAlert className="size-4 shrink-0" aria-hidden />
      <span className="flex-1">{t('active', { hospital: me.hospital?.name ?? '', time: formatDateTime(me.breakGlass.expiresAt) })}</span>
      <EndBreakGlassButton />
    </div>
  );
}
