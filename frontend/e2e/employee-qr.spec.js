import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { workforceFixture, signInWorkforce } from './helpers/workforceFixture';
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
test('HR opens the common attendance QR in a separate window and downloads the shared sign-in link', async ({
  page,
}) => {
  await workforceFixture(page, { populated: true });
  await signInWorkforce(page);
  await page.goto('/hr/employees');
  const popup = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Open attendance QR', exact: true }).click();
  const display = await popup;
  await expect(display).toHaveURL(/\/attendance\/qr$/);
  await expect(display.getByRole('img', { name: 'Common employee attendance QR' })).toBeVisible();
  await expect(display.getByRole('link', { name: 'Open attendance', exact: true })).toHaveAttribute(
    'href',
    /\/login\?attendance=1$/,
  );
  const download = display.waitForEvent('download');
  await display.getByRole('link', { name: 'Download QR' }).click();
  expect((await download).suggestedFilename()).toBe('snr-common-attendance-qr.png');
  await expect(page.getByRole('button', { name: /^Attendance QR Directory/ })).toHaveCount(0);
  await page.goto('/login?attendance=1');
  await expect(page.getByRole('heading', { name: 'Sign in for attendance' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
});
test('scanning requires credentials and only the signed-in employee can use an approved passkey to record pairs', async ({
  page,
}) => {
  const state = await workforceFixture(page, { role: 'employee', populated: true });
  ready(state);
  await installAttendanceCamera(page);
  await page.goto('/attendance#employee-qr=90000000-0000-4000-8000-000000000099');
  await expect(page).toHaveURL(/\/login(?:\?attendance=1)?$/);
  await page.getByLabel('Email address').fill('workspace-test@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/\/attendance$/);
  await expect(page.getByText('Signed in as', { exact: false })).toContainText(
    'Workspace Test User',
  );
  await page.getByRole('checkbox').check();
  state.loseNextPunchResponse = true;
  await capturePunch(page, 'Clock in');
  await page.getByRole('button', { name: 'Check attendance request' }).click();
  await expect(page.getByRole('button', { name: 'Clock out', exact: true })).toBeVisible();
  await page.getByRole('checkbox').check();
  await capturePunch(page, 'Clock out');
  await expect(page.getByRole('button', { name: 'Clock in', exact: true })).toBeVisible();
  await page.getByRole('checkbox').check();
  await capturePunch(page, 'Clock in');
  await expect(page.getByRole('button', { name: 'Clock out', exact: true })).toBeVisible();
  expect(state.punches.map((p) => p.event_type)).toEqual(['clock_in', 'clock_out', 'clock_in']);
  for (const call of state.calls.filter((c) => c.name === 'record_attendance')) {
    expect(call.parameters.p_employee_id).toBe(state.people[0].id);
    expect(call.parameters.p_evidence).not.toHaveProperty('qr');
  }
  await expect(page.getByRole('combobox')).toHaveCount(0);
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
