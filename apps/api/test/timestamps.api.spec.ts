import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { createHospital, createUser, signIn, unique } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';

// Regression: the Prisma pg adapter sends dates as UTC clock time without an offset, and
// PostgreSQL reads them in the session time zone. The test database defaults to IST (see
// global-setup.ts), so these tests fail if any app connection is not pinned to UTC.
describe('timestamps are stored in UTC', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('runs on a database whose default time zone is IST, so the bug would show', async () => {
    const unpinned = new PrismaClient({ adapter: new PrismaPg({ connectionString: t.env.DATABASE_URL }) });
    try {
      const [row] = await unpinned.$queryRaw<{ tz: string }[]>`SELECT current_setting('TimeZone') AS tz`;
      expect(row?.tz).toBe('Asia/Kolkata');
    } finally {
      await unpinned.$disconnect();
    }
  });

  it('pins every app connection to UTC', async () => {
    const [row] = await t.prisma.$queryRaw<{ tz: string }[]>`SELECT current_setting('TimeZone') AS tz`;
    expect(row?.tz).toBe('UTC');
  });

  it('stores the exact instant the app wrote', async () => {
    const instant = new Date('2026-10-25T00:26:51.123Z');
    const event = await t.prisma.loginEvent.create({
      data: { username: unique('tz'), outcome: 'unknown_user', createdAt: instant },
      select: { id: true },
    });
    const [row] = await t.prisma.$queryRaw<{ stored_ms: number }[]>`
      SELECT (extract(epoch FROM created_at) * 1000)::float8 AS stored_ms FROM login_events WHERE id = ${event.id}::uuid`;
    expect(row?.stored_ms).toBe(instant.getTime());
  });

  it('agrees with the database clock for a session started now', async () => {
    const hospital = await createHospital(t.prisma);
    const browser = await signIn(t, await createUser(t.prisma, hospital, 'nurse'));
    const [row] = await t.prisma.$queryRaw<{ drift_seconds: number }[]>`
      SELECT abs(extract(epoch FROM (now() - created_at)))::float8 AS drift_seconds FROM sessions WHERE id = ${browser.sessionId}::uuid`;
    expect(row?.drift_seconds).toBeLessThan(5);
  });
});
