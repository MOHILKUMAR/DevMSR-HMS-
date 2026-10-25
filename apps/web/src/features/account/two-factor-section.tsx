'use client';

import { totpCodeBodySchema, type TotpCodeBody } from '@devmsr/validation';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ErrorAlert } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { RecoveryCodes, TotpCodeField, TotpSetupDetails } from '@/features/auth/two-factor-parts';
import { zodResolver } from '@/lib/forms';
import { useDisableTwoFactor, useEnableTwoFactor, useNewRecoveryCodes, useStartTwoFactorSetup, useTwoFactorStatus } from './queries';

/** A code from the app, then one action: switch on, new recovery codes, or switch off. */
function CodeForm({
  id,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  id: string;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (body: TotpCodeBody) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('account.twoFactor');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TotpCodeBody>({ resolver: zodResolver(totpCodeBodySchema), defaultValues: { code: '' } });
  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={(event) => {
        void handleSubmit(onSubmit)(event);
      }}
    >
      <TotpCodeField id={id} autoFocus error={errors.code !== undefined} {...register('code')} />
      {error !== null && <ErrorAlert error={error} />}
      <div className="flex gap-2">
        {/* Outline: the page's one primary button is Change password. */}
        <Button type="submit" variant="outline" disabled={pending}>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}

type Mode = 'idle' | 'setup' | 'newCodes' | 'turnOff';

export function TwoFactorSection() {
  const t = useTranslations('account.twoFactor');
  const tc = useTranslations('common');
  const status = useTwoFactorStatus();
  const [mode, setMode] = useState<Mode>('idle');
  const [codes, setCodes] = useState<string[] | null>(null);
  const start = useStartTwoFactorSetup();
  const enable = useEnableTwoFactor();
  const newCodes = useNewRecoveryCodes();
  const turnOff = useDisableTwoFactor();

  const close = () => {
    setMode('idle');
    setCodes(null);
    for (const mutation of [start, enable, newCodes, turnOff]) mutation.reset();
  };
  const showCodes = (response: { recoveryCodes: string[] }) => {
    setCodes(response.recoveryCodes);
  };

  return (
    <section aria-labelledby="two-factor-title" className="max-w-md space-y-3 rounded-md border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="two-factor-title" className="text-lg font-semibold">
          {t('title')}
        </h2>
        {status.data !== undefined &&
          (status.data.enabled ? (
            <StatusBadge tone="success" icon={ShieldCheck} label={t('on')} />
          ) : (
            <StatusBadge tone="neutral" icon={ShieldOff} label={t('off')} />
          ))}
      </div>
      {status.isPending && <p className="text-sm text-text-muted">{tc('loading')}</p>}
      {status.error !== null && <ErrorAlert error={status.error} />}

      {status.data !== undefined && codes === null && mode === 'idle' && (
        <>
          <p className="text-sm text-text-muted">{status.data.required ? t('required') : t('optional')}</p>
          {status.data.enabled && <p className="text-sm">{t('codesLeft', { count: status.data.recoveryCodesLeft })}</p>}
          <div className="flex flex-wrap gap-2">
            {!status.data.enabled && (
              <Button
                variant="outline"
                onClick={() => {
                  setMode('setup');
                  start.mutate();
                }}
              >
                {t('setUp')}
              </Button>
            )}
            {status.data.enabled && (
              <Button
                variant="outline"
                onClick={() => {
                  setMode('newCodes');
                }}
              >
                {t('newCodes')}
              </Button>
            )}
            {status.data.enabled && !status.data.required && (
              <Button
                variant="ghost"
                onClick={() => {
                  setMode('turnOff');
                }}
              >
                {t('turnOff')}
              </Button>
            )}
          </div>
        </>
      )}

      {codes !== null && <RecoveryCodes codes={codes} doneLabel={t('done')} onDone={close} />}

      {codes === null && mode === 'setup' && (
        <div className="space-y-3">
          {start.data !== undefined && <TotpSetupDetails setup={start.data} />}
          {start.error !== null && <ErrorAlert error={start.error} />}
          <CodeForm
            id="account-totp-enable"
            submitLabel={t('setUp')}
            pending={enable.isPending}
            error={enable.error}
            onSubmit={(body) => {
              enable.mutate(body, { onSuccess: showCodes });
            }}
            onCancel={close}
          />
        </div>
      )}

      {codes === null && mode === 'newCodes' && (
        <div className="space-y-3">
          <p className="text-sm text-text-muted">{t('newCodesDescription')}</p>
          <CodeForm
            id="account-totp-new-codes"
            submitLabel={t('newCodes')}
            pending={newCodes.isPending}
            error={newCodes.error}
            onSubmit={(body) => {
              newCodes.mutate(body, { onSuccess: showCodes });
            }}
            onCancel={close}
          />
        </div>
      )}

      {codes === null && mode === 'turnOff' && (
        <div className="space-y-3">
          <p className="text-sm text-text-muted">{t('turnOffDescription')}</p>
          <CodeForm
            id="account-totp-off"
            submitLabel={t('turnOff')}
            pending={turnOff.isPending}
            error={turnOff.error}
            onSubmit={(body) => {
              turnOff.mutate(body, { onSuccess: close });
            }}
            onCancel={close}
          />
        </div>
      )}
    </section>
  );
}
