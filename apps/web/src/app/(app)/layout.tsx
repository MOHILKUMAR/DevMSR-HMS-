import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/features/shell/app-shell';
import { getCurrentUser } from '@/lib/api/server';

/** Every signed-in screen. The proxy only checks that a cookie exists; the API decides if it is valid. */
export default async function SignedInLayout({ children }: { children: ReactNode }) {
  const me = await getCurrentUser();
  if (me === null) redirect('/login');
  return <AppShell me={me}>{children}</AppShell>;
}
