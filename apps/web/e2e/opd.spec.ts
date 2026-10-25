import { randomInt, randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';

// A walk-in OPD visit end to end: the receptionist registers a patient and issues a token, the
// cashier takes the consultation fee (Rs 500, seeded for Dr Demo Doctor), and only then does the
// patient appear in the doctor's queue; the doctor writes notes, orders an ECG and completes.

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

test('an OPD token joins the doctor queue only once its fee is paid, then the doctor sees the patient', async ({ browser }) => {
  test.setTimeout(90_000);
  const reception = await signIn(browser, 'reception', 'Demo Receptionist');
  const name = `E2E OPD ${randomUUID().slice(0, 6)}`;
  await reception.goto('/patients/new');
  await reception.getByLabel('Full name').fill(name);
  await reception.getByRole('radio', { name: 'Male', exact: true }).check();
  await reception.getByLabel('Age in years').fill('29');
  await reception.getByLabel('Mobile number').fill(`9${String(randomInt(100_000_000, 999_999_999))}`);
  await reception.getByRole('button', { name: 'Register patient' }).click();
  await expect(reception.getByRole('heading', { name })).toBeVisible();

  // The token.
  await reception.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'OPD' }).click();
  await reception.getByLabel('Find the patient').fill(name);
  await reception.getByRole('button', { name: new RegExp(name) }).click();
  await reception.getByLabel('Doctor', { exact: true }).selectOption({ label: 'Dr Demo Doctor (General Medicine)' });
  await reception.getByRole('button', { name: 'Issue token' }).click();
  const issued = reception.getByRole('status').filter({ hasText: 'Pay ₹500.00 at the cash counter' });
  await expect(issued).toBeVisible();
  const token = /Token (\d+)/.exec((await issued.textContent()) ?? '')?.[1] ?? '';
  expect(token).not.toBe('');
  await expect(reception.getByRole('row').filter({ hasText: name })).toContainText('Fee due');

  // Not in the doctor's queue before payment.
  const doctor = await signIn(browser, 'doctor', 'Dr Demo Doctor');
  await doctor.goto('/opd');
  await expect(doctor.getByRole('heading', { name: 'My OPD queue' })).toBeVisible();
  await expect(doctor.getByRole('row').filter({ hasText: name })).toHaveCount(0);

  // The cashier takes the fee from the OPD list on the cash counter.
  const cashier = await signIn(browser, 'cashier', 'Demo Cashier');
  await cashier.goto('/payments');
  const close = cashier.getByRole('heading', { name: 'Close your shift' });
  const open = cashier.getByRole('heading', { name: 'Open your shift' });
  await expect(close.or(open)).toBeVisible();
  if (await open.isVisible()) {
    await cashier.getByLabel('Opening cash').fill('2000');
    await cashier.getByRole('button', { name: 'Open shift' }).click();
  }
  await cashier.getByRole('button', { name: `Collect the fee for token ${token}` }).click();
  await cashier.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(cashier.getByText('Received ₹500.00')).toBeVisible();
  await expect(cashier.getByText(/set against bill DEMO\/INV\//)).toBeVisible();

  // Now the doctor sees the patient, calls them in, writes notes, orders an ECG and completes.
  await doctor.reload();
  await doctor.getByRole('link', { name: `Open token ${token}, ${name}` }).click();
  await doctor.getByRole('button', { name: 'Call in' }).click();
  await doctor.getByLabel('Complaints').fill('Chest discomfort since morning');
  await doctor.getByLabel('Diagnosis').fill('Atypical chest pain');
  await doctor.getByLabel('Advice').fill('ECG today, review with report');
  await doctor.getByRole('button', { name: 'Save notes' }).click();
  await expect(doctor.getByText(/^Saved /)).toBeVisible();

  const service = doctor.getByLabel('Test or procedure');
  const ecg = await service.locator('option', { hasText: 'ECG' }).first().getAttribute('value');
  await service.selectOption(ecg ?? '');
  await doctor.getByRole('button', { name: 'Order' }).click();
  await expect(doctor.getByRole('cell', { name: 'ECG', exact: true })).toBeVisible();

  await doctor.getByRole('button', { name: 'Complete visit' }).click();
  await doctor.getByRole('dialog').getByRole('button', { name: 'Complete visit' }).click();
  await expect(doctor.getByText('Seen', { exact: true })).toBeVisible();
  await expect(doctor.getByLabel('Diagnosis')).toBeDisabled();

  // The ECG is waiting for the billing clerk.
  const billing = await signIn(browser, 'billing', 'Demo Billing Clerk');
  await billing.goto('/billing');
  await billing.getByLabel('Find a patient to bill').fill(name);
  await billing.getByRole('link', { name: new RegExp(name) }).click();
  await expect(billing.getByRole('cell', { name: 'ECG', exact: true })).toBeVisible();
});
