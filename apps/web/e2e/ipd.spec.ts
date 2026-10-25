import { randomInt, randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';

// An admission end to end: finance sets the general ward's minimum advance, the receptionist admits
// a new patient into a free general bed (and sees the short-advance warning), the bed board shows them,
// the nurse transfers them to the ICU and frees the bed they left, and the billing clerk sees the
// interim bill.

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

test('a patient is admitted into a free bed, transferred to the ICU, and the old bed freed', async ({ browser }) => {
  test.setTimeout(90_000);

  // Finance sets the general ward's minimum advance to Rs 5,000, or Rs 6,000 when an earlier run left
  // it at 5,000 (Save stays off for an unchanged amount). Either is more than a new patient holds.
  const finance = await signIn(browser, 'accounts', 'Demo Accountant');
  await finance.goto('/settings/advances');
  const general = finance.getByLabel(/^Minimum advance in rupees for General/).first();
  await general.fill((await general.inputValue()) === '5000.00' ? '6000' : '5000');
  await finance.getByRole('row').filter({ has: general }).getByRole('button', { name: 'Save' }).click();
  await expect(finance.getByRole('row').filter({ has: general }).getByRole('button', { name: 'Save' })).toBeDisabled();

  const reception = await signIn(browser, 'reception', 'Demo Receptionist');
  const name = `E2E IPD ${randomUUID().slice(0, 6)}`;
  await reception.goto('/patients/new');
  await reception.getByLabel('Full name').fill(name);
  await reception.getByRole('radio', { name: 'Female', exact: true }).check();
  await reception.getByLabel('Age in years').fill('63');
  await reception.getByLabel('Mobile number').fill(`9${String(randomInt(100_000_000, 999_999_999))}`);
  await reception.getByRole('button', { name: 'Register patient' }).click();
  await expect(reception.getByRole('heading', { name })).toBeVisible();

  // The admission, into the first free general bed.
  await reception.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'IPD' }).click();
  await reception.getByLabel('Find the patient').fill(name);
  await reception.getByRole('button', { name: new RegExp(name) }).click();
  await reception.getByLabel('Admitting doctor').selectOption({ label: 'Dr Demo Doctor (General Medicine)' });
  const bed = reception.getByLabel('Bed', { exact: true });
  const generalBed = await bed.locator('optgroup[label^="General"] option').first().getAttribute('value');
  await bed.selectOption(generalBed ?? '');
  await reception.getByLabel('Reason for admission (optional)').fill('Pneumonia, for IV antibiotics');
  await reception.getByRole('button', { name: 'Admit patient' }).click();
  const done = reception.getByRole('status').filter({ hasText: /Admitted as DEMO\/IP\// });
  await expect(done).toBeVisible();
  await expect(done).toContainText('below the minimum advance');
  await reception.getByRole('link', { name: 'Open the admission' }).click();
  await expect(reception.getByRole('heading', { name: /^Admission DEMO\/IP\// })).toBeVisible();
  const admissionUrl = reception.url();

  // The nurse sees the patient on the bed board, transfers them to the ICU and frees the old bed.
  const nurse = await signIn(browser, 'nurse', 'Demo Nurse');
  await nurse.goto('/beds');
  await expect(nurse.getByRole('link', { name: new RegExp(name) })).toBeVisible();
  await nurse.goto(admissionUrl);
  await nurse.getByRole('button', { name: 'Transfer' }).click();
  const dialog = nurse.getByRole('dialog');
  const newBed = dialog.getByLabel('New bed');
  const icuBed = await newBed.locator('optgroup[label^="ICU"] option').first().getAttribute('value');
  await newBed.selectOption(icuBed ?? '');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(nurse.getByRole('row').filter({ hasText: '(transfer)' })).toBeVisible();

  await nurse.goto('/beds');
  const freedTile = nurse.getByRole('listitem').filter({ has: nurse.getByText('Cleaning', { exact: true }) }).first();
  const select = freedTile.getByRole('combobox');
  await expect(select).toBeVisible();
  await select.selectOption('free');
  await expect(nurse.getByRole('link', { name: new RegExp(name) })).toBeVisible();

  // The billing clerk sees the interim bill for the stay.
  const billing = await signIn(browser, 'billing', 'Demo Billing Clerk');
  await billing.goto(admissionUrl);
  await expect(billing.getByRole('heading', { name: 'Interim bill' })).toBeVisible();
  await expect(billing.getByText('This is not a bill. The final bill is issued at discharge.')).toBeVisible();
});
