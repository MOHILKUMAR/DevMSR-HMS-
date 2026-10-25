import type { ReactNode } from 'react';

/** Print pages: no app shell, black on white in either theme (section 16). */
export default function PrintLayout({ children }: { children: ReactNode }) {
  return <main className="min-h-screen bg-print-paper p-6 text-print-ink print:p-0">{children}</main>;
}
