import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../common/config/env.js';
import { deriveKey, hmacBase64Url, randomToken, safeEqual } from '../common/crypto/tokens.js';

/**
 * Signed double-submit CSRF tokens: `<nonce>.<HMAC(session, nonce)>`. The token sits in a readable
 * cookie and must come back in the X-CSRF-Token header. Signing it with the session ID means a token
 * planted from another subdomain, or taken from an older session, does not verify.
 */
@Injectable()
export class CsrfService {
  private readonly key: Buffer;

  constructor(@Inject(ENV) env: Env) {
    this.key = deriveKey(env.SESSION_SECRET, 'devmsr-hms/csrf/v1');
  }

  /** Pass null before sign-in. */
  issue(sessionId: string | null): string {
    const nonce = randomToken(18);
    return `${nonce}.${this.sign(nonce, sessionId)}`;
  }

  verify(token: string, sessionId: string | null): boolean {
    const [nonce, signature, extra] = token.split('.');
    if (nonce === undefined || nonce === '' || signature === undefined || extra !== undefined) {
      return false;
    }
    return safeEqual(signature, this.sign(nonce, sessionId));
  }

  private sign(nonce: string, sessionId: string | null): string {
    return hmacBase64Url(this.key, `${sessionId ?? 'anonymous'}.${nonce}`);
  }
}
