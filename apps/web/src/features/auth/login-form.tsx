'use client';

import { useMutation } from '@tanstack/react-query';
import { loginRequestSchema, type LoginRequest } from '@devmsr/validation';
import { TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, csrfHeader, refreshCsrfToken } from '@/lib/api/client';
import { ApiRequestError, errorMessageKey } from '@/lib/api/errors';
import { zodResolver } from '@/lib/forms';

export function LoginForm({ next }: { next: string }) {
  const t = useTranslations('login');
  const tErrors = useTranslations('errors');
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { username: '', password: '' },
  });

  const signIn = useMutation({
    mutationFn: async (values: LoginRequest) => {
      // The API checks a CSRF token even on login. Always a fresh one: the browser may still hold a
      // token from a session that expired, which would fail every attempt.
      await refreshCsrfToken();
      const { error } = await api.POST('/api/v1/auth/login', { params: { header: csrfHeader() }, body: values });
      if (error !== undefined) throw new ApiRequestError(error);
    },
    onSuccess: () => {
      router.replace(next);
      router.refresh();
    },
  });

  return (
    <form
      noValidate
      className="mt-6 space-y-4"
      onSubmit={(event) => {
        void handleSubmit((values) => {
          signIn.mutate(values);
        })(event);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="username">{t('username')}</Label>
        <Input
          id="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          aria-invalid={errors.username === undefined ? undefined : true}
          aria-describedby={errors.username === undefined ? undefined : 'username-error'}
          {...register('username')}
        />
        {errors.username !== undefined && (
          <p id="username-error" className="text-sm text-danger">
            {t('usernameRequired')}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">{t('password')}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password === undefined ? undefined : true}
          aria-describedby={errors.password === undefined ? undefined : 'password-error'}
          {...register('password')}
        />
        {errors.password !== undefined && (
          <p id="password-error" className="text-sm text-danger">
            {t('passwordRequired')}
          </p>
        )}
      </div>

      {signIn.error !== null && (
        // Icon and words as well as colour, so the error does not rely on colour alone.
        <div role="alert" className="flex gap-2 rounded-md bg-danger-soft p-3 text-sm text-danger">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{tErrors(errorMessageKey(signIn.error))}</span>
        </div>
      )}

      <Button type="submit" className="w-full" disabled={signIn.isPending}>
        {signIn.isPending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
