import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { workforceFixture, signInWorkforce } from './helpers/workforceFixture';
import { installAttendanceCamera } from './helpers/attendanceCamera';

async function sharedDevice(page) {
  const state = await workforceFixture(page, { role: 'employee', populated: true });
  const person = state.people[0];
  state.stationEnabled = true;
  state.stationEmployeeFlow = 'ac000000-0000-4000-8000-000000000001';
  state.stationLogouts = [];
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
  const employeeId = '00000000-0000-4000-8000-000000000099';
  const employeeToken = 'fixture-employee-access-token';
  const employeeWorkspace = () => ({
    ...state.buildAttendanceWorkspace(),
    display_name: person.display_name,
    employee_number: person.employee_number,
    security_flow_id: state.stationEmployeeFlow,
    security_credential_approved: false,
    security_checks_per_shift: state.securityChecksPerShift,
    server_time: new Date().toISOString(),
  });
  await page.route('https://auth.snr-nest.test/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const headers = {
      'Access-Control-Allow-Origin': request.headers().origin || 'http://localhost:5174',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': '*',
    };
    const reply = (json, status = 200) => route.fulfill({ headers, json, status });
    if (request.method() === 'OPTIONS') return route.fallback();
    const employee = {
      id: employeeId,
      email: 'employee@example.invalid',
      email_confirmed_at: new Date().toISOString(),
      aud: 'authenticated',
      role: 'authenticated',
      user_metadata: {},
      app_metadata: {},
    };
    if (url.pathname === '/auth/v1/token' && request.postDataJSON()?.email === employee.email) {
      if (request.postDataJSON().password !== 'employee-password')
        return reply({ error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
      return reply({
        access_token: employeeToken,
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'fixture-employee-refresh',
        user: employee,
      });
    }
    const isEmployee = request.headers().authorization === 'Bearer ' + employeeToken;
    if (isEmployee && url.pathname === '/auth/v1/user') return reply(employee);
    if (isEmployee && url.pathname === '/auth/v1/logout') {
      state.stationLogouts.push(employeeId);
      return route.fulfill({ headers, status: 204 });
    }
    if (isEmployee && url.pathname === '/rest/v1/rpc/current_workspace')
      return reply({
        user_id: employeeId,
        organization_id: state.organization.id,
        organization_name: state.organization.name,
        display_name: person.display_name,
        role: 'employee',
      });
    if (isEmployee && url.pathname === '/rest/v1/rpc/security_attendance_workspace')
      return reply(employeeWorkspace());
    if (url.pathname === '/rest/v1/rpc/security_station_context')
      return state.stationEnabled
        ? reply({
            flow_id: request.postDataJSON().p_flow_id,
            user_id: '00000000-0000-4000-8000-000000000001',
            site_name: 'Main office',
            site_id: person.site_id,
          })
        : reply({ code: 'PT403', message: 'station_operator_required' }, 403);
    if (url.pathname === '/rest/v1/rpc/security_station_due')
      return state.stationEnabled
        ? reply({
            requests: state.securityCheck
              ? [{ ...state.securityCheck, display_name: person.display_name }]
              : [],
            server_time: new Date().toISOString(),
          })
        : reply({ code: 'PT403', message: 'station_operator_required' }, 403);
    if (url.pathname === '/rest/v1/rpc/security_station_close') {
      state.stationVisit = null;
      return reply(null);
    }
    return route.fallback();
  });
  await page.route('**/api/attendance/station/workspace', async (route) => {
    if (!state.stationEnabled)
      return route.fulfill({ status: 403, json: { error: { code: 'station_operator_required' } } });
    if (route.request().headers()['x-employee-authorization'] !== 'Bearer ' + employeeToken)
      return route.fulfill({ status: 401, json: { error: { code: 'sign_in_required' } } });
    state.stationVisit ||= { id: 'ad000000-0000-4000-8000-000000000001' };
    if (state.loseNextStationOpen) {
      state.loseNextStationOpen = false;
      return route.abort('failed');
    }
    return route.fulfill({
      json: {
        visit_id: state.stationVisit.id,
        expires_at: new Date(Date.now() + 300000).toISOString(),
        workspace: employeeWorkspace(),
      },
    });
  });
  await installAttendanceCamera(page);
  return state;
}
async function employeeSignIn(page, password = 'employee-password') {
  await page.getByLabel('Employee email', { exact: true }).fill('employee@example.invalid');
  await page.getByLabel('Employee password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Continue to photo & location' }).click();
}
async function witnessedPhoto(page, action) {
  await page
    .getByRole('checkbox', {
      name: 'I agree to share my photo and location for this attendance event.',
    })
    .check();
  await page.getByRole('button', { name: action, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Take photo', exact: true }).click();
  const confirm = dialog.getByRole('button', {
    name: 'Confirm ' + action.toLowerCase(),
    exact: true,
  });
  await expect(confirm).toBeDisabled();
  await dialog
    .getByRole('checkbox', { name: /I, Workspace Test User, checked Directory Person 01/ })
    .check();
  await confirm.click();
}
test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 12.971599, longitude: 77.594566, accuracy: 8 });
});
test('dashboard opens the common QR separately and shared-device duty requires explicit HR authorization', async ({
  page,
}) => {
  const state = await sharedDevice(page);
  await signInWorkforce(page);
  await page.goto('/me');
  const popup = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Open attendance QR', exact: true }).click();
  const qr = await popup;
  await expect(qr.getByRole('heading', { name: 'No phone? Ask the guard.' })).toBeVisible();
  await qr.close();
  state.stationEnabled = false;
  await page.getByRole('link', { name: 'Help an employee without a phone' }).click();
  await expect(page.getByRole('heading', { name: 'Guard authorization required' })).toBeVisible();
  await expect(page.getByLabel('Employee password')).toHaveCount(0);
  expect(await page.evaluate(() => window.attendanceCameraRequests)).toBe(0);
});
test('a private employee login, in-person witness and real guard passkey record one punch and clear the employee turn', async ({
  page,
}) => {
  const state = await sharedDevice(page);
  await signInWorkforce(page);
  const guardStorage = await page.evaluate(() =>
    Object.fromEntries(Object.entries(sessionStorage).filter(([key]) => key === 'snr-nest-auth')),
  );
  await page.goto('/attendance/station');
  await employeeSignIn(page, 'wrong-password');
  await expect(page.getByRole('alert')).toContainText('Check your employee email and password');
  await expect(page.getByLabel('Employee password')).toHaveValue('');
  state.loseNextStationOpen = true;
  await employeeSignIn(page);
  await expect(
    page.getByRole('heading', { name: 'Directory Person 01', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enroll attendance passkey' })).toHaveCount(0);
  await expect(page.getByText('Staff ID: SNR-001', { exact: true })).toBeVisible();
  state.loseNextPunchResponse = true;
  await witnessedPhoto(page, 'Clock in');
  await page.getByRole('button', { name: 'Check attendance request' }).click();
  await expect(
    page.getByRole('heading', { name: 'Employee, enter your own credentials' }),
  ).toBeVisible();
  expect(state.punches).toHaveLength(1);
  await expect.poll(() => state.stationLogouts.length).toBe(1);
  expect(
    await page.evaluate(() =>
      Object.fromEntries(Object.entries(sessionStorage).filter(([key]) => key === 'snr-nest-auth')),
    ),
  ).toEqual(guardStorage);
  const storage = await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }));
  expect(storage).not.toContain('fixture-employee-access-token');
  expect(storage).not.toContain('fixture-employee-refresh');
  expect(storage).not.toContain('employee-password');
  await employeeSignIn(page);
  await expect(page.getByRole('button', { name: 'Clock out', exact: true })).toBeVisible();
  await witnessedPhoto(page, 'Clock out');
  await expect(page.getByLabel('Employee email')).toBeVisible();
  expect(state.punches.map((p) => p.event_type)).toEqual(['clock_in', 'clock_out']);
  expect(await page.evaluate(() => window.attendanceCameraTracks)).toBe(0);
});
test('shared-device camera remains gated by location and a guard reset prevents confirming a captured photo', async ({
  page,
  context,
}) => {
  const state = await sharedDevice(page);
  await signInWorkforce(page);
  await page.goto('/attendance/station');
  await employeeSignIn(page);
  await context.setGeolocation({ latitude: 13, longitude: 77.594566, accuracy: 8 });
  await page
    .getByRole('checkbox', {
      name: 'I agree to share my photo and location for this attendance event.',
    })
    .check();
  await page.getByRole('button', { name: 'Clock in', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('outside');
  expect(await page.evaluate(() => window.attendanceCameraRequests)).toBe(0);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await context.setGeolocation({ latitude: 12.971599, longitude: 77.594566, accuracy: 8 });
  state.stationEnabled = false;
  await witnessedPhoto(page, 'Clock in');
  await expect(page.getByRole('alert')).toContainText('no longer authorized');
  expect(state.punches).toHaveLength(0);
  await page.getByRole('button', { name: 'End employee turn' }).click();
  await expect(page.getByLabel('Employee password')).toHaveValue('');
});
test('shared-device photo checks use fresh employee sign-in and guard verification without a second clock-in', async ({
  page,
}) => {
  const state = await sharedDevice(page);
  await signInWorkforce(page);
  await page.goto('/attendance/station');
  await employeeSignIn(page);
  await witnessedPhoto(page, 'Clock in');
  await expect(page.getByLabel('Employee email')).toBeVisible();
  state.securityChecksPerShift = 3;
  state.securityCheck = {
    id: 'ae000000-0000-4000-8000-000000000001',
    session_id: state.punches[0].id,
    expires_at: new Date(Date.now() + 120000).toISOString(),
  };
  await employeeSignIn(page);
  await page
    .getByRole('checkbox', {
      name: 'I agree to save this photo and location for my security check.',
    })
    .check();
  await page.getByRole('button', { name: 'Verify now', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Take photo', exact: true }).click();
  await dialog.getByRole('checkbox', { name: /I, Workspace Test User, checked/ }).check();
  await dialog.getByRole('button', { name: 'Confirm security photo' }).click();
  await expect(page.getByLabel('Employee password')).toBeVisible();
  expect(state.securityCheckPhotos).toHaveLength(1);
  expect(state.punches).toHaveLength(1);
  await page.setViewportSize({ width: 390, height: 844 });
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('Employee email', { exact: true }).focus();
  await page.screenshot({ path: '/tmp/snr-attendance-station-mobile.png', fullPage: true });
});
test('an unattended employee turn clears its session and closes the camera after five minutes', async ({
  page,
}) => {
  const state = await sharedDevice(page);
  await page.clock.install();
  await signInWorkforce(page);
  await page.goto('/attendance/station');
  await employeeSignIn(page);
  await page
    .getByRole('checkbox', {
      name: 'I agree to share my photo and location for this attendance event.',
    })
    .check();
  await page.getByRole('button', { name: 'Clock in', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Take photo', exact: true }),
  ).toBeEnabled();
  await page.clock.fastForward('05:01');
  await expect(page.getByLabel('Employee email')).toBeEnabled();
  await expect(page.getByRole('status')).toContainText('timed out and was cleared');
  await expect.poll(() => state.stationLogouts.length).toBe(1);
  expect(state.punches).toHaveLength(0);
  expect(await page.evaluate(() => window.attendanceCameraTracks)).toBe(0);
});
