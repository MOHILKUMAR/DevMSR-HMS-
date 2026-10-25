'use client';

import { useMutation } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { api, csrfHeader } from '@/lib/api/client';

export function SignOutButton() {
  const t = useTranslations('shell');
  const router = useRouter();
  const signOut = useMutation({
    mutationFn: async () => {
      await api.POST('/api/v1/auth/logout', { params: { header: csrfHeader() } });
    },
    // Back to the login screen even if the session had already expired.
    onSettled: () => {
      router.replace('/login');
      router.refresh();
    },
  });

  return (
    <Button
      variant="ghost"
      onClick={() => {
        signOut.mutate();
      }}
      disabled={signOut.isPending}
    >
      <LogOut aria-hidden />
      {t('signOut')}
    </Button>
  );
}
