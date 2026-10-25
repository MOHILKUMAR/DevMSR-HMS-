import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Env } from '../common/config/env.js';
import { CsrfService } from './csrf.service.js';

const service = new CsrfService({ SESSION_SECRET: randomBytes(32).toString('base64') } as Env);

describe('CsrfService', () => {
  it('verifies a token for the session it was issued to', () => {
    expect(service.verify(service.issue('s1'), 's1')).toBe(true);
    expect(service.verify(service.issue(null), null)).toBe(true);
  });

  it('rejects a token from another session or from before sign-in', () => {
    expect(service.verify(service.issue('s1'), 's2')).toBe(false);
    expect(service.verify(service.issue(null), 's1')).toBe(false);
    expect(service.verify(service.issue('s1'), null)).toBe(false);
  });

  it('rejects malformed and tampered tokens', () => {
    const [nonce, signature] = service.issue('s1').split('.');
    expect(service.verify('', 's1')).toBe(false);
    expect(service.verify(nonce ?? '', 's1')).toBe(false);
    expect(service.verify(`${nonce ?? ''}.${signature ?? ''}.x`, 's1')).toBe(false);
    expect(service.verify(`other.${signature ?? ''}`, 's1')).toBe(false);
  });

  it('rejects a token signed with another secret', () => {
    const other = new CsrfService({ SESSION_SECRET: randomBytes(32).toString('base64') } as Env);
    expect(service.verify(other.issue('s1'), 's1')).toBe(false);
  });
});
