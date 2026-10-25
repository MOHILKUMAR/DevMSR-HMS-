'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { loginTotpSchema, totpCodeBodySchema, type LoginResponse, type LoginTotp, type TotpCodeBody } from '@devmsr/validation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ErrorAlert, TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { api, csrfHeader } from '@/lib/api/client';
import { errorMessageKey, unwrap } from '@/lib/api/errors';
import { zodResolver } from '@/lib/forms';
import { RecoveryCodes, TotpCodeField, TotpSetupDetails } from './two-factor-parts';

interface StepProps {
  onSignedIn: (response: LoginResponse) => void;
  onRestart: () => void;
}

/** A timed-out or finished challenge cannot go on: the only way forward is to sign in again. */
function SubmitOrRestart({ error, pending, label, pendingLabel, onRestart }: { error: unknown; pending: boolean; label: string; pendingLabel: string; onRestart: () => void }) {
  const t = useTranslations('login.newPassword');
  if (error !== null && errorMessageKey(error) === 'LOGIN_CHALLENGE_INVALID') {
    return (
      <Button type="button" className="w-full" onClick={onRestart}>
        {t('restart')}
      </Button>
    );
  }
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/** The totp_setup step: scan, type a code, save the recovery codes, then the session starts. */
export function TotpSetupStep({ onSignedIn, onRestart }: StepProps) {
  const t = useTranslations('twoFactor');
  const [signedIn, setSignedIn] = useState<LoginResponse | null>(null);
  const setup = useQuery({
    queryKey: ['login', 'totp-setup'],
    queryFn: async () => unwrap(await api.GET('/api/v1/auth/login/totp/setup')),
    // The secret must not change while the person is scanning it.
    staleTime: Infinity,
    retry: false,
  });
  const confirm = useMutation({
    mutationFn: async (body: TotpCodeBody) => unwrap(await api.POST('/api/v1/auth/login/totp/setup', { params: { header: csrfHeader() }, body })),
    onSuccess: setSignedIn,
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TotpCodeBody>({ resolver: zodResolver(totpCodeBodySchema), defaultValues: { code: '' } });

  if (signedIn?.status === 'signed_in' && signedIn.recoveryCodes !== undefined) {
    return (
      <div className="mt-6">
        <RecoveryCodes
          codes={signedIn.recoveryCodes}
          onDone={() => {
            onSignedIn(signedIn);
          }}
        />
      </div>
    );
  }

  const error = confirm.error ?? setup.error;
  return (
    <form
      noValidate
      aria-labelledby="totp-setup-title"
      className="mt-6 space-y-4"
      onSubmit={(event) => {
        void handleSubmit((values) => {
          confirm.mutate(values);
        })(event);
      }}
    >
      <div>
        <h2 id="totp-setup-title" className="text-lg font-semibold">
          {t('setupTitle')}
        </h2>
        <p className="mt-1 text-sm text-text-muted">{t('setupDescription')}</p>
      </div>
      {setup.data === undefined ? <p className="text-sm text-text-muted">{t('loading')}</p> : <TotpSetupDetails setup={setup.data} />}
      <TotpCodeField id="totp-setup-code" error={errors.code !== undefined} {...register('code')} />
      {error !== null && <ErrorAlert error={error} />}
      <SubmitOrRestart error={error} pending={confirm.isPending} label={t('confirm')} pendingLabel={t('confirming')} onRestart={onRestart} />
    </form>
  );
}

/** The totp_verify step: a code from the app, or a recovery code when the phone is not to hand. */
export function TotpVerifyStep({ onSignedIn, onRestart }: StepProps) {
  const t = useTranslations('twoFactor');
  const [useRecovery, setUseRecovery] = useState(false);
  const verify = useMutation({
    mutationFn: async (body: LoginTotp) => unwrap(await api.POST('/api/v1/auth/login/totp', { params: { header: csrfHeader() }, body })),
    onSuccess: onSignedIn,
  });
  const {
    register,
    handleSubmit,
    resetField,
    formState: { errors },
  } = useForm<LoginTotp>({ resolver: zodResolver(loginTotpSchema) });

  return (
    <form
      noValidate
      aria-labelledby="totp-verify-title"
      className="mt-6 space-y-4"
      onSubmit={(event) => {
        void handleSubmit((values) => {
          verify.mutate(values);
        })(event);
      }}
    >
      <div>
        <h2 id="totp-verify-title" className="text-lg font-semibold">
          {t('verifyTitle')}
        </h2>
        <p className="mt-1 text-sm text-text-muted">{t('verifyDescription')}</p>
      </div>
      {useRecovery ? (
        <TextField
          id="totp-recovery-code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus
          className="font-mono"
          label={t('recoveryCode')}
          hint={t('recoveryHint')}
          error={errors.recoveryCode === undefined ? undefined : t('recoveryInvalid')}
          {...register('recoveryCode')}
        />
      ) : (
        <TotpCodeField id="totp-verify-code" autoFocus error={errors.code !== undefined} {...register('code')} />
      )}
      <Button
        type="button"
        variant="ghost"
        className="px-0"
        onClick={() => {
          resetField(useRecovery ? 'recoveryCode' : 'code');
          setUseRecovery(!useRecovery);
        }}
      >
        {useRecovery ? t('useApp') : t('useRecovery')}
      </Button>
      {verify.error !== null && <ErrorAlert error={verify.error} />}
      <SubmitOrRestart error={verify.error} pending={verify.isPending} label={t('verify')} pendingLabel={t('verifying')} onRestart={onRestart} />
    </form>
  );
}
