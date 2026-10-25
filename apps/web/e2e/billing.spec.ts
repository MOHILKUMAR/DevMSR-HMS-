import { randomInt, randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';

// A bill from charge to payment, with three seeded staff in their own browser contexts: the
// receptionist registers a new fake patient, the billing clerk charges and issues the bill, and the
// cashier takes a deposit, sets it against the bill, takes the rest by UPI and closes the shift.
// Seeded rates: ECG Rs 300 and Dressing (small) Rs 200, both without tax.

function seedPassword(): string {
  const password = process.env['SEED_USER_PASSWORD'];
  if (password === undefined || password === '') throw new Error('SEED_USER_PASSWORD is not set');
  return password;
}

async function signIn(browser: Browser, username: string, displayName: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(seedPassword());
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: `Welcome, ${displayName}` })).toBeVisible();
  return page;
}

/** Picks a service by its name; the option text also shows today's rate. */
async function chooseService(page: Page, name: string): Promise<void> {
  const select = page.getByLabel('Service', { exact: true });
  const value = await select.locator('option', { hasText: name }).first().getAttribute('value');
  await select.selectOption(value ?? '');
}

/** Closes a shift left open by an earlier run that stopped half way, counting exactly what is expected. */
async function closeLeftoverShift(page: Page): Promise<void> {
  const close = page.getByRole('heading', { name: 'Close your shift' });
  const open = page.getByRole('heading', { name: 'Open your shift' });
  await expect(close.or(open)).toBeVisible();
  if (!(await close.isVisible())) return;
  const expected = (await page.getByText('Cash expected in the drawer').locator('xpath=following-sibling::dd[1]').textContent()) ?? '';
  await page.getByLabel('Counted cash').fill(expected.replace(/[^\d.]/g, ''));
  await page.getByRole('button', { name: 'Close shift' }).click();
  await expect(open).toBeVisible();
}

test('a bill is charged, issued, paid from a deposit and by UPI, and the cash shift is closed', async ({ browser }) => {
  // The receptionist registers the patient.
  const reception = await signIn(browser, 'reception', 'Demo Receptionist');
  const name = `E2E Billing ${randomUUID().slice(0, 6)}`;
  await reception.goto('/patients/new');
  await reception.getByLabel('Full name').fill(name);
  await reception.getByRole('radio', { name: 'Male', exact: true }).check();
  await reception.getByLabel('Age in years').fill('52');
  await reception.getByLabel('Mobile number').fill(`9${String(randomInt(100_000_000, 999_999_999))}`);
  await reception.getByRole('button', { name: 'Register patient' }).click();
  await expect(reception.getByRole('heading', { name })).toBeVisible();

  // The billing clerk finds them, adds two charges and issues the bill.
  const billing = await signIn(browser, 'billing', 'Demo Billing Clerk');
  await billing.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Billing' }).click();
  await billing.getByLabel('Find a patient to bill').fill(name);
  await billing.getByRole('link', { name: new RegExp(name) }).click();
  await expect(billing.getByRole('heading', { name: `Billing for ${name}` })).toBeVisible();

  await chooseService(billing, 'ECG');
  await billing.getByLabel('Quantity').fill('2');
  await billing.getByRole('button', { name: 'Add charge' }).click();
  await expect(billing.getByRole('cell', { name: 'ECG', exact: true })).toBeVisible();
  await chooseService(billing, 'Dressing (small)');
  await billing.getByRole('button', { name: 'Add charge' }).click();
  await expect(billing.getByRole('cell', { name: 'Dressing (small)', exact: true })).toBeVisible();
  await expect(billing.getByText('2 charges chosen, ₹800.00')).toBeVisible();

  await billing.getByRole('button', { name: 'Prepare bill' }).click();
  await expect(billing.getByRole('heading', { name: 'Draft bill', exact: true })).toBeVisible();
  await billing.getByRole('button', { name: 'Issue bill' }).click();
  const confirm = billing.getByRole('dialog', { name: 'Issue this bill?' });
  await expect(confirm).toContainText('Total ₹800.00');
  await confirm.getByRole('button', { name: 'Issue bill' }).click();
  const heading = billing.getByRole('heading', { name: /^Bill DEMO\/INV\/\d{4}-\d{2}\/\d{6}$/ });
  await expect(heading).toBeVisible();
  const billNumber = ((await heading.textContent()) ?? '').replace('Bill ', '');
  await expect(billing.getByText('Due', { exact: true }).first()).toBeVisible();
  // The clerk cannot take money: that is the cashier's job.
  await expect(billing.getByRole('link', { name: /Take payment/ })).toHaveCount(0);
  const billUrl = billing.url();

  // The cashier opens a shift with Rs 2,000 in the drawer.
  const cashier = await signIn(browser, 'cashier', 'Demo Cashier');
  await cashier.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Payments' }).click();
  await closeLeftoverShift(cashier);
  await cashier.getByLabel('Opening cash').fill('2000');
  await cashier.getByRole('button', { name: 'Open shift' }).click();
  await expect(cashier.getByRole('heading', { name: /^Shift open since/ })).toBeVisible();

  await cashier.getByLabel('Find a patient to take money from').fill(name);
  await cashier.getByRole('link', { name: new RegExp(name) }).click();
  await expect(cashier.getByRole('heading', { name: `Payments for ${name}` })).toBeVisible();
  await expect(cashier.getByRole('link', { name: billNumber })).toBeVisible();
  const paymentsUrl = cashier.url();

  // A Rs 500 cash deposit, with its own receipt.
  await cashier.getByRole('button', { name: 'Take deposit' }).click();
  const deposit = cashier.getByRole('dialog', { name: 'Take a deposit' });
  await deposit.getByLabel('Amount in rupees').fill('500');
  await deposit.getByRole('button', { name: 'Save' }).click();
  await expect(cashier.getByRole('heading', { name: /^Receipt DEMO\/RCT\/\d{4}-\d{2}\/\d{6}$/ })).toBeVisible();
  await expect(cashier.getByText('Deposit receipt')).toBeVisible();
  await expect(cashier.getByText('Received ₹500.00')).toBeVisible();

  // The deposit is set against the bill, which leaves Rs 300 due.
  await cashier.getByRole('link', { name: 'Back to patient' }).click();
  await cashier.getByRole('button', { name: `Use deposit for bill ${billNumber}` }).click();
  const apply = cashier.getByRole('dialog', { name: `Use deposit for bill ${billNumber}` });
  await expect(apply.getByLabel('Amount to use in rupees')).toHaveValue('500.00');
  await apply.getByRole('button', { name: 'Save' }).click();
  await expect(apply).toBeHidden();
  await expect(cashier.getByRole('row').filter({ hasText: billNumber })).toContainText('₹300.00');

  // The rest by UPI: the form asks for the UTR before it saves.
  await cashier.getByRole('button', { name: `Take payment for bill ${billNumber}` }).click();
  const pay = cashier.getByRole('dialog', { name: `Take payment for bill ${billNumber}` });
  await expect(pay.getByLabel('Amount in rupees')).toHaveValue('300.00');
  await pay.getByRole('radio', { name: 'UPI' }).check();
  await pay.getByRole('button', { name: 'Save' }).click();
  await expect(pay.getByText('Enter 4 to 40 characters.')).toBeVisible();
  await pay.getByLabel('UPI transaction ID (UTR)').fill('412345678901');
  await pay.getByRole('button', { name: 'Save' }).click();
  await expect(cashier.getByText('Received ₹300.00')).toBeVisible();
  await expect(cashier.getByText(`₹300.00 set against bill ${billNumber}`)).toBeVisible();

  await cashier.goto(paymentsUrl);
  await expect(cashier.getByText('Nothing is due.')).toBeVisible();

  // The 80 mm receipt prints without opening the print dialog in the test.
  const receiptLink = cashier.getByRole('row').filter({ hasText: 'Bill payment' }).getByRole('link');
  const receiptId = ((await receiptLink.getAttribute('href')) ?? '').split('/').pop() ?? '';
  await cashier.goto(`/print/receipts/${receiptId}?size=thermal&auto=0`);
  await expect(cashier.getByText('Received ₹300.00')).toBeVisible();
  await expect(cashier.getByText('Sample Care Hospital (demo)')).toBeVisible();

  // Closing the shift: the drawer should hold Rs 2,500; a Rs 10 shortfall needs a reason.
  await cashier.goto('/payments');
  await expect(cashier.getByText('Cash expected in the drawer').locator('xpath=following-sibling::dd[1]')).toHaveText('₹2,500.00');
  await cashier.getByLabel('Counted cash').fill('2490');
  await expect(cashier.getByRole('status').filter({ hasText: 'Short by ₹10.00' })).toBeVisible();
  await cashier.getByRole('button', { name: 'Close shift' }).click();
  await expect(cashier.getByText('Enter a reason of 3 to 200 characters.')).toBeVisible();
  await cashier.getByLabel('Reason for the difference').fill('Change given short at night');
  await cashier.getByRole('button', { name: 'Close shift' }).click();
  await expect(cashier.getByRole('heading', { name: 'Open your shift' })).toBeVisible();

  // Back at billing, the bill shows as paid.
  await billing.goto(billUrl);
  await expect(billing.getByText('Paid', { exact: true }).first()).toBeVisible();
  await billing.goto(`/print/invoices/${billUrl.split('/').pop() ?? ''}?size=a4&auto=0`);
  await expect(billing.getByText(billNumber)).toBeVisible();
  await expect(billing.getByText('Round off')).toBeVisible();
});
