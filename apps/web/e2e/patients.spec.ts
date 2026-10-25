import { randomInt, randomUUID } from 'node:crypto';
import { verhoeffCheckDigit } from '@devmsr/validation';
import { expect, test, type Page } from '@playwright/test';

// Registration and search at the front desk, as the seeded receptionist. Every run registers new
// fake patients with unique names and numbers, so it can run again on the same database.

function seedPassword(): string {
  const password = process.env['SEED_USER_PASSWORD'];
  if (password === undefined || password === '') throw new Error('SEED_USER_PASSWORD is not set');
  return password;
}

const suffix = () => randomUUID().replace(/-/g, '').slice(0, 6);
const mobile = () => `9${String(randomInt(100_000_000, 999_999_999))}`;
function aadhaar(): string {
  const first11 = `${String(randomInt(2, 10))}${String(randomInt(1_000_000_000, 9_999_999_999))}`;
  return `${first11}${String(verhoeffCheckDigit(first11))}`;
}

async function signInAsReception(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill('reception');
  await page.getByLabel('Password').fill(seedPassword());
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, Demo Receptionist' })).toBeVisible();
}

/** Opens the registration form, fills the required fields (and Aadhaar if given) and saves. */
async function register(page: Page, patient: { name: string; phone: string; aadhaar?: string }): Promise<void> {
  await page.goto('/patients/new');
  await page.getByLabel('Full name').fill(patient.name);
  await page.getByRole('radio', { name: 'Female' }).check();
  await page.getByLabel('Age in years').fill('34');
  await page.getByLabel('Mobile number').fill(patient.phone);
  if (patient.aadhaar !== undefined) await page.getByLabel('Aadhaar number').fill(patient.aadhaar);
  await page.getByRole('button', { name: 'Register patient' }).click();
}

test('the receptionist registers a patient, finds them from the top bar, and edits their details', async ({ page }) => {
  await signInAsReception(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Patients' }).click();
  await page.getByRole('link', { name: 'Register patient' }).click();
  await expect(page).toHaveURL(/\/patients\/new$/);

  // The form refuses to save until the required fields are filled.
  await page.getByRole('button', { name: 'Register patient' }).click();
  await expect(page.getByText('Choose the sex.')).toBeVisible();
  await expect(page.getByText('Enter the age in years, or a date of birth that is not in the future. Not both.')).toBeVisible();
  await expect(page.getByText('Enter a 10-digit mobile number, such as 98765 43210.')).toBeVisible();

  const name = `E2E Patient ${suffix()}`;
  const phone = mobile();
  await register(page, { name, phone });
  await expect(page).toHaveURL(/\/patients\/[0-9a-f-]{36}\?registered=1$/);
  const notice = page.getByRole('status').filter({ hasText: 'Patient registered.' });
  await expect(notice).toBeVisible();
  const uhid = /UHID (\S+)\.$/.exec((await notice.textContent()) ?? '')?.[1] ?? '';
  expect(uhid).toMatch(/^DEMO-\d{4}-\d{6}$/);
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByText('34 y, F')).toBeVisible();
  await expect(page.getByText('estimated from age')).toBeVisible();
  const recordUrl = page.url().replace('?registered=1', '');

  // Found again from the top bar by UHID, by mobile and by name; the name never goes in a URL.
  await page.goto('/');
  const search = page.getByRole('combobox', { name: 'Search patients' });
  for (const query of [uhid, phone, name]) {
    await search.fill(query);
    await expect(page.getByRole('option').filter({ hasText: name })).toBeVisible();
  }
  await search.press('Enter');
  await expect(page).toHaveURL(recordUrl);
  expect(page.url()).not.toContain(phone);

  await page.getByRole('link', { name: 'Edit details' }).click();
  await page.getByLabel('City or town').fill('Pune');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(recordUrl);
  await expect(page.getByText('Pune')).toBeVisible();
  await expect(page.getByText(uhid)).toBeVisible();
});

test('a shared mobile is a warning staff can register past; the same Aadhaar is refused', async ({ page }) => {
  await signInAsReception(page);
  const phone = mobile();
  const number = aadhaar();
  const first = `E2E Mother ${suffix()}`;
  await register(page, { name: first, phone, aadhaar: number });
  await expect(page.getByRole('heading', { name: first })).toBeVisible();
  await expect(page.getByText(`XXXX XXXX ${number.slice(-4)}`)).toBeVisible();

  // A family member with the same mobile.
  const second = `E2E Daughter ${suffix()}`;
  await register(page, { name: second, phone });
  const warning = page.getByRole('alert').filter({ hasText: 'Is this one of these patients?' });
  await expect(warning).toContainText(first);
  await expect(warning).toContainText('Same mobile');
  await warning.getByRole('button', { name: 'Register as a new patient' }).click();
  await expect(page.getByRole('heading', { name: second })).toBeVisible();

  // Someone else with the first patient's Aadhaar.
  await register(page, { name: `E2E Other ${suffix()}`, phone: mobile(), aadhaar: number });
  const refusal = page.getByRole('alert').filter({ hasText: 'This patient is already registered' });
  await expect(refusal).toContainText(first);
  await expect(refusal.getByRole('button', { name: 'Register as a new patient' })).toHaveCount(0);
  await expect(page).toHaveURL(/\/patients\/new$/);
});
