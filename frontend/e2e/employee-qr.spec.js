import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { workforceFixture, signInWorkforce } from './helpers/workforceFixture';
import { personalGuardFixture, verifyGuard, captureTwoPhotos } from './helpers/personalQrFixture';
import { installAttendanceCamera, capturePunch } from './helpers/attendanceCamera';
function ready(state) {
  const person = state.people[0];
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
test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 12.971599, longitude: 77.594566, accuracy: 8 });
});
test('missing security attendance setup shows an activation message and never opens a camera', async ({
  page,
}) => {
  await workforceFixture(page, { role: 'employee', populated: true });
  await installAttendanceCamera(page);
  await page.route('**/api/attendance/security/workspace', (route) =>
    route.fulfill({ status: 503, json: { error: { code: 'attendance_setup_required' } } }),
  );
  await signInWorkforce(page);
  await expect(page.getByRole('heading', { name: 'Attendance is unavailable' })).toBeVisible();
  await expect(page.getByText(/Security attendance setup is incomplete/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clock in', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Enroll attendance passkey' })).toHaveCount(0);
  expect(await page.evaluate(() => window.attendanceCameraRequests)).toBe(0);
});
test('Security sidebar searches individual IDs, opens a private name/designation QR window and regenerates lost QRs', async ({
  page,
}) => {
  const state = await workforceFixture(page, { populated: true });
  await signInWorkforce(page);
  await page.getByRole('link', { name: 'Security · QR search', exact: true }).click();
  await expect(page).toHaveURL(/\/hr\/security$/);
  await expect(page.getByRole('table')).toHaveCount(0);
  await page
    .getByLabel('Employee attendance ID', { exact: true })
    .fill(state.people[0].attendance_id);
  await page.getByRole('button', { name: 'Find employee QR', exact: true }).click();
  await expect(page.getByRole('heading', { name: state.people[0].display_name })).toBeVisible();
  await expect(page.getByText('Security officer', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Attendance QR for ' + state.people[0].display_name }),
  ).toHaveAttribute('src', /^data:image\/png;base64,/);
  const original = await page
    .getByRole('link', { name: 'Open employee attendance', exact: true })
    .getAttribute('href');
  await page.getByRole('button', { name: 'Regenerate lost QR' }).click();
  await expect(
    page.getByRole('link', { name: 'Open employee attendance', exact: true }),
  ).toHaveAttribute('href', original);
  await page.getByRole('button', { name: 'Confirm regenerate QR' }).click();
  await expect(
    page.getByRole('link', { name: 'Open employee attendance', exact: true }),
  ).not.toHaveAttribute('href', original);
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download QR', exact: true }).click();
  expect((await download).suggestedFilename()).toBe(
    state.people[0].attendance_id + '-attendance-qr.png',
  );
  const popup = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Open display window', exact: true }).click();
  const display = await popup;
  await expect(display).toHaveURL(/\/login\?card=1#employee-card=/);
  await workforceFixture(display, { populated: true });
  await display.reload();
  await display.getByLabel('Email address').fill('workspace-test@example.invalid');
  await display.getByLabel('Password', { exact: true }).fill('fixture-password');
  await display.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(
    display.getByRole('img', { name: 'Attendance QR for ' + state.people[0].display_name }),
  ).toBeVisible();
  await display.close();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/snr-personal-qr-search-mobile.png', fullPage: true });
});
test('an individual scan keeps its target through credentials and requires a distinct guard, both photos and fresh location for successive pairs', async ({
  page,
}) => {
  const state = await workforceFixture(page, { role: 'employee', populated: true });
  ready(state);
  await personalGuardFixture(page, state);
  await installAttendanceCamera(page);
  const token = state.employeeQrs.get(state.people[0].id).token;
  await page.goto('/attendance#employee-qr=' + token);
  await expect(page).toHaveURL(/\/login\?attendance=1#employee-qr=/);
  await page.getByLabel('Email address').fill('workspace-test@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/\/attendance\/employee#employee-qr=/);
  await expect(page.getByRole('heading', { name: 'Ask the guard to verify you' })).toBeVisible();
  expect(await page.evaluate(() => window.attendanceCameraRequests)).toBe(0);
  await verifyGuard(page);
  state.loseNextPunchResponse = true;
  await captureTwoPhotos(page, 'Clock in');
  await page.getByRole('button', { name: 'Check attendance request' }).click();
  await expect(page.getByRole('heading', { name: 'Ask the guard to verify you' })).toBeVisible();
  await verifyGuard(page);
  await captureTwoPhotos(page, 'Clock out');
  await expect(page.getByRole('heading', { name: 'Ask the guard to verify you' })).toBeVisible();
  await verifyGuard(page);
  await captureTwoPhotos(page, 'Clock in');
  await expect(page.getByRole('heading', { name: 'Ask the guard to verify you' })).toBeVisible();
  expect(state.punches.map((p) => p.event_type)).toEqual(['clock_in', 'clock_out', 'clock_in']);
  for (const call of state.calls.filter((c) => c.name === 'record_attendance')) {
    expect(call.parameters.p_employee_id).toBe(state.people[0].id);
    expect(call.parameters.p_evidence.guard_photo.jpeg_base64).toBeTruthy();
    expect(call.parameters.p_evidence.guard_photo.jpeg_base64).not.toBe(
      call.parameters.p_evidence.photo.jpeg_base64,
    );
  }
  expect(state.guardRequests).toHaveLength(3);
  for (const call of state.guardRequests)
    expect(call.headers.authorization).not.toBe(call.headers['x-employee-authorization']);
  await expect.poll(() => state.guardLogouts).toBe(3);
  expect(state.guardReleases).toHaveLength(3);
  expect(await page.evaluate(() => window.attendanceCameraTracks)).toBe(0);
});
test('another or replaced employee QR never opens capture, and rotation during capture blocks the shutter', async ({
  page,
}) => {
  const state = await workforceFixture(page, { role: 'employee', populated: true });
  ready(state);
  await personalGuardFixture(page, state);
  await installAttendanceCamera(page);
  await signInWorkforce(page);
  await page.goto('/attendance/employee#employee-qr=90000000-0000-4000-8000-000000000099');
  await expect(page.getByText(/This QR is invalid, replaced/)).toBeVisible();
  expect(await page.evaluate(() => window.attendanceCameraRequests)).toBe(0);
  await page.goto(
    '/attendance/employee#employee-qr=' + state.employeeQrs.get(state.people[0].id).token,
  );
  await verifyGuard(page);
  await page
    .getByRole('checkbox', {
      name: 'I agree to share my photo and location for this attendance event.',
    })
    .check();
  await page.getByRole('button', { name: 'Clock in', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Take photo', exact: true }),
  ).toBeEnabled();
  state.employeeQrs.set(state.people[0].id, {
    token: '91000000-0000-4000-8000-000000000001',
    version: 2,
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Take photo', exact: true }).click();
  await expect(page.getByRole('dialog').getByText(/This QR is invalid, replaced/)).toBeVisible();
  expect(state.punches).toHaveLength(0);
  expect(await page.evaluate(() => window.attendanceCameraTracks)).toBe(0);
});
test('new enrollment stays blocked until HR approves it in person', async ({ page }) => {
  const state = await workforceFixture(page, {
    role: 'employee',
    populated: true,
    seedCredential: false,
  });
  ready(state);
  await installAttendanceCamera(page);
  await signInWorkforce(page);
  await page.getByRole('button', { name: 'Enroll attendance passkey' }).click();
  await expect(page.getByRole('heading', { name: 'Ask HR to approve your passkey' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clock in', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.attendanceCameraRequests)).toBe(0);
  state.securityApproved = true;
  state.securityPending = false;
  await page.getByRole('button', { name: 'Check HR approval' }).click();
  await expect(page.getByRole('button', { name: 'Clock in', exact: true })).toBeVisible();
});
test('HR approves passkeys explicitly and selects three or four checks for security staff', async ({
  page,
}) => {
  const state = await workforceFixture(page, { role: 'hr', populated: true });
  state.securityApproved = false;
  state.securityPending = true;
  await signInWorkforce(page);
  await page.goto('/hr/employees');
  await page
    .getByRole('button', { name: 'Attendance security Directory Person 01', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Approve after identity check' }).click();
  expect(state.securityApproved).toBe(false);
  await dialog.getByRole('button', { name: 'Confirm identity verification' }).click();
  await expect(dialog.getByText('Approved passkey', { exact: true })).toBeVisible();
  await dialog.getByLabel('Random photo checks').selectOption('3');
  await expect.poll(() => state.securityChecksPerShift).toBe(3);
  await dialog.getByRole('button', { name: 'Enable shared-device duty', exact: true }).click();
  expect(state.stationEnabled).not.toBe(true);
  await dialog.getByRole('button', { name: 'Confirm identity verification' }).click();
  await expect(dialog.getByText('Shared-device duty enabled', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Disable shared-device duty', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm identity verification' }).click();
  await expect(dialog.getByText('Shared-device duty disabled', { exact: true })).toBeVisible();
});
test('a random check captures fresh evidence without creating another punch and closes at its deadline', async ({
  page,
}) => {
  const state = await workforceFixture(page, { role: 'employee', populated: true });
  ready(state);
  state.securityChecksPerShift = 3;
  await installAttendanceCamera(page);
  await signInWorkforce(page);
  await page.getByRole('checkbox').check();
  await capturePunch(page, 'Clock in');
  await expect(page.getByRole('button', { name: 'Clock out', exact: true })).toBeVisible();
  state.securityCheck = {
    id: 'ac000000-0000-4000-8000-000000000001',
    slot: 1,
    session_id: state.punches[0].id,
    due_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 120000).toISOString(),
  };
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  const card = page.locator('.security-presence-card');
  await expect(card.getByRole('heading', { name: 'Photo check requested' })).toBeVisible();
  await card.getByRole('checkbox').check();
  await card.getByRole('button', { name: 'Verify now' }).click();
  const dialog = page.getByRole('dialog', { name: 'Security photo check' });
  await dialog.getByRole('button', { name: 'Take photo', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm security photo' }).click();
  await expect(card.getByText('Your security photo check was recorded.')).toBeVisible();
  expect(state.securityCheckPhotos).toHaveLength(1);
  expect(state.punches).toHaveLength(1);
  state.securityCheck = {
    id: 'ac000000-0000-4000-8000-000000000002',
    slot: 2,
    session_id: state.punches[0].id,
    due_at: new Date(Date.now() - 130000).toISOString(),
    expires_at: new Date(Date.now() - 10000).toISOString(),
  };
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await expect(
    card.getByText('This photo-check window has closed. HR can review the missed check.'),
  ).toBeVisible();
  await expect(card.getByRole('button', { name: 'Verify now' })).toHaveCount(0);
});
test('security attendance rejects inaccurate location before camera and is accessible on mobile', async ({
  page,
  context,
}) => {
  await context.setGeolocation({
    latitude: 12.971599 + 55 / 111195,
    longitude: 77.594566,
    accuracy: 8,
  });
  const state = await workforceFixture(page, { role: 'employee', populated: true });
  ready(state);
  await installAttendanceCamera(page);
  await signInWorkforce(page);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Clock in', exact: true }).click();
  await expect(page.getByRole('dialog').getByText(/outside your store/)).toBeVisible();
  expect(await page.evaluate(() => window.attendanceCameraRequests)).toBe(0);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: '/tmp/snr-security-attendance-mobile.png', fullPage: true });
});

test('HR reviews both private photos for a completed random check', async ({ page }) => {
  const state = await workforceFixture(page, { populated: true });
  const id = 'af000000-0000-4000-8000-000000000016';
  const stamp = new Date().toISOString();
  state.securityReport = [
    {
      id,
      display_name: state.people[0].display_name,
      due_at: stamp,
      status: 'completed',
      photo: { bucket_id: 'attendance-security-checks' },
    },
  ];
  state.securityPhotoDetails = {
    [id]: {
      bucket_id: 'attendance-security-checks',
      object_path: '2026-11-17/check.jpg',
      recorded_at: stamp,
      captured_at: stamp,
      distance_meters: 8,
      radius_meters: 50,
      guard_photo: {
        bucket_id: 'attendance-guard-photos',
        object_path: '2026-11-17/guard.jpg',
        operator_name: 'Authorized Guard',
        captured_at: stamp,
      },
    },
  };
  const sql = readFileSync(
    new URL('../../supabase/tests/attendance-photo-qr.sql', import.meta.url),
    'utf8',
  );
  const image = Buffer.from(sql.match(/'jpeg_base64','([A-Za-z0-9+/=]+)'/)[1], 'base64');
  state.photoFiles.set('attendance-security-checks/2026-11-17/check.jpg', image);
  state.photoFiles.set('attendance-guard-photos/2026-11-17/guard.jpg', image);
  await signInWorkforce(page);
  await page.getByRole('link', { name: 'Security checks', exact: true }).click();
  await page.getByRole('button', { name: 'View private photo', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Private security photo' });
  await expect(
    dialog.getByRole('img', { name: 'Employee security check evidence', exact: true }),
  ).toHaveAttribute('src', /attendance-security-checks/);
  await expect(
    dialog.getByRole('img', { name: 'Guard security check approval evidence', exact: true }),
  ).toHaveAttribute('src', /attendance-guard-photos/);
  await expect(
    dialog.getByRole('heading', { name: 'Guard approval · Authorized Guard' }),
  ).toBeVisible();
});
