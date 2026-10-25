import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, createNonce } from './content-security-policy';
import { proxy } from './proxy';

function page(path: string, cookie?: string): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost:3000'), cookie === undefined ? {} : { headers: { cookie } });
}

describe('content security policy', () => {
  it('allows scripts only with the nonce, never inline or eval in production', () => {
    const policy = contentSecurityPolicy('abc123', { apiOrigin: 'https://api.example.in', isDev: false });
    const scripts = policy.split('; ').find((directive) => directive.startsWith('script-src'));
    expect(scripts).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(policy).toContain("connect-src 'self' https://api.example.in");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
  });

  it('adds eval for React in development only', () => {
    expect(contentSecurityPolicy('n', { apiOrigin: 'http://localhost:4000', isDev: true })).toContain("'unsafe-eval'");
  });

  it('makes a different 128-bit nonce every time', () => {
    const nonces = new Set(Array.from({ length: 50 }, () => createNonce()));
    expect(nonces.size).toBe(50);
    expect(Buffer.from(createNonce(), 'base64')).toHaveLength(16);
  });
});

describe('proxy', () => {
  it('sends a signed-out visitor to the login page with the path only', () => {
    const response = proxy(page('/patients/123?name=secret'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/login?next=%2Fpatients%2F123');
  });

  it('gives each page its own nonce, on the response and on the request Next.js renders from', () => {
    const first = proxy(page('/patients', 'hms_session=x'));
    const second = proxy(page('/patients', 'hms_session=x'));
    const policy = first.headers.get('content-security-policy');
    expect(policy).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(policy).not.toBe(second.headers.get('content-security-policy'));
    // NextResponse.next passes rewritten request headers to the renderer through this header.
    expect(first.headers.get('x-middleware-request-content-security-policy')).toBe(policy);
  });

  it('protects the login page too, without redirecting it', () => {
    const response = proxy(page('/login'));
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('content-security-policy')).toContain("'strict-dynamic'");
  });
});
