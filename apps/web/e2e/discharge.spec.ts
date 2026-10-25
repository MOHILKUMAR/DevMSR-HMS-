import { randomInt, randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Page } from '@playwright/test';

// A discharge end to end, each step by the person whose job it is: reception admits, the treating
// doctor marks the patient fit and writes the summary, billing prepares and issues the final bill and
// asks the MD to clear the money still due, the MD approves and signs the summary off, and the nurse
// completes the discharge, sending the bed to cleaning. Seeded general ward rates: room Rs 1,000 and
// nursing Rs 300 a day.

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

test('a patient is marked fit, billed, cleared with dues by the MD, signed off and discharged', async ({ browser }) => {
  test.setTimeout(120_000);

  // Reception registers and admits a patient into the first free general bed.
  const reception = await signIn(browser, 'reception', 'Demo Receptionist');
  const name = `E2E Discharge ${randomUUID().slice(0, 6)}`;
  await reception.goto('/patients/new');
  await reception.getByLabel('Full name').fill(name);
  await reception.getByRole('radio', { name: 'Male', exact: true }).check();
  await reception.getByLabel('Age in years').fill('58');
  await reception.getByLabel('Mobile number').fill(`9${String(randomInt(100_000_000, 999_999_999))}`);
  await reception.getByRole('button', { name: 'Register patient' }).click();
  await expect(reception.getByRole('heading', { name })).toBeVisible();
  await reception.goto('/ipd');
  await reception.getByLabel('Find the patient').fill(name);
  await reception.getByRole('button', { name: new RegExp(name) }).click();
  await reception.getByLabel('Admitting doctor').selectOption({ label: 'Dr Demo Doctor (General Medicine)' });
  const bed = reception.getByLabel('Bed', { exact: true });
  await bed.selectOption((await bed.locator('optgroup[label^="General"] option').first().getAttribute('value')) ?? '');
  await reception.getByRole('button', { name: 'Admit patient' }).click();
  await reception.getByRole('link', { name: 'Open the admission' }).click();
  await expect(reception.getByRole('heading', { name: /^Admission DEMO\/IP\// })).toBeVisible();
  const admissionUrl = reception.url();

  // The treating doctor marks the patient fit and writes the summary.
  const doctor = await signIn(browser, 'doctor', 'Dr Demo Doctor');
  await doctor.goto(admissionUrl);
  await doctor.getByRole('button', { name: 'Mark fit for discharge' }).click();
  const fit = doctor.getByRole('dialog');
  await fit.getByLabel('Note for the ward and billing (optional)').fill('Afebrile for 48 hours, eating well');
  await fit.getByRole('button', { name: 'Save' }).click();
  await expect(doctor.getByRole('heading', { name: /^Discharge of DEMO\/IP\// })).toBeVisible();
  const dischargeUrl = doctor.url();
  await doctor.getByLabel('Diagnosis', { exact: true }).fill('Community acquired pneumonia');
  await doctor.getByLabel('Course in hospital and treatment given').fill('IV antibiotics for five days, then oral. Improved.');
  await doctor.getByLabel('Condition at discharge').fill('Stable, walking without help');
  await doctor.getByLabel('Medicines on discharge (optional)').fill('Amoxicillin 500 mg three times a day for 5 days');
  await doctor.getByRole('button', { name: 'Save summary' }).click();
  await expect(doctor.getByText(/Waiting for the MD to sign it off/)).toBeVisible();

  // Billing prepares and issues the final bill: one day of room and nursing for a same-day stay.
  const billing = await signIn(browser, 'billing', 'Demo Billing Clerk');
  await billing.goto(dischargeUrl);
  await billing.getByRole('button', { name: 'Prepare final bill' }).click();
  await expect(billing.getByRole('heading', { name: 'Draft bill', exact: true })).toBeVisible();
  await billing.getByRole('button', { name: 'Issue bill' }).click();
  await billing.getByRole('dialog', { name: 'Issue this bill?' }).getByRole('button', { name: 'Issue bill' }).click();
  await expect(billing.getByRole('heading', { name: /^Bill DEMO\/INV\// })).toBeVisible();

  // Nothing is paid yet, so billing asks the MD to clear the money still due.
  await billing.goto(dischargeUrl);
  await expect(billing.getByText('Everything else is settled, but ₹1,300.00 is still due.', { exact: false })).toBeVisible();
  await billing.getByLabel('Reason for clearing with money due').fill('Family pays on Monday, MD informed');
  await billing.getByRole('button', { name: 'Ask the MD to clear' }).click();
  await expect(billing.getByText('A clearance with money due is waiting for the MD.')).toBeVisible();

  // The MD approves it in the approvals inbox and signs the summary off.
  const md = await signIn(browser, 'md', 'Demo MD');
  await md.goto('/approvals');
  await md.getByRole('button', { name: `Approve Clearance with dues for ${name}` }).click();
  const approve = md.getByRole('dialog');
  await approve.getByRole('button', { name: 'Save' }).click();
  await expect(approve).toBeHidden();
  await md.goto(dischargeUrl);
  await expect(md.getByText(/with ₹1,300\.00 still due on the MD approval/)).toBeVisible();
  await md.getByRole('button', { name: 'Sign off summary' }).click();
  await expect(md.getByText(/^Signed off by Demo MD/)).toBeVisible();

  // The nurse completes the discharge; the bed goes to cleaning and the summary prints.
  const nurse = await signIn(browser, 'nurse', 'Demo Nurse');
  await nurse.goto(dischargeUrl);
  await nurse.getByRole('button', { name: 'Complete discharge' }).click();
  await expect(nurse.getByText(/^Discharged by Demo Nurse/)).toBeVisible();
  await nurse.goto(admissionUrl);
  await expect(nurse.getByText('Discharged', { exact: true })).toBeVisible();
  await nurse.goto(`/print/discharge-summaries/${dischargeUrl.split('/').pop() ?? ''}?auto=0`);
  await expect(nurse.getByText('Community acquired pneumonia')).toBeVisible();
  await expect(nurse.getByText(/^Signed off by Demo MD/)).toBeVisible();
});
