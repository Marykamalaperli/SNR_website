import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { delimiter, join } from 'node:path';

// Run with npm exec --package=wrangler@4.158.0 -- node scripts/test-worker-runtime.mjs.
// Use that pinned Wrangler's runtime; no new application dependency is needed.
let wranglerEntry;
for (const directory of (process.env.PATH || '').split(delimiter)) {
  if (!directory) continue;
  try {
    wranglerEntry = await realpath(join(directory, 'wrangler'));
    break;
  } catch {
    // Continue searching npm exec's PATH.
  }
}
assert.ok(wranglerEntry, 'Run this check through the pinned Wrangler npm exec command.');
const { Miniflare, Response: RuntimeResponse } = createRequire(wranglerEntry)('miniflare');

const actor = '91000000-0000-4000-8000-000000000001';
const account = '91000000-0000-4000-8000-000000000002';
const organization = '92000000-0000-4000-8000-000000000001';
const employee = '93000000-0000-4000-8000-000000000001';
const operation = '94000000-0000-4000-8000-000000000001';
const context = {
  operation_id: operation,
  actor_user_id: actor,
  organization_id: organization,
  lease_token: '95000000-0000-4000-8000-000000000001',
  email: 'runtime-person@example.invalid',
  status: 'pending',
};
const settings = {
  supabaseUrl: 'https://runtime-fixture.snr-nest.test',
  supabaseKey: 'sb_publishable_runtime_fixture',
  adminKey: `sb_secret_${'runtime_fixture_only_'.repeat(3)}`,
};
const body = {
  request_id: operation,
  email: context.email,
  password: 'Synthetic-Runtime-Password-17',
  profile: {
    display_name: 'Runtime Person',
    employee_number: 'RUNTIME-1',
    site_id: '96000000-0000-4000-8000-000000000001',
    department_id: '97000000-0000-4000-8000-000000000001',
    role: 'employee',
    active: true,
  },
};
const handler = await readFile(new URL('../server/staffAccounts.js', import.meta.url), 'utf8');
const config = await readFile(new URL('./public-auth-config.mjs', import.meta.url), 'utf8');
const entry = `import { handleStaffAccounts } from './server/staffAccounts.js';
export default { fetch(request) { return handleStaffAccounts(request, ${JSON.stringify(settings)}); } };`;

for (const compatibilityDate of ['2021-11-02', '2026-11-07']) {
  let redirectPath;
  let calls = [];
  const runtime = new Miniflare({
    workers: [
      {
        config: {
          name: 'account-runtime-check',
          compatibilityDate,
          manifest: {
            mainModule: 'worker.js',
            modules: {
              'worker.js': { type: 'esm', contents: entry },
              'server/staffAccounts.js': { type: 'esm', contents: handler },
              'scripts/public-auth-config.mjs': { type: 'esm', contents: config },
            },
          },
        },
        dev: {
          // All outbound requests terminate in this synthetic fixture. No live
          // Supabase project, real account, credentials or network is used.
          outboundService: {
            type: 'fetcher',
            handler: async (request) => {
              const url = new URL(request.url);
              const path = url.pathname;
              const call = { origin: url.origin, path, method: request.method };
              calls.push(call);
              if (url.origin !== settings.supabaseUrl)
                return RuntimeResponse.json({ unexpected_destination: true }, { status: 502 });
              const data = request.method === 'GET' ? null : await request.json();
              call.data = data;
              if (path === redirectPath)
                return new RuntimeResponse(null, {
                  status: 307,
                  headers: { Location: 'https://unexpected.example.invalid/collect' },
                });
              const json = (value) => RuntimeResponse.json(value);
              if (path === '/auth/v1/user') return json({ id: actor });
              if (path === '/rest/v1/rpc/hr_begin_staff_account') return json(context);
              if (path === '/rest/v1/rpc/hr_staff_account_context') return json(context);
              if (path === '/auth/v1/admin/users') {
                assert.equal(request.headers.get('apikey'), settings.adminKey);
                assert.equal(data.app_metadata.snr_admin_operation, operation);
                return json({ id: account, email: context.email });
              }
              if (path === '/rest/v1/rpc/hr_complete_staff_account')
                return json({ status: 'completed', employee_id: employee });
              assert.fail(`Unexpected synthetic upstream path: ${path}`);
            },
          },
        },
      },
    ],
  });
  const create = () =>
    runtime.dispatchFetch('https://workspace.snr-nest.test/api/admin/staff', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://workspace.snr-nest.test',
        Authorization: 'Bearer runtime-fixture-user-token',
      },
      body: JSON.stringify(body),
    });
  try {
    const success = await create();
    const result = await success.json();
    assert.equal(
      success.status,
      200,
      `Account creation in Worker ${compatibilityDate}: ${JSON.stringify(result)}`,
    );
    assert.deepEqual(result, { status: 'completed', employee_id: employee });
    assert.equal(calls.filter((call) => call.path === '/auth/v1/admin/users').length, 1);
    console.log(`PASS Worker ${compatibilityDate}: authenticated account and profile creation`);

    for (const path of ['/auth/v1/user', '/auth/v1/admin/users']) {
      redirectPath = path;
      calls = [];
      const redirected = await create();
      const result = await redirected.json();
      assert.equal(redirected.status, 503);
      assert.equal(result.error.code, 'upstream_unavailable');
      assert.equal(result.operation_id, path === '/auth/v1/admin/users' ? operation : undefined);
      assert.equal(
        calls.every((call) => call.origin === settings.supabaseUrl),
        true,
        'Neither caller nor administrative credentials may follow a redirect',
      );
      assert.equal(calls.at(-1).path, path);
      assert.equal(
        calls.some((call) => call.path.includes('complete_staff_account')),
        false,
      );
      console.log(`PASS Worker ${compatibilityDate}: upstream redirect refused at ${path}`);
    }
  } finally {
    await runtime.dispose();
  }
}
