'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { SettingsSectionKey } from './sections';

export function SettingsTabs({ sections }: { sections: readonly { key: SettingsSectionKey; href: string }[] }) {
  const t = useTranslations('settings');
  const pathname = usePathname();
  return (
    <nav aria-label={t('sectionsLabel')} className="border-b border-border">
      <ul className="-mb-px flex flex-wrap gap-1">
        {sections.map((section) => {
          const active = pathname === section.href || pathname.startsWith(`${section.href}/`);
          return (
            <li key={section.key}>
              <Link
                href={section.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex h-10 items-center border-b-2 px-3 text-sm font-medium',
                  active ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text',
                )}
              >
                {t(`sections.${section.key}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
