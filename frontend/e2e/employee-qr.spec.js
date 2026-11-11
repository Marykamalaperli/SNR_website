import { test, expect } from '@playwright/test';
import { workforceFixture, signInWorkforce } from './helpers/workforceFixture';
import { installAttendanceCamera, capturePunch } from './helpers/attendanceCamera';
const token = '90000000-0000-4000-8000-000000000001';
function ready(state) {
  const person = state.people[0];
  state.employeeQrs.set(person.id, { token, version: 1 });
  state.storeAreas.set(person.site_id, {
    latitude: 12.971599,
    longitude: 77.594566,
    radius_meters: 50,
    version: 1,
  });
  state.shifts.push({
    id: '50000000-0000-4000-8000-000000000001',
    site_id: person.site_id,
    name: 'Assigned shift',
    timezone: 'Asia/Kolkata',
    starts_at: '09:00',
    ends_at: '17:00',
  });
  state.assignments.push({
    id: '80000000-0000-4000-8000-000000000001',
    employee_id: person.id,
    shift_id: state.shifts[0].id,
    name: 'Assigned shift',
    timezone: 'Asia/Kolkata',
    starts_on: state.today,
    ends_on: null,
    cancelled: false,
    version: 1,
  });
}
test('HR downloads a real QR image and regenerates it with explicit confirmation', async ({
  page,
}) => {
  const state = await workforceFixture(page, { populated: true });
  await signInWorkforce(page);
  await page.goto('/hr/employees');
  await page
    .getByRole('button', { name: 'Attendance QR Directory Person 01', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Employee attendance QR' });
  await expect(dialog.getByRole('img')).toBeVisible();
  const download = page.waitForEvent('download');
  await dialog.getByRole('link', { name: 'Download QR' }).click();
  expect((await download).suggestedFilename()).toBe('employee-attendance-qr-v1.png');
  const original = state.employeeQrs.get(state.people[0].id).token;
  await dialog.getByRole('button', { name: 'Regenerate QR', exact: true }).click();
  expect(state.employeeQrs.get(state.people[0].id).token).toBe(original);
  await dialog.getByRole('button', { name: 'Confirm regenerate QR' }).click();
  await expect(dialog.getByRole('link', { name: 'Download QR' })).toHaveAttribute(
    'download',
    'employee-attendance-qr-v2.png',
  );
  expect(state.employeeQrs.get(state.people[0].id).token).not.toBe(original);
});
test('scanned link survives sign-in, checks location before selfie, and permits repeated attendance pairs', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 12.971599, longitude: 77.594566, accuracy: 8 });
  const state = await workforceFixture(page, { role: 'employee', populated: true });
  ready(state);
  await installAttendanceCamera(page);
  await page.goto('/me/attendance#employee-qr=' + token);
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email address').fill('workspace-test@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('#employee-qr=' + token));
  await expect(
    page.getByText('Personal employee QR verified for your signed-in account.'),
  ).toBeVisible();
  await page.getByRole('checkbox').check();
  await capturePunch(page, 'Clock in');
  await expect(page.getByRole('button', { name: 'Clock out', exact: true })).toBeVisible();
  expect(state.calls.find((c) => c.name === 'record_attendance').parameters.p_evidence.qr).toBe(
    token,
  );
  expect(
    state.calls.filter((c) => c.name === 'validate_employee_qr_location').length,
  ).toBeGreaterThanOrEqual(2);
  await page.getByRole('checkbox').check();
  await capturePunch(page, 'Clock out');
  await expect(page.getByRole('button', { name: 'Clock in', exact: true })).toBeVisible();
  await page.getByRole('checkbox').check();
  await capturePunch(page, 'Clock in');
  await expect(page.getByRole('button', { name: 'Clock out', exact: true })).toBeVisible();
  expect(state.punches.map((p) => p.event_type)).toEqual(['clock_in', 'clock_out', 'clock_in']);
});
test('a replaced or other employee QR cannot open capture and rotation during selfie blocks the shutter', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 12.971599, longitude: 77.594566, accuracy: 8 });
  const state = await workforceFixture(page, { role: 'employee', populated: true });
  ready(state);
  await installAttendanceCamera(page);
  // Exercise a slow membership check: the login helper must await the completed
  // workspace redirect before this test opens a different attendance URL.
  await page.route('**/rest/v1/rpc/current_workspace', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.fallback();
  });
  await signInWorkforce(page);
  await page.goto('/me/attendance#employee-qr=90000000-0000-4000-8000-000000000099');
  await expect(page.getByText(/This QR is invalid, replaced/)).toBeVisible();
  expect(await page.evaluate(() => window.attendanceCameraRequests)).toBe(0);
  await page.goto('/me/attendance#employee-qr=' + token);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Clock in', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Take photo', exact: true })).toBeEnabled();
  state.employeeQrs.set(state.people[0].id, {
    token: '90000000-0000-4000-8000-000000000002',
    version: 2,
  });
  await dialog.getByRole('button', { name: 'Take photo', exact: true }).click();
  await expect(dialog.getByText(/This QR is invalid, replaced/)).toBeVisible();
  expect(state.punches).toHaveLength(0);
  await expect.poll(() => page.evaluate(() => window.attendanceCameraTracks)).toBe(0);
});
