import { Injectable } from '@nestjs/common';
import { FieldEncryptionService } from '../common/crypto/field-encryption.service.js';
import type { Tx } from '../common/prisma/tx.js';
import { TwoFactorRepository, type TwoFactorState, type UserRef } from './two-factor.repository.js';
import { newRecoveryCode, newTotpSecret, normalizeRecoveryCode, RECOVERY_CODE_COUNT, totpSetup, verifyTotp, type TotpSetup } from './two-factor.js';

/** What the authenticator app shows as the account: hospital code and username. */
export function totpAccountLabel(user: { username: string; hospital: { code: string } | null }): string {
  return `${user.hospital?.code ?? 'DevMSR'}:${user.username}`;
}

/**
 * Two-factor building blocks shared by sign-in, My account and user management. Secrets are sealed
 * with FIELD_ENCRYPTION_KEY and recovery codes stored as keyed hashes, so a database copy alone
 * gives neither.
 */
@Injectable()
export class TwoFactorService {
  constructor(
    private readonly repository: TwoFactorRepository,
    private readonly fields: FieldEncryptionService,
  ) {}

  /**
   * The secret being set up, made now if there is none yet. An existing one is kept, so a code from
   * an app that already scanned it (before a timed-out sign-in, say) still works.
   */
  async pendingSecret(user: UserRef, state: TwoFactorState, tx?: Tx): Promise<string> {
    if (state.totpSecretEncrypted !== null) return state.totpSecretEncrypted;
    const sealed = this.fields.seal('totp_secret', newTotpSecret());
    await this.repository.setPendingSecret(user, sealed, tx);
    return sealed;
  }

  /** Replaces a pending secret with a new one, for "Set up again" in My account. */
  async freshPendingSecret(user: UserRef): Promise<string> {
    const sealed = this.fields.seal('totp_secret', newTotpSecret());
    await this.repository.setPendingSecret(user, sealed);
    return sealed;
  }

  setup(sealed: string, account: string): Promise<TotpSetup> {
    return totpSetup(this.fields.open('totp_secret', sealed), account);
  }

  /** The step of a correct, unused code for this secret, or null. */
  async check(state: TwoFactorState, code: string, now: Date): Promise<number | null> {
    if (state.totpSecretEncrypted === null) return null;
    return verifyTotp(this.fields.open('totp_secret', state.totpSecretEncrypted), code, state.totpLastTimeStep, now);
  }

  /** New recovery codes in place of any unused ones. The plain codes are returned once, never stored. */
  async issueRecoveryCodes(user: UserRef, now: Date, tx: Tx): Promise<string[]> {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => newRecoveryCode());
    await this.repository.replaceRecoveryCodes(user, codes.map((code) => this.hashRecoveryCode(code)), now, tx);
    return codes;
  }

  hashRecoveryCode(input: string): string {
    return this.fields.keyedHash('recovery_code', normalizeRecoveryCode(input));
  }
}
