import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { handleStaffAccounts } from './staffAccounts.js';

const actor = '91000000-0000-4000-8000-000000000001';
const organization = '92000000-0000-4000-8000-000000000001';
const account = '91000000-0000-4000-8000-000000000002';
const employee = '93000000-0000-4000-8000-000000000001';
const requestId = '94000000-0000-4000-8000-000000000001';
const lease = '95000000-0000-4000-8000-000000000001';
const password = 'Synthetic-Test-Password-17';
const settings = {
  supabaseUrl: 'https://server.snr-nest.test',
  supabaseKey: 'sb_publishable_test_server',
  adminKey: `sb_secret_${'test_fixture_only_'.repeat(3)}`,
};
const profile = {
  display_name: 'New Person',
  employee_number: 'TEST-1',
  site_id: '96000000-0000-4000-8000-000000000001',
  department_id: '97000000-0000-4000-8000-000000000001',
  role: 'employee',
  active: true,
};
const body = { request_id: requestId, email: 'new-person@example.invalid', password, profile };
function request(values = body, path = '/api/admin/staff', method = 'POST', extra = {}) {
  return new Request(`https://workspace.snr-nest.test${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer fixture-user-token',
      Origin: 'https://workspace.snr-nest.test',
      ...extra,
    },
    body: JSON.stringify(values),
  });
}
function fixture(options = {}) {
  const calls = [];
  let checks = 0;
  let applied = false;
  const operation = {
    operation_id: requestId,
    actor_user_id: actor,
    organization_id: organization,
    lease_token: lease,
    email: body.email,
    status: 'pending',
    account_user_id: options.credentials ? account : null,
    profile_version: 2,
    membership_version: 1,
  };
  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  async function fetcher(url, init) {
    const path = new URL(url).pathname;
    const parameters = init.body ? JSON.parse(init.body) : null;
    calls.push({ path, ...init, parameters });
    if (path === '/auth/v1/user') return json({ id: actor }, options.invalidIdentity ? 401 : 200);
    if (path === '/rest/v1/rpc/hr_begin_staff_account') {
      if (options.denied) return json({ code: 'PT403', message: 'workforce_access_denied' }, 403);
      if (options.stale) return json({ code: 'PT409', message: 'record_changed' }, 409);
      return json({
        ...operation,
        ...(options.completed ? { status: 'completed', employee_id: employee } : {}),
      });
    }
    if (path === '/rest/v1/rpc/hr_staff_account_context') {
      checks++;
      if (options.revokedAfterRead && checks === 2)
        return json({ code: 'PT403', message: 'workforce_access_denied' }, 403);
      return json({ ...operation, ...(options.wrongActor ? { actor_user_id: account } : {}) });
    }
    if (path.startsWith('/auth/v1/admin/users')) {
      if (init.method === 'GET')
        return json({
          id: account,
          email: 'old@example.invalid',
          app_metadata: { provider: 'email', existing: 'preserved' },
        });
      if (options.reject)
        return json({ code: 'weak_password', message: `private upstream: ${password}` }, 422);
      applied = true;
      if (options.lostResponse) throw new Error('Simulated response lost after Auth commit');
      return json({ id: account, email: body.email });
    }
    if (path === '/rest/v1/rpc/hr_close_staff_account') return json({ status: 'failed' });
    if (
      path === '/rest/v1/rpc/hr_complete_staff_account' ||
      path === '/rest/v1/rpc/hr_recover_staff_account'
    ) {
      if (options.failCompletion && path.endsWith('complete_staff_account'))
        throw new Error('Completion interrupted');
      return json({
        status: applied ? 'completed' : 'failed',
        employee_id: applied ? employee : null,
      });
    }
    throw new Error(`Unexpected fixture request ${path}`);
  }
  return { fetcher, calls };
}
const authWrites = (calls) =>
  calls.filter((call) => call.path.startsWith('/auth/v1/admin/') && call.method !== 'GET');

test('create authorizes the caller, creates Auth user without client role authority, then completes its profile', async () => {
  const mock = fixture();
  const result = await handleStaffAccounts(request(), settings, mock);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { status: 'completed', employee_id: employee });
  const write = authWrites(mock.calls)[0];
  assert.equal(write.parameters.email_confirm, true);
  assert.equal(write.parameters.password, password);
  assert.equal(write.parameters.role, undefined);
  assert.deepEqual(write.parameters.app_metadata, {
    snr_admin_operation: requestId,
    snr_admin_actor: actor,
    snr_admin_organization: organization,
  });
  for (const call of mock.calls.filter((call) => call.path.includes('/rpc/'))) {
    assert.equal(JSON.stringify(call.parameters).includes(password), false);
    assert.equal(call.headers.Authorization, 'Bearer fixture-user-token');
    assert.equal(call.headers.apikey, settings.supabaseKey);
  }
  assert.equal(write.headers.apikey, settings.adminKey);
  const begin = mock.calls.find((call) => call.path.endsWith('hr_begin_staff_account'));
  assert.match(begin.parameters.p_fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(begin.parameters.p_profile.password, undefined);
});

test('update uses only the server-confirmed target and preserves existing app metadata', async () => {
  const mock = fixture({ credentials: true });
  const result = await handleStaffAccounts(
    request(
      { request_id: requestId, email: body.email, password, version: 1, membership_version: 1 },
      `/api/admin/staff/${employee}/account`,
      'PATCH',
    ),
    settings,
    mock,
  );
  assert.equal(result.status, 200);
  const write = authWrites(mock.calls)[0];
  assert.equal(write.path, `/auth/v1/admin/users/${account}`);
  assert.equal(write.parameters.app_metadata.existing, 'preserved');
  assert.equal(
    mock.calls.filter((call) => call.path.endsWith('hr_staff_account_context')).length,
    2,
  );
});

test('linking an existing account confirms it through admin Auth without requiring a new password', async () => {
  const mock = fixture({ credentials: true });
  const { password: _password, ...existing } = body;
  const result = await handleStaffAccounts(
    request({ ...existing, account_mode: 'existing' }),
    settings,
    mock,
  );
  assert.equal(result.status, 200);
  const write = authWrites(mock.calls)[0];
  assert.equal(write.method, 'PUT');
  assert.equal(write.parameters.password, undefined);
  assert.equal(write.parameters.email_confirm, true);
  assert.equal(
    mock.calls.find((call) => call.path.endsWith('hr_begin_staff_account')).parameters.p_action,
    'link',
  );
});

for (const [label, options, expected] of [
  ['non-HR', { denied: true }, 403],
  ['stale profile', { stale: true }, 409],
  ['mismatched actor', { wrongActor: true }, 403],
  ['invalid identity', { invalidIdentity: true }, 401],
]) {
  test(`${label} never reaches administrative Auth writes`, async () => {
    const mock = fixture(options);
    const result = await handleStaffAccounts(request(), settings, mock);
    assert.equal(result.status, expected);
    assert.equal(authWrites(mock.calls).length, 0);
  });
}
test('revocation after reading the target stops the credential write', async () => {
  const mock = fixture({ credentials: true, revokedAfterRead: true });
  const result = await handleStaffAccounts(
    request(
      { request_id: requestId, email: body.email, password, version: 1, membership_version: 1 },
      `/api/admin/staff/${employee}/account`,
      'PATCH',
    ),
    settings,
    mock,
  );
  assert.equal(result.status, 403);
  assert.equal(authWrites(mock.calls).length, 0);
});
test('a completed request is returned without replaying credentials', async () => {
  const mock = fixture({ completed: true });
  assert.equal((await handleStaffAccounts(request(), settings, mock)).status, 200);
  assert.equal(authWrites(mock.calls).length, 0);
});
test('lost Auth response leaves a recoverable operation; status check completes without another Auth write', async () => {
  const mock = fixture({ lostResponse: true });
  const result = await handleStaffAccounts(request(), settings, mock);
  const data = await result.json();
  assert.equal(result.status, 503);
  assert.equal(data.operation_id, requestId);
  const recovered = await handleStaffAccounts(
    request({}, `/api/admin/staff/operations/${requestId}/recover`),
    { ...settings, adminKey: undefined },
    mock,
  );
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).status, 'completed');
  assert.equal(authWrites(mock.calls).length, 1);
});
test('definite rejection closes intent and never reflects upstream credentials', async () => {
  const mock = fixture({ reject: true });
  const result = await handleStaffAccounts(request(), settings, mock);
  const text = await result.text();
  assert.equal(result.status, 422);
  assert.equal(text.includes(password), false);
  assert.equal(text.includes(settings.adminKey), false);
  assert.equal(JSON.parse(text).operation_closed, true);
  assert.ok(mock.calls.some((call) => call.path.endsWith('hr_close_staff_account')));
});
test('an interrupted database completion keeps its operation available for recovery', async () => {
  const mock = fixture({ failCompletion: true });
  const result = await handleStaffAccounts(request(), settings, mock);
  assert.equal(result.status, 503);
  assert.equal((await result.json()).operation_id, requestId);
  assert.equal(
    mock.calls.some((call) => call.path.endsWith('hr_close_staff_account')),
    false,
  );
});
for (const [label, change, status] of [
  ['client-selected HR role', { profile: { ...profile, role: 'hr' } }, 422],
  ['client-selected Auth user', { user_id: account }, 422],
  ['client-selected tenant', { organization_id: organization }, 422],
  ['short password', { password: 'short' }, 422],
  ['unexpected password field in profile', { profile: { ...profile, password } }, 422],
])
  test(`rejects ${label} before elevated access`, async () => {
    const mock = fixture();
    assert.equal(
      (await handleStaffAccounts(request({ ...body, ...change }), settings, mock)).status,
      status,
    );
    assert.equal(authWrites(mock.calls).length, 0);
  });
test('cross-origin, absent-token, oversized and non-JSON requests fail closed', async () => {
  const mock = fixture();
  assert.equal(
    (
      await handleStaffAccounts(
        request(body, undefined, undefined, { Origin: 'https://other.snr-nest.test' }),
        settings,
        mock,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handleStaffAccounts(
        request(body, undefined, undefined, { Authorization: '' }),
        settings,
        mock,
      )
    ).status,
    401,
  );
  assert.equal(
    (await handleStaffAccounts(request({ ...body, padding: 'x'.repeat(9000) }), settings, mock))
      .status,
    413,
  );
  assert.equal(
    (
      await handleStaffAccounts(
        request(body, undefined, undefined, { 'Content-Type': 'text/plain' }),
        settings,
        mock,
      )
    ).status,
    415,
  );
  assert.equal(authWrites(mock.calls).length, 0);
});
test('missing/admin-public keys and insecure project URL cannot produce elevated requests', async () => {
  for (const changes of [
    { adminKey: undefined },
    { adminKey: settings.supabaseKey },
    { supabaseUrl: 'http://untrusted.invalid' },
    { supabaseKey: settings.adminKey },
  ]) {
    const mock = fixture();
    const result = await handleStaffAccounts(request(), { ...settings, ...changes }, mock);
    assert.equal(result.status, 503);
    assert.equal(authWrites(mock.calls).length, 0);
  }
});

test('the Web Request handler serves representative account requests over local HTTP', async () => {
  const mock = fixture();
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const incoming = new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method,
      headers: req.headers,
      body: Buffer.concat(chunks),
    });
    const result = await handleStaffAccounts(incoming, settings, mock);
    res.writeHead(result.status, Object.fromEntries(result.headers));
    res.end(await result.text());
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/staff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fixture-user-token' },
      body: JSON.stringify(body),
    });
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
    assert.equal((await result.json()).employee_id, employee);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
