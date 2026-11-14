import { test, expect } from '@playwright/test';
import { installAttendanceCamera, capturePunch } from './helpers/attendanceCamera';
import AxeBuilder from '@axe-core/playwright';
import { workforceFixture, signInWorkforce } from './helpers/workforceFixture';
test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 12.971599, longitude: 77.594566, accuracy: 8 });
});
async function openCameraAttempt(page, action) {
  await page.getByRole('button', { name: action, exact: true }).click();
}

function seedShift(state, assigned = false) {
  state.storeAreas.set(state.sites[0].id, {
    latitude: 12.971599,
    longitude: 77.594566,
    radius_meters: 50,
    version: 1,
  });
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

test('HR saves store coordinates and radius from Sites & Shifts with explicit location capture', async ({
  page,
}) => {
  const state = await workforceFixture(page, { populated: true });
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 12.971599, longitude: 77.594566, accuracy: 8 });
  await signInWorkforce(page);
  await page.getByRole('link', { name: 'Sites & Shifts', exact: true }).click();
  await page.getByRole('button', { name: 'Manage attendance area for Main office' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Store latitude')).toHaveValue('');
  await dialog.getByRole('button', { name: 'Use my current location', exact: true }).click();
  await expect(dialog.getByLabel('Store latitude')).toHaveValue('12.971599');
  expect(state.storeAreas.size).toBe(0);
  await expect(dialog.getByText(/Attendance radius: 50 metres/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Save attendance area' }).click();
  await expect(page.getByText('Attendance area · 50 metres', { exact: true })).toBeVisible();
  expect(state.storeAreas.get(state.sites[0].id).latitude).toBe(12.971599);
  await page.reload();
  await page.getByRole('button', { name: 'Manage attendance area for Main office' }).click();
  await expect(dialog.getByText(/Attendance radius: 50 metres/)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: '/tmp/snr-store-area-admin-mobile.png', fullPage: true });
});

test('outside and inaccurate clock-ins are rejected, and an unconfigured store blocks location requests', async ({
  page,
}) => {
  const state = await workforceFixture(page, { populated: true, role: 'employee' });
  seedShift(state, true);
  await installAttendanceCamera(page);
  state.storeAreas.clear();
  await page.context().grantPermissions(['geolocation']);
  await signInWorkforce(page);
  await page.getByRole('checkbox', { name: /I agree to share/ }).check();
  await expect(page.getByRole('button', { name: 'Clock in', exact: true })).toBeDisabled();
  await expect(page.getByText(/HR must set this store/)).toBeVisible();
  state.storeAreas.set(state.sites[0].id, {
    latitude: 12.971599,
    longitude: 77.594566,
    radius_meters: 50,
    version: 1,
  });
  await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
  await page.getByRole('checkbox', { name: /I agree to share/ }).check();
  await page.context().setGeolocation({ latitude: 13, longitude: 77.594566, accuracy: 8 });
  await openCameraAttempt(page, 'Clock in');
  await expect(page.getByRole('alert')).toContainText('outside your store');
  expect(await page.evaluate(() => window.attendanceCameraRequests)).toBe(0);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.context().setGeolocation({ latitude: 12.971599, longitude: 77.594566, accuracy: 101 });
  await openCameraAttempt(page, 'Clock in');
  await expect(page.getByRole('alert')).toContainText('accuracy is too low');
  expect(state.punches).toHaveLength(0);
  expect(state.locations.size).toBe(0);
});

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
  await installAttendanceCamera(page);
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 12.971599, longitude: 77.594566, accuracy: 8 });
  await page.addInitScript(() => {
    const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    window.locationRequests = 0;
    navigator.geolocation.getCurrentPosition = (...arguments_) => {
      window.locationRequests++;
      return original(...arguments_);
    };
  });
  await signInWorkforce(page);
  await expect(page.getByRole('button', { name: 'Clock in', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.locationRequests)).toBe(0);
  await page.getByRole('checkbox', { name: /I agree to share my photo and location/ }).check();
  await expect(page.getByRole('button', { name: 'Clock in', exact: true })).toBeEnabled();
  state.loseNextPunchResponse = true;
  await capturePunch(page, 'Clock in');
  await expect(
    page.getByRole('button', { name: 'Check attendance request', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Check attendance request', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Clock out', exact: true })).toBeVisible();
  expect(state.punches).toHaveLength(1);
  const attempts = state.calls.filter((call) => call.name === 'record_attendance');
  expect(attempts[0].parameters).toEqual(attempts[1].parameters);
  expect(state.locations.size).toBe(1);
  expect(await page.evaluate(() => window.locationRequests)).toBeGreaterThanOrEqual(2);
  expect(state.locations.get(state.punches[0].id).latitude).toBe(12.971599);
  await page.reload();
  await page.context().setGeolocation({ latitude: 12.975, longitude: 77.6, accuracy: 11 });
  await expect(page.getByRole('button', { name: 'Clock out', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: /I agree to share my photo and location/ }).check();
  await openCameraAttempt(page, 'Clock out');
  await expect(page.getByRole('alert')).toContainText('outside your store');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  expect(state.punches).toHaveLength(1);
  expect(state.locations.size).toBe(1);
  await page.context().setGeolocation({ latitude: 12.9717, longitude: 77.5946, accuracy: 11 });
  await capturePunch(page, 'Clock out');
  await expect(page.getByRole('button', { name: 'Clock in', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'View my attendance history' }).click();
  await expect(page.getByRole('cell', { name: '8 h 0 min', exact: true })).toBeVisible();
  expect(state.punches).toHaveLength(2);
  expect(state.locations.size).toBe(2);
  for (const event of state.punches) {
    const photo = state.locations.get(event.id).photo;
    expect(photo.bucket_id).toBe(
      event.event_type === 'clock_in' ? 'attendance-clock-in' : 'attendance-clock-out',
    );
    expect(photo.object_path).toMatch(
      /^(\d{4}-\d{2}-\d{2})\/Directory_Person_01_\1_\d{2}-\d{2}-\d{2}[.]\d{6}_[0-9a-f-]+[.]jpg$/,
    );
  }

  expect(state.locations.get(state.punches[1].id).latitude).toBe(12.9717);
  await page.getByRole('button', { name: /^View photo and location/ }).click();
  const locationDialog = page.getByRole('dialog');
  await expect(
    locationDialog.getByRole('img', { name: 'Clock-in attendance photo', exact: true }),
  ).toBeVisible();
  await expect(
    locationDialog.getByRole('img', { name: 'Clock-out attendance photo', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.attendanceCameraTracks)).toBe(0);
  await expect(locationDialog.getByText(/Store QR verified/)).toHaveCount(0);
  await expect(locationDialog.getByText('12.971599, 77.594566', { exact: true })).toBeVisible();
  await expect(locationDialog.getByText('12.971700, 77.594600', { exact: true })).toBeVisible();
  await expect(locationDialog.getByRole('link', { name: 'View clock-in on map' })).toHaveAttribute(
    'href',
    /openstreetmap.org/,
  );
  await locationDialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.goto('/me/schedule');
  await expect(page.getByRole('cell', { name: 'Day shift', exact: true })).toBeVisible();
  await page.goto('/me/attendance');
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

test('photo-only capture is gated on migration 0010', async ({ page }) => {
  const state = await workforceFixture(page, { populated: true, role: 'employee' });
  seedShift(state, true);
  state.photoOnlyEnabled = false;
  await signInWorkforce(page);
  await page.getByRole('checkbox', { name: /I agree to share/ }).check();
  await expect(page.getByRole('button', { name: 'Clock in', exact: true })).toBeDisabled();
  await expect(page.getByText(/requires migration 0010/)).toBeVisible();
  expect(state.calls.some((call) => call.name === 'record_attendance')).toBe(false);
});
test('a 55-metre fix cannot open a camera while a 40-metre fix can', async ({ page, context }) => {
  const state = await workforceFixture(page, { populated: true, role: 'employee' });
  seedShift(state, true);
  await installAttendanceCamera(page);
  await signInWorkforce(page);
  await page.getByRole('checkbox', { name: /I agree to share/ }).check();
  await context.setGeolocation({
    latitude: 12.971599 + 55 / 111194.93,
    longitude: 77.594566,
    accuracy: 8,
  });
  await openCameraAttempt(page, 'Clock in');
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('outside your store');
  expect(await page.evaluate(() => window.attendanceCameraRequests)).toBe(0);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await context.setGeolocation({
    latitude: 12.971599 + 40 / 111194.93,
    longitude: 77.594566,
    accuracy: 8,
  });
  await openCameraAttempt(page, 'Clock in');
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Take photo', exact: true }),
  ).toBeEnabled();
  expect(await page.evaluate(() => window.attendanceCameraRequests)).toBe(1);
  expect(state.calls.some((call) => /attendance_qr/.test(call.name))).toBe(false);
});

test('moving outside the store after the camera opens blocks the shutter and closes the stream', async ({
  page,
  context,
}) => {
  const state = await workforceFixture(page, { populated: true, role: 'employee' });
  seedShift(state, true);
  await installAttendanceCamera(page);
  await signInWorkforce(page);
  await page.getByRole('checkbox', { name: /I agree to share/ }).check();
  await openCameraAttempt(page, 'Clock in');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Take photo', exact: true })).toBeEnabled();
  await context.setGeolocation({ latitude: 13, longitude: 77.594566, accuracy: 8 });
  await dialog.getByRole('button', { name: 'Take photo', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('outside your store');
  expect(await page.evaluate(() => window.attendanceCameraTracks)).toBe(0);
  expect(state.punches).toHaveLength(0);
  expect(state.photoFiles.size).toBe(0);
});
test('pasting a store pin fills exact coordinates and persists the map link with site setup', async ({
  page,
}) => {
  const state = await workforceFixture(page, { populated: true });
  await signInWorkforce(page);
  await page.getByRole('link', { name: 'Sites & Shifts', exact: true }).click();
  await page.getByRole('button', { name: 'Edit site Main office', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Store location link').fill('https://example.com/store');
  await expect(dialog.getByRole('alert')).toContainText('Use an HTTPS');
  await expect(dialog.getByLabel('Store latitude')).toHaveValue('');
  await expect(dialog.getByLabel('Store longitude')).toHaveValue('');
  const link = 'https://www.google.com/maps/place/store/@13,78,15z/data=!3d12.971599!4d77.594566';
  await dialog.getByLabel('Store location link').fill(link);
  await expect(dialog.getByLabel('Store latitude')).toHaveValue('12.971599');
  await expect(dialog.getByLabel('Store longitude')).toHaveValue('77.594566');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Site saved.', { exact: true })).toBeVisible();
  expect(state.storeAreas.get(state.sites[0].id).map_url).toBe(link);
  await page.getByRole('button', { name: 'Edit site Main office', exact: true }).click();
  await expect(dialog.getByLabel('Store location link')).toHaveValue(link);
  await dialog.getByLabel('Store latitude').fill('12.97');
  await expect(dialog.getByLabel('Store location link')).toHaveValue('');
});

test('denied location never opens the camera, and denied camera access never records attendance', async ({
  page,
  context,
}) => {
  const state = await workforceFixture(page, { populated: true, role: 'employee' });
  seedShift(state, true);
  await installAttendanceCamera(page);
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_, fail) => fail({ code: 1 });
  });
  await signInWorkforce(page);
  await page.getByRole('checkbox', { name: /I agree to share/ }).check();
  await openCameraAttempt(page, 'Clock in');
  let dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toContainText('Location permission was denied');
  expect(await page.evaluate(() => window.attendanceCameraRequests)).toBe(0);
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await context.setGeolocation({ latitude: 12.971599, longitude: 77.594566, accuracy: 8 });
  await page.reload();
  await page.evaluate(() => {
    navigator.geolocation.getCurrentPosition = (ok) =>
      ok({
        coords: { latitude: 12.971599, longitude: 77.594566, accuracy: 8 },
        timestamp: Date.now(),
      });
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('denied', 'NotAllowedError');
    };
  });
  await page.getByRole('checkbox', { name: /I agree to share/ }).check();
  await openCameraAttempt(page, 'Clock in');
  dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toContainText('Camera permission was denied');
  expect(state.punches).toHaveLength(0);
});

test('photo review verifies location before camera and cancellation stops the camera', async ({
  page,
}) => {
  const state = await workforceFixture(page, { populated: true, role: 'employee' });
  seedShift(state, true);
  await installAttendanceCamera(page);
  await page.addInitScript(() => {
    const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    window.shutterLocationRequests = 0;
    navigator.geolocation.getCurrentPosition = (...args) => {
      window.shutterLocationRequests++;
      return original(...args);
    };
  });
  await signInWorkforce(page);
  await page.getByRole('checkbox', { name: /I agree to share/ }).check();
  await page.getByRole('button', { name: 'Clock in', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Take photo', exact: true }).click();
  await expect(dialog.getByAltText('Your attendance photo for review')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: '/tmp/snr-attendance-photo-review-mobile.png', fullPage: true });
  await dialog.getByRole('button', { name: 'Retake photo' }).click();
  await expect(dialog.getByRole('button', { name: 'Take photo', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => window.attendanceCameraTracks)).toBe(0);
  expect(state.punches).toHaveLength(0);
});

test('HR site setup has no QR controls', async ({ page }) => {
  await workforceFixture(page, { populated: true });
  await signInWorkforce(page);
  await page.getByRole('link', { name: 'Sites & Shifts', exact: true }).click();
  await expect(page.getByRole('button', { name: /Attendance QR/ })).toHaveCount(0);
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
    await installAttendanceCamera(page);
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
    state.locations.set(state.sessions[0].id, {
      latitude: 12.971599,
      longitude: 77.594566,
      accuracy_meters: 8,
      captured_at: `${state.today}T04:00:00Z`,
      recorded_at: `${state.today}T04:00:00Z`,
    });
    await signInWorkforce(page);
    await page
      .getByRole('link', { name: role === 'hr' ? 'Attendance' : 'Team Attendance', exact: true })
      .click();
    await expect(
      page.getByRole('cell', { name: 'In progress', exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clock in', exact: true })).toHaveCount(0);
    if (role === 'supervisor')
      await expect(page.getByRole('button', { name: /^View photo and location/ })).toHaveCount(0);
    await page.getByLabel('Find a person').fill('No person');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page.getByText('No attendance matches these dates')).toBeVisible();
    await page.getByLabel('Find a person').fill('SNR-001');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(
      page.getByRole('cell', { name: 'In progress', exact: true }).first(),
    ).toBeVisible();
    if (role === 'hr') {
      await page.getByRole('button', { name: /^View photo and location/ }).click();
      await expect(
        page.getByRole('dialog').getByText('12.971599, 77.594566', { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('dialog').getByText('Clock-out not recorded yet.')).toBeVisible();
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.screenshot({ path: '/tmp/snr-location-hr-details.png', fullPage: true });
      await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    }
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({ path: `/tmp/snr-attendance-${role}-desktop.png`, fullPage: true });
  });

test('location denial leaves attendance unchanged and no fix is requested before consent', async ({
  page,
}) => {
  const state = await workforceFixture(page, { populated: true, role: 'employee' });
  seedShift(state, true);
  await installAttendanceCamera(page);
  await page.addInitScript(() => {
    window.locationRequests = 0;
    navigator.geolocation.getCurrentPosition = (_success, fail) => {
      window.locationRequests++;
      fail({ code: 1 });
    };
  });
  await signInWorkforce(page);
  await expect(page.getByRole('button', { name: 'Clock in', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.locationRequests)).toBe(0);
  await page.getByRole('checkbox', { name: /I agree to share my photo and location/ }).check();
  await openCameraAttempt(page, 'Clock in');
  await expect(page.getByRole('alert')).toContainText('Location permission was denied');
  expect(state.punches).toHaveLength(0);
  expect(state.locations.size).toBe(0);
  expect(state.calls.some((call) => call.name === 'record_attendance')).toBe(false);
});

test('location activation is required before the updated client requests a device fix', async ({
  page,
}) => {
  const state = await workforceFixture(page, { populated: true, role: 'employee' });
  seedShift(state, true);
  await installAttendanceCamera(page);
  state.locationEnabled = false;
  await signInWorkforce(page);
  await expect(page.getByRole('button', { name: 'Clock in', exact: true })).toBeDisabled();
  await expect(page.getByText(/apply attendance migration 0006/)).toBeVisible();
  expect(state.punches).toHaveLength(0);
});
