// Two real SDK sessions and a real Chromium WebAuthn ceremony; provider calls
// are intercepted. Real authorization/Storage behavior is covered by SQL tests.
export async function personalGuardFixture(page, state) {
  state.personalQrEnabled = true;
  state.stationEnabled = true;
  const guardId = '00000000-0000-4000-8000-000000000099';
  const guardToken = 'fixture-guard-access-token';
  const guardFlow = 'ae000000-0000-4000-8000-000000000099';
  state.guardLogouts = 0;
  state.guardReleases = [];
  state.guardRequests = [];
  const guardUser = {
    id: guardId,
    email: 'guard@example.invalid',
    email_confirmed_at: new Date().toISOString(),
    role: 'authenticated',
    aud: 'authenticated',
    user_metadata: {},
    app_metadata: {},
  };
  await page.route('https://auth.snr-nest.test/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    const headers = {
      'Access-Control-Allow-Origin': request.headers().origin || 'http://localhost:5174',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': '*',
    };
    const reply = (json, status = 200) => route.fulfill({ headers, json, status });
    if (request.method() === 'OPTIONS') return route.fallback();
    if (path === '/auth/v1/token' && request.postDataJSON()?.email === guardUser.email) {
      if (request.postDataJSON().password !== 'guard-password')
        return reply({ error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
      return reply({
        access_token: guardToken,
        refresh_token: 'fixture-guard-refresh',
        token_type: 'bearer',
        expires_in: 3600,
        user: guardUser,
      });
    }
    const isGuard = request.headers().authorization === 'Bearer ' + guardToken;
    if (isGuard && path === '/auth/v1/user') return reply(guardUser);
    if (isGuard && path === '/auth/v1/logout') {
      state.guardLogouts++;
      return route.fulfill({ status: 204, headers });
    }
    if (isGuard && path.endsWith('/current_workspace'))
      return reply({
        user_id: guardId,
        organization_id: state.organization.id,
        organization_name: state.organization.name,
        display_name: 'Authorized Guard',
        role: 'employee',
      });
    if (path.endsWith('/security_station_context'))
      return isGuard && state.stationEnabled
        ? reply({
            user_id: guardId,
            flow_id: guardFlow,
            site_id: state.people[0].site_id,
            site_name: 'Main office',
          })
        : reply({ code: 'PT403', message: 'station_operator_required' }, 403);
    if (isGuard && path.endsWith('/security_release_flow')) {
      state.guardReleases.push(request.postDataJSON().p_flow_id);
      return reply(null);
    }
    if (path.endsWith('/security_station_close')) {
      state.stationVisit = null;
      return reply(null);
    }
    return route.fallback();
  });
  await page.route('**/api/attendance/security/workspace', async (route) => {
    if (route.request().headers().authorization !== 'Bearer ' + guardToken) return route.fallback();
    return route.fulfill({
      json: { security_flow_id: guardFlow, security_credential_approved: true },
    });
  });
  await page.route('**/api/attendance/station/workspace', async (route) => {
    const req = route.request(),
      body = req.postDataJSON();
    state.guardRequests.push({ headers: req.headers(), body });
    if (!state.stationEnabled)
      return route.fulfill({ status: 403, json: { error: { code: 'station_operator_required' } } });
    if (
      req.headers().authorization !== 'Bearer ' + guardToken ||
      !req.headers()['x-employee-authorization'] ||
      body.qrToken !== state.employeeQrs.get(state.people[0].id)?.token
    )
      return route.fulfill({ status: 403, json: { error: { code: 'employee_qr_invalid' } } });
    state.stationVisit = { id: 'ad000000-0000-4000-8000-000000000001' };
    return route.fulfill({
      json: {
        visit_id: state.stationVisit.id,
        expires_at: new Date(Date.now() + 300000).toISOString(),
        workspace: {
          ...state.buildAttendanceWorkspace(),
          server_time: new Date().toISOString(),
          display_name: state.people[0].display_name,
          security_flow_id: 'ab000000-0000-4000-8000-000000000001',
        },
      },
    });
  });
}
export async function verifyGuard(page) {
  await page.getByLabel('Guard email', { exact: true }).fill('guard@example.invalid');
  await page.getByLabel('Guard password', { exact: true }).fill('guard-password');
  await page.getByRole('button', { name: 'Verify guard & continue' }).click();
}
export async function captureTwoPhotos(page, action) {
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
  await confirm.isDisabled();
  await dialog.getByRole('button', { name: 'Take photo', exact: true }).click();
  await dialog.getByRole('checkbox', { name: /checked .*staff ID in person/ }).check();
  await confirm.click();
}
