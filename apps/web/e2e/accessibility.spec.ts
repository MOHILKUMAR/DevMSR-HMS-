import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { freshTotpCode, seedTotpSecret } from './totp';

// WCAG 2.1 AA (CLAUDE.md section 16, go-live checklist stage 7): every screen that exists is checked
// with axe's WCAG 2.0 and 2.1 level A and AA rules, and the billing and payment counters are worked
// end to end from the keyboard alone. Seeded demo hospital only.

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

function seedPassword(): string {
  const password = process.env['SEED_USER_PASSWORD'];
  if (password === undefined || password === '') throw new Error('SEED_USER_PASSWORD is not set');
  return password;
}

/** `twoFactor` for the demo users whose role needs it: the seed gave them SEED_TOTP_SECRET. */
async function signIn(browser: Browser, username: string, displayName: string, twoFactor = false): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(seedPassword());
  await page.getByRole('button', { name: 'Sign in' }).click();
  if (twoFactor) {
    const step = page.getByRole('form', { name: 'Two-factor sign-in' });
    await step.getByLabel('Code from the app').fill(await freshTotpCode(seedTotpSecret()));
    await step.getByRole('button', { name: 'Sign in' }).click();
  }
  await expect(page.getByRole('heading', { name: `Welcome, ${displayName}` })).toBeVisible();
  return page;
}

/** Fails with each violation's rule, impact and first few elements, so the report says what to fix. */
async function expectNoViolations(page: Page, screen: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const found = results.violations.map(
    (v) => `${v.id} (${v.impact ?? 'unknown'}): ${v.help} at ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect(found, `accessibility violations on ${screen}`).toEqual([]);
}

/** Presses Tab until the element has focus, proving it can be reached from the keyboard. */
async function tabTo(page: Page, target: Locator, maxPresses = 60): Promise<void> {
  for (let i = 0; i < maxPresses; i += 1) {
    if (await target.evaluate((element) => element === document.activeElement).catch(() => false)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target, `not reachable with ${String(maxPresses)} presses of Tab`).toBeFocused();
}

test('the login screen meets WCAG 2.1 AA', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByLabel('Username')).toBeVisible();
  await expectNoViolations(page, '/login');
});

// Admin and finance roles sign in with two-factor (docs/decisions.md, two-factor sign-in).
const SCREENS: { username: string; displayName: string; paths: string[]; twoFactor?: boolean }[] = [
  { username: 'reception', displayName: 'Demo Receptionist', paths: ['/', '/patients', '/patients/new', '/opd', '/ipd', '/beds'] },
  { username: 'billing', displayName: 'Demo Billing Clerk', paths: ['/billing'] },
  { username: 'cashier', displayName: 'Demo Cashier', paths: ['/payments'] },
  { username: 'accounts', displayName: 'Demo Accountant', paths: ['/payments/shifts', '/reports'], twoFactor: true },
  { username: 'nurse', displayName: 'Demo Nurse', paths: ['/discharge'] },
  {
    username: 'admin',
    displayName: 'Demo Hospital Admin',
    paths: ['/settings', '/settings/hospital', '/settings/users', '/settings/departments', '/settings/doctors', '/settings/wards', '/settings/rates'],
    twoFactor: true,
  },
];

for (const { username, displayName, paths, twoFactor } of SCREENS) {
  test(`screens for ${username} meet WCAG 2.1 AA`, async ({ browser }) => {
    const page = await signIn(browser, username, displayName, twoFactor);
    for (const path of paths) {
      await page.goto(path);
      await expect(page.getByRole('heading').first()).toBeVisible();
      await expectNoViolations(page, path);
    }
  });
}

test('a seeded patient record and their billing screen meet WCAG 2.1 AA', async ({ browser }) => {
  const page = await signIn(browser, 'billing', 'Demo Billing Clerk');
  await page.goto('/billing');
  await page.getByLabel('Find a patient to bill').fill('DEMO-2026-000003');
  await page.getByRole('link', { name: /DEMO-2026-000003/ }).click();
  await expect(page.getByRole('heading', { name: /^Billing for / })).toBeVisible();
  await expectNoViolations(page, '/billing/patients/[id]');
});

test('the billing and payment counters work from the keyboard alone', async ({ browser }) => {
  const uhid = 'DEMO-2026-000004';

  // Billing clerk: sign in, find the patient, add a charge, prepare and issue the bill.
  const billing = await (await browser.newContext()).newPage();
  await billing.goto('/login');
  await tabTo(billing, billing.getByLabel('Username'));
  await billing.keyboard.type('billing');
  await tabTo(billing, billing.getByLabel('Password'));
  await billing.keyboard.type(seedPassword());
  await billing.keyboard.press('Enter');
  await expect(billing.getByRole('heading', { name: 'Welcome, Demo Billing Clerk' })).toBeVisible();

  await billing.goto('/billing');
  await tabTo(billing, billing.getByLabel('Find a patient to bill'));
  await billing.keyboard.type(uhid);
  const result = billing.getByRole('link', { name: new RegExp(uhid) });
  await expect(result).toBeVisible();
  await tabTo(billing, result);
  await billing.keyboard.press('Enter');
  await expect(billing.getByRole('heading', { name: /^Billing for / })).toBeVisible();

  const service = billing.getByLabel('Service', { exact: true });
  // The options load after the screen; typing into the select before then would pick nothing.
  await expect(service.locator('option', { hasText: 'ECG' }).first()).toBeAttached();
  await tabTo(billing, service);
  await billing.keyboard.type('ECG');
  await expect(service.locator('option:checked')).toContainText('ECG');
  await tabTo(billing, billing.getByLabel('Quantity'));
  await billing.keyboard.press('ControlOrMeta+a');
  await billing.keyboard.type('1');
  await tabTo(billing, billing.getByRole('button', { name: 'Add charge' }));
  await billing.keyboard.press('Enter');
  await expect(billing.getByRole('cell', { name: 'ECG', exact: true }).first()).toBeVisible();

  await tabTo(billing, billing.getByRole('button', { name: 'Prepare bill' }));
  await billing.keyboard.press('Enter');
  await expect(billing.getByRole('heading', { name: 'Draft bill', exact: true })).toBeVisible();
  await tabTo(billing, billing.getByRole('button', { name: 'Issue bill' }));
  await billing.keyboard.press('Enter');
  const confirm = billing.getByRole('dialog', { name: 'Issue this bill?' });
  await expect(confirm).toBeVisible();
  await tabTo(billing, confirm.getByRole('button', { name: 'Issue bill' }), 10);
  await billing.keyboard.press('Enter');
  const heading = billing.getByRole('heading', { name: /^Bill DEMO\/INV\/\d{4}-\d{2}\/\d{6}$/ });
  await expect(heading).toBeVisible();
  const billNumber = ((await heading.textContent()) ?? '').replace('Bill ', '');

  // Cashier: open a shift if needed, find the patient, take the payment in cash.
  const cashier = await signIn(browser, 'cashier', 'Demo Cashier');
  await cashier.goto('/payments');
  const openShift = cashier.getByRole('heading', { name: 'Open your shift' });
  const shiftOpen = cashier.getByRole('heading', { name: /^Shift open since/ });
  await expect(openShift.or(shiftOpen)).toBeVisible();
  if (await openShift.isVisible()) {
    await tabTo(cashier, cashier.getByLabel('Opening cash'));
    await cashier.keyboard.type('0');
    await tabTo(cashier, cashier.getByRole('button', { name: 'Open shift' }));
    await cashier.keyboard.press('Enter');
    await expect(shiftOpen).toBeVisible();
  }
  await tabTo(cashier, cashier.getByLabel('Find a patient to take money from'));
  await cashier.keyboard.type(uhid);
  const payee = cashier.getByRole('link', { name: new RegExp(uhid) });
  await expect(payee).toBeVisible();
  await tabTo(cashier, payee);
  await cashier.keyboard.press('Enter');
  await expect(cashier.getByRole('heading', { name: /^Payments for / })).toBeVisible();

  await tabTo(cashier, cashier.getByRole('button', { name: `Take payment for bill ${billNumber}` }));
  await cashier.keyboard.press('Enter');
  const pay = cashier.getByRole('dialog', { name: `Take payment for bill ${billNumber}` });
  await expect(pay).toBeVisible();
  await tabTo(cashier, pay.getByRole('button', { name: 'Save' }), 20);
  await cashier.keyboard.press('Enter');
  await expect(cashier.getByText(/^Received ₹/).first()).toBeVisible();
});
