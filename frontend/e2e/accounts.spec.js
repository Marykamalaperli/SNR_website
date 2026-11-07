import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { workforceFixture, signInWorkforce } from './helpers/workforceFixture';

test('HR updates organization and own account settings within the dashboard', async ({ page }) => {
  const state = await workforceFixture(page, { populated: true });
  await signInWorkforce(page);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Edit workspace' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Organization name').fill('Updated Workplace');
  await dialog.getByLabel('Default time zone').fill('UTC');
  await dialog.getByLabel('Your display name').fill('People Admin');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('main').getByText('People Admin', { exact: true })).toBeVisible();
  expect(state.organization.timezone).toBe('UTC');
  expect(state.sites[0].timezone).toBe('Asia/Kolkata');
  await page.getByRole('button', { name: 'Change my login details' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Your sign-in email').fill('new-admin@example.invalid');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(/Check your inbox to confirm/)).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test('HR updates staff login details in the dashboard and the same profile survives reload', async ({
  page,
}) => {
  const state = await workforceFixture(page, { populated: true });
  await signInWorkforce(page);
  await page.getByRole('link', { name: 'Employees', exact: true }).click();
  await page
    .getByRole('button', { name: 'Manage account Directory Person 01', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Sign-in email').fill('changed-login@example.invalid');
  await dialog.getByLabel('New password').fill('Updated-Synthetic-Password-17');
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations).toEqual([]);
  await page.screenshot({ path: '/tmp/snr-admin-account-editor.png', fullPage: true });
  await dialog.getByRole('button', { name: 'Save login details' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Account login details saved.')).toBeVisible();
  expect(state.accountCalls[0].path).toContain(state.people[0].id);
  expect(state.accountCalls[0].parameters).toMatchObject({
    version: 1,
    membership_version: 1,
    email: 'changed-login@example.invalid',
  });
  await page.reload();
  await page
    .getByRole('button', { name: 'Manage account Directory Person 01', exact: true })
    .click();
  await expect(page.getByRole('dialog').getByLabel('Sign-in email')).toHaveValue(
    'changed-login@example.invalid',
  );
});

test('an interrupted account creation is recovered from Pending account requests without another create', async ({
  page,
}) => {
  const state = await workforceFixture(page, { populated: true });
  await signInWorkforce(page);
  await page.getByRole('link', { name: 'Employees', exact: true }).click();
  await page.getByRole('button', { name: 'Add employee', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Account email').fill('pending-login@example.invalid');
  await dialog.getByLabel('Initial password').fill('Synthetic-Password-17');
  await dialog.getByLabel('Full name').fill('Pending Account Person');
  await dialog.getByLabel('Employee number').fill('PENDING-1');
  await dialog.getByLabel('Site', { exact: true }).selectOption({ label: 'Main office' });
  await dialog.getByLabel('Department', { exact: true }).selectOption({ label: 'Operations' });
  state.loseNextAccountResponse = true;
  await dialog.getByRole('button', { name: 'Create employee', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('interrupted');
  await expect(dialog.getByLabel('Account email')).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pending account requests' })).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Check account request pending-login@example.invalid',
      exact: true,
    })
    .click();
  await expect(page.getByText('Account request completed.', { exact: true })).toBeVisible();
  await page.getByLabel('Search people').fill('PENDING-1');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('Pending Account Person', { exact: true })).toBeVisible();
  expect(state.accountCalls.filter((call) => call.path === '/api/admin/staff')).toHaveLength(1);
  expect(
    state.people.filter((person) => person.email === 'pending-login@example.invalid'),
  ).toHaveLength(1);
});

test('mobile account creation supports existing accounts with no external-dashboard instructions', async ({
  page,
}) => {
  await workforceFixture(page, { populated: true });
  await signInWorkforce(page);
  await page.getByRole('link', { name: 'Employees', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Add employee', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Supabase Authentication/)).toHaveCount(0);
  await dialog.getByLabel('Account setup').selectOption('existing');
  await expect(dialog.getByLabel('New password')).not.toHaveAttribute('required');
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/snr-admin-create-account-mobile.png', fullPage: true });
});
