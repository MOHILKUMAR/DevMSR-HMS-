import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

// The performance promise in CLAUDE.md section 1: first load under 1 MB of JavaScript and first paint
// under 1.5 s on a 4 Mbps line. JavaScript is counted as transferred (compressed) bytes on a cold
// cache, which is what crosses a weak hospital line (docs/decisions.md). Only meaningful against the
// production build, so it runs in CI, where the standalone server is started, and is skipped against
// `pnpm dev`.

const JS_BUDGET_BYTES = 1_000_000;
const FIRST_PAINT_BUDGET_MS = 1_500;
// 4 Mbps down, 1 Mbps up, 40 ms round trip.
const FOUR_MBPS = { offline: false, latency: 40, downloadThroughput: 500_000, uploadThroughput: 125_000 };

test.skip(process.env['CI'] === undefined, 'needs the production build, as CI runs it');

function seedPassword(): string {
  const password = process.env['SEED_USER_PASSWORD'];
  if (password === undefined || password === '') throw new Error('SEED_USER_PASSWORD is not set');
  return password;
}

type SessionState = Awaited<ReturnType<BrowserContext['storageState']>>;
let session: SessionState | undefined;

/**
 * A context with a signed-in session and an empty cache. Signs in once for the whole file, as the
 * MD (who can open every screen measured here), because logins are limited to 5 a minute per user
 * and the other specs sign in as the counter staff.
 */
async function signedInContext(browser: Browser): Promise<BrowserContext> {
  if (session === undefined) {
    const login = await browser.newContext();
    const page = await login.newPage();
    await page.goto('/login');
    await page.getByLabel('Username').fill('md');
    await page.getByLabel('Password').fill(seedPassword());
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome, Demo MD' })).toBeVisible();
    session = await login.storageState();
    await login.close();
  }
  return browser.newContext({ storageState: session });
}

/** Opens a screen on a cold cache and returns the compressed JavaScript bytes it downloaded. */
async function javascriptBytes(page: Page, path: string): Promise<number> {
  const scripts: Promise<number>[] = [];
  page.on('requestfinished', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.sizes().then((s) => s.responseBodySize));
  });
  await page.goto(path, { waitUntil: 'networkidle' });
  return (await Promise.all(scripts)).reduce((sum, bytes) => sum + bytes, 0);
}

async function firstContentfulPaint(page: Page, path: string): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', FOUR_MBPS);
  await page.goto(path, { waitUntil: 'load' });
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const existing = performance.getEntriesByName('first-contentful-paint')[0];
        if (existing !== undefined) {
          resolve(existing.startTime);
          return;
        }
        new PerformanceObserver((list) => {
          const entry = list.getEntriesByName('first-contentful-paint')[0];
          if (entry !== undefined) resolve(entry.startTime);
        }).observe({ type: 'paint', buffered: true });
      }),
  );
}

test('the login screen stays within the JavaScript and first paint budgets', async ({ browser }) => {
  const context = await browser.newContext();
  const bytes = await javascriptBytes(await context.newPage(), '/login');
  const paint = await firstContentfulPaint(await context.newPage(), '/login');
  test.info().annotations.push({ type: 'budget', description: `/login: ${String(bytes)} bytes of JavaScript, first paint ${paint.toFixed(0)} ms` });
  expect(bytes, '/login JavaScript (compressed bytes)').toBeLessThan(JS_BUDGET_BYTES);
  expect(paint, '/login first contentful paint on 4 Mbps (ms)').toBeLessThan(FIRST_PAINT_BUDGET_MS);
  await context.close();
});

for (const path of ['/', '/billing', '/payments/shifts']) {
  test(`${path} as the first screen stays within the budgets`, async ({ browser }) => {
    const context = await signedInContext(browser);
    const bytes = await javascriptBytes(await context.newPage(), path);
    const paint = await firstContentfulPaint(await context.newPage(), path);
    test.info().annotations.push({ type: 'budget', description: `${path}: ${String(bytes)} bytes of JavaScript, first paint ${paint.toFixed(0)} ms` });
    expect(bytes, `${path} JavaScript (compressed bytes)`).toBeLessThan(JS_BUDGET_BYTES);
    expect(paint, `${path} first contentful paint on 4 Mbps (ms)`).toBeLessThan(FIRST_PAINT_BUDGET_MS);
    await context.close();
  });
}
