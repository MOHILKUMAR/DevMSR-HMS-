import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonymousBrowser, as } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('health and HTTP hardening', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('GET /api/v1/health is public and checks the database', async () => {
    const response = await request(t.http).get('/api/v1/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('sends the security headers and hides the framework', async () => {
    const response = await request(t.http).get('/api/v1/health');
    expect(response.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('gives every response a request ID and keeps a valid incoming one', async () => {
    const generated = await request(t.http).get('/api/v1/health');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    const incoming = '0b4b6f0e-5c1d-4f7a-9d3e-2a1b0c9d8e7f';
    const echoed = await request(t.http).get('/api/v1/health').set('X-Request-Id', incoming);
    expect(echoed.headers['x-request-id']).toBe(incoming);

    const junk = await request(t.http).get('/api/v1/health').set('X-Request-Id', 'not a uuid <script>');
    expect(junk.headers['x-request-id']).not.toBe('not a uuid <script>');
  });

  it('answers unknown routes with the error envelope', async () => {
    const response = await request(t.http).get('/api/v1/no-such-route');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'The page was not found.' } });
  });

  it('serves nothing outside /api/v1', async () => {
    await request(t.http).get('/health').expect(404);
    await request(t.http).get('/api/health').expect(404);
  });

  it('allows the web origin and no other', async () => {
    const allowed = await request(t.http).get('/api/v1/health').set('Origin', 'http://localhost:3000');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const other = await request(t.http).get('/api/v1/health').set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects malformed JSON with VALIDATION_FAILED and no internals', async () => {
    const browser = await anonymousBrowser(t.http);
    const response = await as(request(t.http).post('/api/v1/auth/login'), browser)
      .set('Content-Type', 'application/json')
      .send('{"username": "a", ');
    expect(response.status).toBe(400);
    expect((response.body as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED');
    expect(JSON.stringify(response.body)).not.toMatch(/SyntaxError|at JSON|node_modules/);
  });
});
