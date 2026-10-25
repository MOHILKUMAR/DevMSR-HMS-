import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

// Seeded demo users from prisma/seed-data.ts, all with SEED_USER_PASSWORD. The API allows 5 sign-ins
// per minute per username; CI raises that for the whole suite, and the API tests cover the limit.
const RECEPTIONIST = { username: 'reception', displayName: 'Demo Receptionist' };
const NURSE = { username: 'nurse', displayName: 'Demo Nurse' };

function seedPassword(): string {
  const password = process.env['SEED_USER_PASSWORD'];
  if (password === undefined || password === '') throw new Error('SEED_USER_PASSWORD is not set');
  return password;
}

test('signed-out visitors are sent to the login screen, keeping the section they asked for', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/patients');
  await expect(page).toHaveURL(/\/login\?next=%2Fpatients$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('a receptionist signs in from the keyboard, sees only their sections, and signs out', async ({ page }) => {
  await page.goto('/login?next=/patients');
  await expect(page.getByLabel('Username')).toBeFocused();
  await page.keyboard.type(RECEPTIONIST.username);
  await page.keyboard.press('Tab');
  await page.keyboard.type(seedPassword());
  await page.keyboard.press('Enter');

  // Lands on the section from ?next=, inside the signed-in shell.
  await expect(page).toHaveURL(/\/patients$/);
  await expect(page.getByRole('heading', { name: 'Patients' })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: 'Patients' })).toHaveAttribute('aria-current', 'page');
  for (const allowed of ['Home', 'OPD', 'IPD', 'Beds']) {
    await expect(nav.getByRole('link', { name: allowed })).toBeVisible();
  }
  for (const hidden of ['Billing', 'Payments', 'Reports', 'Settings']) {
    await expect(nav.getByRole('link', { name: hidden })).toHaveCount(0);
  }
  await expect(page.getByRole('combobox', { name: 'Search patients' })).toBeVisible();

  await nav.getByRole('link', { name: 'Home' }).click();
  await expect(page.getByRole('heading', { name: `Welcome, ${RECEPTIONIST.displayName}` })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  // The old session is gone: the shell is not reachable any more.
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});

test('signing in again works after the old session has expired', async ({ page, context }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill(NURSE.username);
  await page.getByLabel('Password').fill(seedPassword());
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: `Welcome, ${NURSE.displayName}` })).toBeVisible();

  // The server no longer knows this session (as after the 15 minute idle timeout), but the browser
  // still holds the CSRF cookie that was signed for it.
  await context.addCookies([{ name: 'hms_session', value: 'expired-session', domain: 'localhost', path: '/' }]);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('Username').fill(NURSE.username);
  await page.getByLabel('Password').fill(seedPassword());
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: `Welcome, ${NURSE.displayName}` })).toBeVisible();
});

test('a failed sign-in shows a plain message and does not reveal whether the user exists', async ({ page }) => {
  await page.goto('/login');
  // A username that does not exist, so no real account moves towards a lockout.
  await page.getByLabel('Username').fill(`nobody-${randomUUID().slice(0, 8)}`);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Scoped to <main>: Next.js adds its own empty role="alert" route announcer to every page.
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    'Wrong username or password. After 5 failed tries the account is locked for 15 minutes.',
  );
  await expect(page).toHaveURL(/\/login$/);
});

test('empty fields are caught on the screen before anything is sent', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Enter your username.')).toBeVisible();
  await expect(page.getByText('Enter your password.')).toBeVisible();
  await expect(page.getByLabel('Username')).toHaveAttribute('aria-invalid', 'true');
});
