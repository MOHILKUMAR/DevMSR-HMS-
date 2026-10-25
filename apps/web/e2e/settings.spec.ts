import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

// Admin setup screens against the seeded demo hospital. Each run adds records with unique codes,
// so it can run again on the same database. Sign-ins are spread over users because of the login
// rate limit (5 per minute per username).

function seedPassword(): string {
  const password = process.env['SEED_USER_PASSWORD'];
  if (password === undefined || password === '') throw new Error('SEED_USER_PASSWORD is not set');
  return password;
}

/** A short unique suffix in capitals, for codes such as E2E-1A2B3C. */
function suffix(): string {
  return randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
}

async function signIn(page: Page, username: string, password: string, displayName: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: `Welcome, ${displayName}` })).toBeVisible();
}

test('the hospital admin adds a staff user who can then sign in, and sets up a ward with a bed', async ({ page }) => {
  await signIn(page, 'admin', seedPassword(), 'Demo Hospital Admin');
  const nav = page.getByRole('navigation', { name: 'Main' });
  await nav.getByRole('link', { name: 'Settings' }).click();

  // Settings opens on the first section the admin may see.
  await expect(page).toHaveURL(/\/settings\/users$/);
  const tabs = page.getByRole('navigation', { name: 'Settings sections' });
  await expect(tabs.getByRole('link', { name: 'Staff users' })).toHaveAttribute('aria-current', 'page');

  // A new cashier, with a password the admin chose.
  const username = `e2e.${suffix().toLowerCase()}`;
  const password = randomUUID();
  await page.getByRole('button', { name: 'Add staff user' }).click();
  const addUser = page.getByRole('dialog', { name: 'Add staff user' });
  await addUser.getByRole('button', { name: 'Save' }).click();
  await expect(addUser.getByText('Choose 1 to 5 roles.')).toBeVisible();
  await addUser.getByLabel('Full name').fill('E2E Cashier');
  await addUser.getByLabel('Username').fill(username);
  await addUser.getByLabel('Temporary password').fill(password);
  await addUser.getByRole('checkbox', { name: 'Cashier', exact: true }).check();
  await addUser.getByRole('button', { name: 'Save' }).click();
  await expect(addUser).toBeHidden();

  await page.getByRole('searchbox', { name: 'Search staff by name or username' }).fill(username);
  const row = page.getByRole('row').filter({ hasText: username });
  await expect(row).toContainText('E2E Cashier');
  await expect(row).toContainText('Cashier');
  await expect(row).toContainText('Never');
  await expect(row).toContainText('Must change password');

  // Editing a doctor starts from their current department and login, loaded after the dialog opens.
  await tabs.getByRole('link', { name: 'Doctors' }).click();
  // The staff users list has an "Edit Dr Demo Doctor" button too: wait for the doctors list.
  await expect(page.getByRole('heading', { name: 'Doctors' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Dr Demo Doctor' }).click();
  const editDoctor = page.getByRole('dialog', { name: 'Edit Dr Demo Doctor' });
  await expect(editDoctor.getByLabel('Department').locator('option:checked')).toHaveText('General Medicine');
  await expect(editDoctor.getByLabel('Login').locator('option:checked')).toHaveText('Dr Demo Doctor (doctor)');
  await editDoctor.getByRole('button', { name: 'Cancel' }).click();
  await expect(editDoctor).toBeHidden();

  // A ward in a room category, with one bed that is then retired.
  const wardCode = `E2E-${suffix()}`;
  const wardName = `E2E ward ${wardCode}`;
  await tabs.getByRole('link', { name: 'Wards and beds' }).click();
  await page.getByRole('button', { name: 'Add ward' }).click();
  const addWard = page.getByRole('dialog', { name: 'Add ward' });
  await addWard.getByLabel('Code', { exact: true }).fill(wardCode.toLowerCase());
  await addWard.getByLabel('Name', { exact: true }).fill(wardName);
  await addWard.getByLabel('Room category').selectOption({ label: 'Private room' });
  await addWard.getByRole('button', { name: 'Save' }).click();
  await expect(addWard).toBeHidden();

  await page.getByRole('searchbox', { name: 'Search wards' }).fill(wardCode);
  const wardRow = page.getByRole('row').filter({ hasText: wardName });
  // Codes are stored in capitals whatever was typed.
  await expect(wardRow).toContainText(wardCode);
  await expect(wardRow).toContainText('Private room');
  await wardRow.getByRole('button', { name: `Beds in ${wardName}` }).click();

  const beds = page.getByRole('dialog', { name: `Beds in ${wardName}` });
  await expect(beds.getByText('This ward has no beds yet.')).toBeVisible();
  await beds.getByLabel('Bed code').fill('e2e-01');
  await beds.getByRole('button', { name: 'Add bed' }).click();
  const bedRow = beds.getByRole('row').filter({ hasText: 'E2E-01' });
  await expect(bedRow).toContainText('Free');
  await expect(bedRow).toContainText('Active');
  await expect(beds.getByLabel('Bed code')).toBeFocused();

  await beds.getByRole('button', { name: 'Retire bed E2E-01' }).click();
  await expect(bedRow).toContainText('Inactive');
  await page.keyboard.press('Escape');
  await expect(beds).toBeHidden();

  // The new cashier signs in with the admin's password, must choose their own first, and then sees
  // cashier sections only.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  const choose = page.getByRole('form', { name: 'Choose your own password' });
  await choose.getByLabel('New password', { exact: true }).fill(password);
  await choose.getByLabel('Type the new password again').fill(password);
  await choose.getByRole('button', { name: 'Save and continue' }).click();
  await expect(choose.getByText('Choose a password different from the one you have now.')).toBeVisible();
  const ownPassword = randomUUID();
  await choose.getByLabel('New password', { exact: true }).fill(ownPassword);
  await choose.getByLabel('Type the new password again').fill(ownPassword);
  await choose.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome, E2E Cashier' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Payments' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Settings' })).toHaveCount(0);
});

test('finance adds a service item and gives it a rate from today, kept in its history', async ({ page }) => {
  await signIn(page, 'accounts', seedPassword(), 'Demo Accountant');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' }).click();

  // Finance may view masters but not change them.
  await expect(page).toHaveURL(/\/settings\/departments$/);
  await expect(page.getByText('You can view these details.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add department' })).toHaveCount(0);

  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: 'Rates and fees' }).click();
  const code = `E2E-${suffix()}`;
  const name = `E2E dressing ${code}`;
  await page.getByRole('button', { name: 'Add service item' }).click();
  const addItem = page.getByRole('dialog', { name: 'Add service item' });
  await addItem.getByLabel('Type').selectOption({ label: 'Procedure' });
  await addItem.getByLabel('Code', { exact: true }).fill(code);
  await addItem.getByLabel('Name', { exact: true }).fill(name);
  await addItem.getByRole('button', { name: 'Save' }).click();
  await expect(addItem).toBeHidden();

  await page.getByRole('searchbox', { name: 'Search by code or name' }).fill(code);
  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row).toContainText('No rate');

  await row.getByRole('button', { name: `Change rate for ${name}` }).click();
  const rate = page.getByRole('dialog', { name: `Change rate: ${name}` });
  await expect(rate.getByText('This item has no rate yet.')).toBeVisible();
  await rate.getByLabel('Rate in rupees').fill('twelve');
  await rate.getByLabel('Tax rate (%)').fill('0');
  await rate.getByRole('button', { name: 'Save' }).click();
  await expect(rate.getByText('Enter an amount in rupees, such as 500 or 1250.50.')).toBeVisible();
  await rate.getByLabel('Rate in rupees').fill('1,250.50');
  await rate.getByRole('button', { name: 'Save' }).click();
  await expect(rate).toBeHidden();

  await expect(row).toContainText('₹1,250.50');
  await expect(row).toContainText('0%');

  await row.getByRole('button', { name: `Rate history for ${name}` }).click();
  const history = page.getByRole('dialog', { name: `Rate history: ${name}` });
  const first = history.getByRole('row').filter({ hasText: '₹1,250.50' });
  await expect(first).toContainText('Until changed');
  await expect(first).toContainText('In force');
  await page.keyboard.press('Escape');

  // A rate scheduled by mistake is cancelled before it starts; today's rate carries on.
  const nextWeek = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + 7 * 86_400_000));
  await row.getByRole('button', { name: `Change rate for ${name}` }).click();
  const schedule = page.getByRole('dialog', { name: `Change rate: ${name}` });
  await schedule.getByLabel('Rate in rupees').fill('14,000');
  await schedule.getByLabel('Tax rate (%)').fill('0');
  await schedule.getByLabel('Starts on').fill(nextWeek);
  await schedule.getByRole('button', { name: 'Save' }).click();
  await expect(schedule).toBeHidden();
  await expect(row).toContainText('₹1,250.50');

  await row.getByRole('button', { name: `Rate history for ${name}` }).click();
  const scheduled = history.getByRole('row').filter({ hasText: '₹14,000.00' });
  await expect(scheduled).toContainText('Scheduled');
  await scheduled.getByRole('button', { name: /^Cancel the rate from/ }).click();
  await history.getByRole('button', { name: 'Cancel rate', exact: true }).click();
  await expect(history.getByText('Enter a reason of 3 to 200 characters.')).toBeVisible();
  await history.getByLabel('Reason').fill('Entered the wrong amount');
  await history.getByRole('button', { name: 'Cancel rate', exact: true }).click();
  await expect(scheduled).toContainText('Cancelled');
  await expect(scheduled).toContainText('Never applied');
  await expect(scheduled).toContainText('Entered the wrong amount');
  await expect(first).toContainText('Until changed');
  await expect(history.getByRole('button', { name: /^Cancel the rate from/ })).toHaveCount(0);
});

test('staff without settings permissions cannot reach admin screens', async ({ page }) => {
  await signIn(page, 'lab', seedPassword(), 'Demo Lab Technician');
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' })).toHaveCount(0);

  // Masters are readable by all staff, but read-only.
  await page.goto('/settings/doctors');
  await expect(page.getByRole('heading', { name: 'Doctors' })).toBeVisible();
  await expect(page.getByText('You can view these details.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add doctor' })).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: 'Dr Demo Doctor' })).toBeVisible();

  // Staff users and rates are not theirs to see.
  for (const path of ['/settings/users', '/settings/rates']) {
    await page.goto(path);
    await expect(page.getByText('This page could not be found.')).toBeVisible();
  }
});
