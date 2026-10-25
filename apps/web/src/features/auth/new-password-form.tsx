'use client';

import { useMutation } from '@tanstack/react-query';
import { newPasswordSchema, type LoginResponse } from '@devmsr/validation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ErrorAlert, TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { api, csrfHeader } from '@/lib/api/client';
import { errorMessageKey, unwrap } from '@/lib/api/errors';
import { zodResolver } from '@/lib/forms';

export const newPasswordFormSchema = z
  .object({ newPassword: newPasswordSchema, confirm: z.string() })
  .refine((values) => values.newPassword === values.confirm, { path: ['confirm'] });

type NewPasswordValues = z.infer<typeof newPasswordFormSchema>;

/**
 * The change_password step of sign-in: the admin chose the password, so the person picks their own
 * before any session starts. The challenge travels in an httpOnly cookie the browser sends itself.
 */
export function NewPasswordForm({ onSignedIn, onRestart }: { onSignedIn: (response: LoginResponse) => void; onRestart: () => void }) {
  const t = useTranslations('login.newPassword');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NewPasswordValues>({ resolver: zodResolver(newPasswordFormSchema), defaultValues: { newPassword: '', confirm: '' } });

  const save = useMutation({
    mutationFn: async (values: NewPasswordValues) =>
      unwrap(await api.POST('/api/v1/auth/login/password', { params: { header: csrfHeader() }, body: { newPassword: values.newPassword } })),
    onSuccess: onSignedIn,
  });
  const expired = save.error !== null && errorMessageKey(save.error) === 'LOGIN_CHALLENGE_INVALID';

  return (
    <form
      noValidate
      aria-labelledby="new-password-title"
      className="mt-6 space-y-4"
      onSubmit={(event) => {
        void handleSubmit((values) => {
          save.mutate(values);
        })(event);
      }}
    >
      <div>
        <h2 id="new-password-title" className="text-lg font-semibold">
          {t('title')}
        </h2>
        <p className="mt-1 text-sm text-text-muted">{t('description')}</p>
      </div>
      <TextField
        id="new-password"
        type="password"
        autoComplete="new-password"
        autoFocus
        label={t('newPassword')}
        hint={t('newPasswordHint')}
        error={errors.newPassword && t('newPasswordInvalid')}
        {...register('newPassword')}
      />
      <TextField
        id="confirm-password"
        type="password"
        autoComplete="new-password"
        label={t('confirm')}
        error={errors.confirm && t('confirmMismatch')}
        {...register('confirm')}
      />
      {save.error !== null && <ErrorAlert error={save.error} />}
      {expired ? (
        <Button type="button" className="w-full" onClick={onRestart}>
          {t('restart')}
        </Button>
      ) : (
        <Button type="submit" className="w-full" disabled={save.isPending}>
          {save.isPending ? t('submitting') : t('submit')}
        </Button>
      )}
    </form>
  );
}
