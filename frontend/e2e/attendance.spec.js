import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { workforceFixture, signInWorkforce } from './helpers/workforceFixture';

function seedShift(state, assigned = false) {
  state.shifts.push({
    id: '50000000-0000-4000-8000-000000000001',
    name: 'Day shift',
    site_id: state.sites[0].id,
    starts_at: '09:00:00',
    ends_at: '17:00:00',
    timezone: 'Asia/Kolkata',
    version: 1,
  });
  if (assigned)
    state.assignments.push({
      id: '80000000-0000-4000-8000-000000000001',
      employee_id: state.people[0].id,
      shift_id: state.shifts[0].id,
      name: 'Day shift',
      timezone: 'Asia/Kolkata',
      starts_on: state.today,
      ends_on: null,
      cancelled: false,
      version: 1,
    });
}

test('HR assigns and cancels an unused shift in the dashboard and stale overlaps remain visible', async ({
  page,
}) => {
  const state = await workforceFixture(page, { populated: true });
  seedShift(state);
  await signInWorkforce(page);
  await page.getByRole('link', { name: 'Employees', exact: true }).click();
  await page
    .getByRole('button', { name: 'Manage shifts Directory Person 01', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Assign shift', exact: true }).click();
  await dialog
    .getByLabel('Shift', { exact: true })
    .selectOption({ label: 'Day shift · 09:00–17:00 · Asia/Kolkata' });
  await dialog.getByRole('button', { name: 'Save assignment' }).click();
  await expect(dialog.getByText('Shift assignment saved.', { exact: true })).toBeVisible();
  expect(state.assignments).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Assign shift', exact: true }).click();
  await dialog.getByLabel('Shift', { exact: true }).selectOption(state.shifts[0].id);
  await dialog.getByRole('button', { name: 'Save assignment' }).click();
  await expect(dialog.getByRole('alert')).toContainText('overlap');
  await dialog.getByRole('button', { name: 'Cancel edit' }).click();
  await dialog.getByRole('button', { name: 'Cancel assignment Day shift', exact: true }).click();
  await expect(dialog.getByText('Assignment cancelled. Its record is retained.')).toBeVisible();
  expect(state.assignments[0].cancelled).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test('employee clocks in/out, keeps history on reload and recovers a lost response without another punch', async ({
  page,
}) => {
  const state = await workforceFixture(page, { populated: true, role: 'employee' });
  seedShift(state, true);
  await signInWorkforce(page);
  await expect(page.getByRole('button', { name: 'Clock in', exact: true })).toBeEnabled();
  state.loseNextPunchResponse = true;
  await page.getByRole('button', { name: 'Clock in', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Check attendance request', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Check attendance request', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Clock out', exact: true })).toBeVisible();
  expect(state.punches).toHaveLength(1);
  const attempts = state.calls.filter((call) => call.name === 'record_attendance');
  expect(attempts[0].parameters).toEqual(attempts[1].parameters);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Clock out', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clock out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Clock in', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '8 h 0 min', exact: true })).toBeVisible();
  expect(state.punches).toHaveLength(2);
  await page.getByRole('link', { name: 'My Schedule', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Day shift', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'My Attendance', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/snr-attendance-employee-mobile.png', fullPage: true });
});

test('an employee without a shift cannot punch and attendance installation errors are actionable', async ({
  page,
}) => {
  await workforceFixture(page, { populated: true, role: 'employee' });
  await signInWorkforce(page);
  await expect(page.getByRole('button', { name: 'Clock in', exact: true })).toBeDisabled();
  await expect(page.getByText('Ask HR to assign your shift before clocking in.')).toBeVisible();
});

for (const role of ['hr', 'supervisor'])
  test(`${role} reviews and filters attendance without clocking for staff`, async ({ page }) => {
    const state = await workforceFixture(page, { populated: true, role });
    seedShift(state, true);
    state.sessions.push({
      id: '90000000-0000-4000-8000-000000000001',
      employee_id: state.people[0].id,
      display_name: state.people[0].display_name,
      employee_number: state.people[0].employee_number,
      department_id: state.people[0].department_id,
      department_name: state.people[0].department_name,
      site_id: state.people[0].site_id,
      site_name: state.people[0].site_name,
      shift_name: 'Day shift',
      timezone: 'Asia/Kolkata',
      attendance_date: state.today,
      clock_in: `${state.today}T04:00:00Z`,
      clock_out: null,
      duration_seconds: null,
      status: 'open',
    });
    await signInWorkforce(page);
    await page
      .getByRole('link', { name: role === 'hr' ? 'Attendance' : 'Team Attendance', exact: true })
      .click();
    await expect(
      page.getByRole('cell', { name: 'In progress', exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clock in', exact: true })).toHaveCount(0);
    await page.getByLabel('Find a person').fill('No person');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.getByText('No attendance matches these dates')).toBeVisible();
    await page.getByLabel('Find a person').fill('SNR-001');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(
      page.getByRole('cell', { name: 'In progress', exact: true }).first(),
    ).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({ path: `/tmp/snr-attendance-${role}-desktop.png`, fullPage: true });
  });
