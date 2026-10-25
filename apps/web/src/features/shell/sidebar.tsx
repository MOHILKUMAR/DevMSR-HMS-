'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { isActive, visibleNavItems } from './nav-items';

export function Sidebar({ permissions }: { permissions: readonly string[] }) {
  const t = useTranslations();
  const pathname = usePathname();
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-14 items-center border-b border-border px-4 text-base font-semibold text-primary">{t('app.name')}</div>
      <nav aria-label={t('shell.navigation')} className="flex-1 p-2">
        <ul className="space-y-1">
          {visibleNavItems(permissions).map((item) => {
            const active = isActive(item, pathname);
            const Icon = item.icon;
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium',
                    active ? 'bg-primary-soft text-primary' : 'text-text-muted hover:bg-neutral-soft hover:text-text',
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {t(`nav.${item.key}`)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
