import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { workforceFixture, signInWorkforce } from './helpers/workforceFixture';

test('HR configures a workplace, adds an employee, edits access, and reloads persisted records', async ({
  page,
}) => {
  const state = await workforceFixture(page);
  await signInWorkforce(page);
  await expect(page.getByText('Employee profiles', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Sites & Shifts', exact: true }).click();
  await page.getByRole('button', { name: 'Add site', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Site name').fill('Main office');
  await dialog.getByLabel('Store latitude').fill('12.971599');
  await dialog.getByLabel('Store longitude').fill('77.594566');
  await dialog.getByRole('button', { name: 'Add site', exact: true }).click();
  await expect(page.getByText('Site saved.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add department', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Department name').fill('Operations');
  await dialog.getByRole('button', { name: 'Add department', exact: true }).click();
  await expect(page.getByText('Department saved.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add shift', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Shift name').fill('Night shift');
  await dialog.getByLabel('Site', { exact: true }).selectOption({ label: 'Main office' });
  await dialog.getByLabel('Start time').fill('22:00');
  await dialog.getByLabel('End time').fill('06:00');
  await dialog.getByRole('button', { name: 'Add shift', exact: true }).click();
  await expect(page.getByText('Next day', { exact: true })).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: '/tmp/snr-workforce-setup.png', fullPage: true });
  await page.getByRole('link', { name: 'Employees', exact: true }).click();
  await page.getByRole('button', { name: 'Add employee', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Account email').fill('new-person@example.invalid');
  await dialog.getByLabel('Initial password').fill('Synthetic-Password-17');
  await dialog.getByLabel('Full name').fill('New Team Member');
  await dialog.getByLabel('Employee number').fill('SNR-001');
  await dialog.getByLabel('Site', { exact: true }).selectOption({ label: 'Main office' });
  await dialog.getByLabel('Department', { exact: true }).selectOption({ label: 'Operations' });
  await dialog.getByRole('button', { name: 'Create employee', exact: true }).click();
  await expect(page.getByText('New Team Member', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Edit employee New Team Member' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Account access').selectOption('false');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('New Team Member', { exact: true })).toHaveCount(0);
  await page.getByLabel('Access', { exact: true }).selectOption('inactive');
  await expect(page.getByRole('cell', { name: 'Inactive', exact: true })).toBeVisible();
  const writes = state.calls.filter((call) => call.name.startsWith('hr_save_'));
  expect(writes).toHaveLength(4);
  expect(state.accountCalls).toHaveLength(1);
  expect(state.accountCalls[0].parameters.profile.role).toBe('employee');
  for (const write of writes) expect(write.parameters).not.toHaveProperty('organization_id');
  expect(writes.at(-1).parameters).toMatchObject({
    p_version: 1,
    p_membership_version: 1,
    p_active: false,
  });
});

test('HR searches, filters and pages records with accessible desktop and mobile layouts', async ({
  page,
}) => {
  await workforceFixture(page, { populated: true });
  await signInWorkforce(page);
  await expect(page.getByText('Employee profiles', { exact: true })).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: '/tmp/snr-workforce-dashboard.png', fullPage: true });
  await page.getByRole('link', { name: 'Employees', exact: true }).click();
  await expect(page.getByText('Directory Person 01', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('Directory Person 23', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled();
  await page.getByLabel('Search people').fill('SNR-023');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByText('1 person', { exact: true })).toBeVisible();
  await page.getByLabel('Site', { exact: true }).selectOption({ label: 'Branch' });
  await expect(page.getByRole('heading', { name: 'No people match these filters' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.getByText('23 people', { exact: true })).toBeVisible();
  for (const width of [1440, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(violations).toEqual([]);
    await page.screenshot({ path: `/tmp/snr-workforce-directory-${width}.png`, fullPage: true });
  }
});

for (const width of [1440, 390]) {
  test(`HR can replace an existing employee name and reopen the saved profile at ${width}px`, async ({
    page,
  }) => {
    const state = await workforceFixture(page, { populated: true });
    state.people[0].display_name = 'demo';
    await signInWorkforce(page);
    await page.getByRole('link', { name: 'Employees', exact: true }).click();
      await page.setViewportSize({ width, height: 1000 });
    await page.getByRole('button', { name: 'Edit employee demo', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const name = dialog.getByLabel('Full name');
    await expect(name).toBeEditable();
    await expect(name).toHaveValue('demo');
    await expect(dialog.getByLabel('Account email')).not.toBeEditable();
    await name.fill('Mary Kamal');
    await expect(name).toHaveValue('Mary Kamal');
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Employee changes saved.', { exact: true })).toBeVisible();
    expect(
      state.calls.find((call) => call.name === 'hr_save_employee').parameters.p_display_name,
    ).toBe('Mary Kamal');
    expect(state.people[0].display_name).toBe('Mary Kamal');
    await page.reload();
    await page.getByRole('button', { name: 'Edit employee Mary Kamal', exact: true }).click();
    await expect(dialog.getByLabel('Full name')).toHaveValue('Mary Kamal');
    await expect(dialog.getByLabel('Full name')).toBeEditable();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page
      .getByRole('button', { name: 'Edit employee Directory Person 02', exact: true })
      .click();
    await expect(dialog.getByLabel('Full name')).toHaveValue('Directory Person 02');
  });
}

test('a rejected save keeps entered fields and exposes no privileged role choices', async ({
  page,
}) => {
  const state = await workforceFixture(page, { populated: true });
  await signInWorkforce(page);
  await page.getByRole('link', { name: 'Employees', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Add employee', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Account email').fill('unconfirmed@example.invalid');
  await dialog.getByLabel('Initial password').fill('Synthetic-Password-17');
  await dialog.getByLabel('Full name').fill('Pending Person');
  await dialog.getByLabel('Employee number').fill('SNR-099');
  await dialog.getByLabel('Site', { exact: true }).selectOption({ label: 'Main office' });
  await dialog.getByLabel('Department', { exact: true }).selectOption({ label: 'Operations' });
  await expect(dialog.getByLabel('Workspace role').locator('option')).toHaveText([
    'Employee',
    'Supervisor',
  ]);
  state.nextError = { code: 'password_rejected' };
  await dialog.getByRole('button', { name: 'Create employee', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('stronger password');
  await expect(dialog.getByLabel('Full name')).toHaveValue('Pending Person');
  expect(state.people).toHaveLength(23);
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add employee', exact: true })).toBeFocused();
});

for (const role of ['employee', 'supervisor']) {
  test(`${role} can read their scoped profiles without HR mutation controls`, async ({ page }) => {
    await workforceFixture(page, { role, populated: true });
    await signInWorkforce(page);
    await page
      .getByRole('link', { name: role === 'employee' ? 'Profile' : 'Team Members', exact: true })
      .click();
    await expect(page.getByText('Directory Person 01', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Add employee|Edit employee/ })).toHaveCount(0);
    if (role === 'employee')
      await expect(page.getByText('Directory Person 02', { exact: true })).toHaveCount(0);
  });
}

test('an unapplied migration shows an actionable error instead of fabricated records', async ({
  page,
}) => {
  await workforceFixture(page, { missingMigration: true });
  await signInWorkforce(page);
  await expect(page.getByRole('alert')).toContainText('apply the workforce migration');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.getByText('Employee profiles', { exact: true })).toHaveCount(0);
});
