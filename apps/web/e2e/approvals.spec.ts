import { randomInt, randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { freshTotpCode, seedTotpSecret } from './totp';

// Maker-checker end to end, with seeded staff in their own browser contexts: the billing clerk asks
// for a discount and finance approves it; after payment the clerk asks for a credit note and finance
// approves it; the cashier asks for a refund, the MD approves it and the cashier pays it out.
// Seeded rates: ECG Rs 300 and Dressing (small) Rs 200, both without tax.

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

async function chooseService(page: Page, name: string): Promise<void> {
  const select = page.getByLabel('Service', { exact: true });
  const value = await select.locator('option', { hasText: name }).first().getAttribute('value');
  await select.selectOption(value ?? '');
}

/** Approves or rejects the waiting request of this kind for this patient in the approvals inbox. */
async function decide(page: Page, kind: string, patient: string, action: 'Approve' | 'Reject', note = ''): Promise<void> {
  await page.goto('/approvals');
  await page.getByRole('button', { name: `${action} ${kind} for ${patient}` }).click();
  const dialog = page.getByRole('dialog');
  if (note !== '') await dialog.getByRole('textbox').fill(note);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
}

test('a discount, a credit note and a refund are each asked for by one person and approved by another', async ({ browser }) => {
  test.setTimeout(90_000);
  const reception = await signIn(browser, 'reception', 'Demo Receptionist');
  const name = `E2E Approvals ${randomUUID().slice(0, 6)}`;
  await reception.goto('/patients/new');
  await reception.getByLabel('Full name').fill(name);
  await reception.getByRole('radio', { name: 'Female', exact: true }).check();
  await reception.getByLabel('Age in years').fill('41');
  await reception.getByLabel('Mobile number').fill(`9${String(randomInt(100_000_000, 999_999_999))}`);
  await reception.getByRole('button', { name: 'Register patient' }).click();
  await expect(reception.getByRole('heading', { name })).toBeVisible();

  // The clerk prepares a Rs 800 draft and asks for 10% off.
  const billing = await signIn(browser, 'billing', 'Demo Billing Clerk');
  await billing.goto('/billing');
  await billing.getByLabel('Find a patient to bill').fill(name);
  await billing.getByRole('link', { name: new RegExp(name) }).click();
  await chooseService(billing, 'ECG');
  await billing.getByLabel('Quantity').fill('2');
  await billing.getByRole('button', { name: 'Add charge' }).click();
  await expect(billing.getByRole('cell', { name: 'ECG', exact: true })).toBeVisible();
  await chooseService(billing, 'Dressing (small)');
  await billing.getByRole('button', { name: 'Add charge' }).click();
  await expect(billing.getByText('2 charges chosen, ₹800.00')).toBeVisible();
  await billing.getByRole('button', { name: 'Prepare bill' }).click();
  await expect(billing.getByRole('heading', { name: 'Draft bill', exact: true })).toBeVisible();

  await billing.getByRole('button', { name: 'Request discount' }).click();
  const discount = billing.getByRole('dialog', { name: 'Request a discount' });
  await discount.getByRole('radio', { name: 'Whole bill, percentage' }).check();
  await discount.getByLabel('Discount percentage').fill('10');
  await discount.getByLabel('Reason').fill('Senior citizen');
  await discount.getByRole('button', { name: 'Save' }).click();
  await expect(billing.getByRole('status').filter({ hasText: 'A discount of ₹80.00 is waiting for approval' })).toBeVisible();
  await expect(billing.getByRole('button', { name: 'Issue bill' })).toBeDisabled();

  // The request shows on the bill, waiting, with no buttons for the clerk. Finance approves it.
  const waiting = billing.getByRole('row').filter({ hasText: 'Senior citizen' });
  await expect(waiting).toContainText('Waiting');
  await expect(waiting.getByRole('button')).toHaveCount(0);
  const finance = await signIn(browser, 'accounts', 'Demo Accountant', true);
  await decide(finance, 'Discount', name, 'Approve');

  await billing.reload();
  await billing.getByRole('link', { name: 'Open the new draft' }).click();
  await expect(billing.getByRole('heading', { name: 'Draft bill', exact: true })).toBeVisible();
  await billing.getByRole('button', { name: 'Issue bill' }).click();
  await billing.getByRole('dialog', { name: 'Issue this bill?' }).getByRole('button', { name: 'Issue bill' }).click();
  const heading = billing.getByRole('heading', { name: /^Bill DEMO\/INV\// });
  await expect(heading).toBeVisible();
  const billNumber = ((await heading.textContent()) ?? '').replace('Bill ', '');
  const billUrl = billing.url();
  await expect(billing.getByText('₹720.00').first()).toBeVisible();

  // The cashier takes the Rs 720 in cash.
  const cashier = await signIn(browser, 'cashier', 'Demo Cashier');
  await cashier.goto('/payments');
  const close = cashier.getByRole('heading', { name: 'Close your shift' });
  const open = cashier.getByRole('heading', { name: 'Open your shift' });
  await expect(close.or(open)).toBeVisible();
  if (await close.isVisible()) {
    const expected = (await cashier.getByText('Cash expected in the drawer').locator('xpath=following-sibling::dd[1]').textContent()) ?? '';
    await cashier.getByLabel('Counted cash').fill(expected.replace(/[^\d.]/g, ''));
    await cashier.getByRole('button', { name: 'Close shift' }).click();
  }
  await cashier.getByLabel('Opening cash').fill('2000');
  await cashier.getByRole('button', { name: 'Open shift' }).click();
  await cashier.getByLabel('Find a patient to take money from').fill(name);
  await cashier.getByRole('link', { name: new RegExp(name) }).click();
  await expect(cashier.getByRole('heading', { name: `Payments for ${name}` })).toBeVisible();
  const paymentsUrl = cashier.url();
  await cashier.getByRole('button', { name: `Take payment for bill ${billNumber}` }).click();
  await cashier.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(cashier.getByText('Received ₹720.00')).toBeVisible();

  // One ECG was not done: the clerk asks for a credit note of 1 unit (Rs 270 after the discount).
  await billing.goto(billUrl);
  await billing.getByRole('button', { name: 'Request credit note' }).click();
  const credit = billing.getByRole('dialog', { name: `Request a credit note for bill ${billNumber}` });
  await credit.getByLabel('How to credit ECG').selectOption('quantity');
  await credit.getByLabel('Units or rupees to credit on ECG').fill('1');
  await credit.getByLabel('Reason').fill('Second ECG not done');
  await credit.getByRole('button', { name: 'Save' }).click();
  await expect(billing.getByRole('row').filter({ hasText: 'Credit note' }).filter({ hasText: '₹270.00' })).toBeVisible();

  await decide(finance, 'Credit note', name, 'Approve');
  await finance.goto('/approvals');
  await finance.getByRole('button', { name: 'Approved', exact: true }).click();
  const creditLink = finance.getByRole('link', { name: /^DEMO\/CN\// }).first();
  await expect(creditLink).toBeVisible();

  // The cashier asks to refund the Rs 270 overpaid; finance cannot approve refunds, the MD can.
  await cashier.goto(paymentsUrl);
  await cashier.getByRole('button', { name: 'Request refund' }).click();
  const refund = cashier.getByRole('dialog', { name: 'Request a refund' });
  await expect(refund.getByLabel('Refund from')).toContainText(`Bill ${billNumber}, ₹270.00 overpaid`);
  await refund.getByLabel('Amount in rupees').fill('270');
  await refund.getByLabel('Reason').fill('Credit note for ECG not done');
  await refund.getByRole('button', { name: 'Save' }).click();
  await expect(refund).toBeHidden();

  await finance.goto('/approvals');
  await expect(finance.getByRole('row').filter({ hasText: name }).filter({ hasText: 'Refund' }).getByRole('button', { name: /Approve/ })).toHaveCount(0);
  const md = await signIn(browser, 'md', 'Demo MD');
  await decide(md, 'Refund', name, 'Approve');

  await cashier.goto(paymentsUrl);
  await cashier.getByRole('button', { name: 'Pay out' }).click();
  await cashier.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(cashier.getByRole('heading', { name: /^Refund DEMO\/RF\// })).toBeVisible();
  await expect(cashier.getByText('Refunded ₹270.00')).toBeVisible();

  // The drawer: Rs 2,000 opening, Rs 720 in, Rs 270 back out.
  await cashier.goto('/payments');
  await expect(cashier.getByText('Cash expected in the drawer').locator('xpath=following-sibling::dd[1]')).toHaveText('₹2,450.00');
  await cashier.getByLabel('Counted cash').fill('2450');
  await cashier.getByRole('button', { name: 'Close shift' }).click();
  await expect(open).toBeVisible();
});
