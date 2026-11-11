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
test('scanned QR opens only its employee attendance without sign-in, checks location and permits repeated pairs', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 12.971599, longitude: 77.594566, accuracy: 8 });
  const state = await workforceFixture(page, { role: 'employee', populated: true });
  ready(state);
  await installAttendanceCamera(page);
  await page.goto('/me/attendance#employee-qr=' + token);
  await expect(page).toHaveURL(new RegExp('/attendance#employee-qr=' + token));
  await expect(page.getByText('Personal employee QR verified.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: state.people[0].display_name })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toHaveCount(0);
  expect(state.calls.some((c) => c.name === 'current_workspace')).toBe(false);
  state.loseNextPunchResponse = true;
  await page.getByRole('checkbox').check();
  await capturePunch(page, 'Clock in');
  await page.getByRole('button', { name: 'Check attendance request' }).click();
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
test('a replaced QR cannot open attendance and rotation during selfie blocks the shutter', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 12.971599, longitude: 77.594566, accuracy: 8 });
  const state = await workforceFixture(page, { role: 'employee', populated: true });
  ready(state);
  await installAttendanceCamera(page);
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

test('QR attendance denies outside or inaccurate location before opening the camera', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({
    latitude: 12.971599 + 55 / 111195,
    longitude: 77.594566,
    accuracy: 8,
  });
  const state = await workforceFixture(page, { role: 'employee', populated: true });
  ready(state);
  await installAttendanceCamera(page);
  await page.goto('/attendance#employee-qr=' + token);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Clock in', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/outside your store/)).toBeVisible();
  expect(await page.evaluate(() => window.attendanceCameraRequests)).toBe(0);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await context.setGeolocation({ latitude: 12.971599, longitude: 77.594566, accuracy: 60 });
  await page.getByRole('button', { name: 'Clock in', exact: true }).click();
  await expect(page.getByRole('dialog').getByText(/accuracy is too low/)).toBeVisible();
  expect(await page.evaluate(() => window.attendanceCameraRequests)).toBe(0);
  expect(state.punches).toHaveLength(0);
});
