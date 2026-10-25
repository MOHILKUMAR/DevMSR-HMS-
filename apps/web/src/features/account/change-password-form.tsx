'use client';

import { newPasswordSchema } from '@devmsr/validation';
import { CircleCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ErrorAlert, TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { zodResolver } from '@/lib/forms';
import { useChangePassword } from './queries';

const changePasswordFormSchema = z
  .object({ currentPassword: z.string().min(1).max(256), newPassword: newPasswordSchema, confirm: z.string() })
  .refine((values) => values.newPassword === values.confirm, { path: ['confirm'] });

type ChangePasswordValues = z.infer<typeof changePasswordFormSchema>;

const EMPTY: ChangePasswordValues = { currentPassword: '', newPassword: '', confirm: '' };

export function ChangePasswordForm() {
  const t = useTranslations('account.password');
  const tn = useTranslations('login.newPassword');
  const change = useChangePassword();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordValues>({ resolver: zodResolver(changePasswordFormSchema), defaultValues: EMPTY });

  return (
    <form
      noValidate
      aria-labelledby="change-password-title"
      className="max-w-md space-y-4 rounded-md border border-border bg-surface p-4"
      onSubmit={(event) => {
        void handleSubmit((values) => {
          change.mutate(
            { currentPassword: values.currentPassword, newPassword: values.newPassword },
            {
              onSuccess: () => {
                reset(EMPTY);
              },
            },
          );
        })(event);
      }}
    >
      <div>
        <h2 id="change-password-title" className="text-lg font-semibold">
          {t('title')}
        </h2>
        <p className="mt-1 text-sm text-text-muted">{t('description')}</p>
      </div>
      <TextField
        id="current-password"
        type="password"
        autoComplete="current-password"
        label={t('current')}
        error={errors.currentPassword && t('currentRequired')}
        {...register('currentPassword')}
      />
      <TextField
        id="account-new-password"
        type="password"
        autoComplete="new-password"
        label={tn('newPassword')}
        hint={tn('newPasswordHint')}
        error={errors.newPassword && tn('newPasswordInvalid')}
        {...register('newPassword')}
      />
      <TextField
        id="account-confirm-password"
        type="password"
        autoComplete="new-password"
        label={tn('confirm')}
        error={errors.confirm && tn('confirmMismatch')}
        {...register('confirm')}
      />
      {change.error !== null && <ErrorAlert error={change.error} />}
      {change.isSuccess && (
        <p role="status" className="flex items-center gap-2 text-sm text-success">
          <CircleCheck className="size-4" aria-hidden />
          {t('done')}
        </p>
      )}
      <Button type="submit" disabled={change.isPending}>
        {change.isPending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
