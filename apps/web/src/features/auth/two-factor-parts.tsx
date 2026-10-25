'use client';

import type { TotpSetupResponse } from '@devmsr/validation';
import { Printer } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ComponentProps } from 'react';
import { TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';

/** The 6 digit code field. Phones offer the code from a message or app through one-time-code. */
export function TotpCodeField({ id, error, ...props }: Omit<ComponentProps<typeof TextField>, 'label' | 'hint' | 'error'> & { error?: boolean }) {
  const t = useTranslations('twoFactor');
  return (
    <TextField
      id={id}
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={7}
      className="font-mono tracking-widest"
      label={t('code')}
      hint={t('codeHint')}
      error={error === true ? t('codeInvalid') : undefined}
      {...props}
    />
  );
}

/** What the authenticator app needs: the QR code, and the key for typing in by hand. */
export function TotpSetupDetails({ setup }: { setup: TotpSetupResponse }) {
  const t = useTranslations('twoFactor');
  const groupedKey = setup.secret.match(/.{1,4}/g)?.join(' ') ?? setup.secret;
  return (
    <div className="space-y-3">
      <p className="text-sm">{t('setupScan')}</p>
      {/* An SVG data URL from the API, allowed by the img-src policy. next/image would only add work for an inline image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={setup.qrCode} alt={t('qrAlt')} width={192} height={192} className="rounded-md bg-white p-2" />
      <p className="text-sm text-text-muted">{t('setupKey')}</p>
      <p className="font-mono text-sm break-all select-all">{groupedKey}</p>
    </div>
  );
}

/**
 * Recovery codes, shown once. The person confirms they saved them before going on, because a lost
 * phone without them means asking an admin to reset two-factor.
 */
export function RecoveryCodes({ codes, onDone, doneLabel }: { codes: readonly string[]; onDone: () => void; doneLabel?: string }) {
  const t = useTranslations('twoFactor');
  const [saved, setSaved] = useState(false);
  return (
    <section aria-labelledby="recovery-codes-title" className="space-y-3">
      <h2 id="recovery-codes-title" className="text-lg font-semibold">
        {t('codesTitle')}
      </h2>
      <p className="text-sm text-text-muted">{t('codesDescription')}</p>
      <ol className="grid grid-cols-2 gap-2 rounded-md border border-border p-3 font-mono text-sm">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            window.print();
          }}
        >
          <Printer aria-hidden />
          {t('codesPrint')}
        </Button>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={saved}
            onChange={(event) => {
              setSaved(event.target.checked);
            }}
          />
          {t('codesSaved')}
        </label>
      </div>
      <Button type="button" className="w-full" disabled={!saved} onClick={onDone}>
        {doneLabel ?? t('codesContinue')}
      </Button>
    </section>
  );
}
