import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';
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
const { build } = createRequire(wranglerEntry)('esbuild');
const identityBundle = await build({
  entryPoints: [new URL('../server/securityIdentity.js', import.meta.url).pathname],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
});

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
const attendanceHandler = await readFile(
  new URL('../server/attendance.js', import.meta.url),
  'utf8',
);
const mapParser = await readFile(
  new URL('../src/services/storeMapLink.js', import.meta.url),
  'utf8',
);
const photoFixture = await readFile(
  new URL('../../supabase/tests/attendance-photo-qr.sql', import.meta.url),
  'utf8',
);
const photoBytes = Buffer.from(
  photoFixture.match(/'jpeg_base64','([A-Za-z0-9+/=]+)'/)[1],
  'base64',
);
const photoHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', photoBytes))]
  .map((n) => n.toString(16).padStart(2, '0'))
  .join('');
const photoPath = '2026-11-11/Runtime_Person_2026-11-11_09-30-00.000000_' + operation + '.jpg';
const config = await readFile(new URL('./public-auth-config.mjs', import.meta.url), 'utf8');
const identityKeys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const identityJwk = identityKeys.publicKey.export({ format: 'jwk' });
const identityCose = isoCBOR.encode(
  new Map([
    [1, 2],
    [3, -7],
    [-1, 1],
    [-2, new Uint8Array(Buffer.from(identityJwk.x, 'base64url'))],
    [-3, new Uint8Array(Buffer.from(identityJwk.y, 'base64url'))],
  ]),
);
const identityCredential = {
  id: Buffer.alloc(32, 7).toString('base64url'),
  public_key: Buffer.from(identityCose).toString('base64url'),
  counter: 0,
  transports: ['internal'],
  rp_id: 'workspace.snr-nest.test',
};
const identityNonce = Buffer.alloc(32, 9).toString('base64url');
const identityHash = (bytes) => createHash('sha256').update(bytes).digest();
function identityAssertion(origin = 'https://workspace.snr-nest.test') {
  const client = Buffer.from(
    JSON.stringify({ type: 'webauthn.get', challenge: identityNonce, origin }),
  );
  const auth = Buffer.concat([
    identityHash('workspace.snr-nest.test'),
    Buffer.from([5, 0, 0, 0, 1]),
  ]);
  return {
    id: identityCredential.id,
    rawId: identityCredential.id,
    type: 'public-key',
    clientExtensionResults: {},
    response: {
      clientDataJSON: client.toString('base64url'),
      authenticatorData: auth.toString('base64url'),
      signature: sign(
        'sha256',
        Buffer.concat([auth, identityHash(client)]),
        identityKeys.privateKey,
      ).toString('base64url'),
    },
  };
}
const entry = `import { handleStaffAccounts } from './server/staffAccounts.js';
import { handleAttendance } from './server/attendance.js';
export default { fetch(request) { return new URL(request.url).pathname.startsWith('/api/attendance/') ? handleAttendance(request, ${JSON.stringify(settings)}) : handleStaffAccounts(request, ${JSON.stringify(settings)}); } };`;

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
              'server/attendance.js': { type: 'esm', contents: attendanceHandler },
              'server/securityIdentity.js': {
                type: 'esm',
                contents: identityBundle.outputFiles[0].text,
              },
              'src/services/storeMapLink.js': { type: 'esm', contents: mapParser },
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
              const data =
                request.method === 'GET'
                  ? null
                  : request.headers.get('Content-Type') === 'image/jpeg'
                    ? await request.arrayBuffer()
                    : await request.json();
              call.data = data;
              if (path === redirectPath)
                return new RuntimeResponse(null, {
                  status: 307,
                  headers: { Location: 'https://unexpected.example.invalid/collect' },
                });
              const json = (value) => RuntimeResponse.json(value);
              if (path === '/auth/v1/user') return json({ id: actor });
              if (path === '/rest/v1/rpc/employee_qr_attendance_gateway') {
                assert.equal(request.headers.get('apikey'), settings.adminKey);
                assert.equal(data.p_token, '98000000-0000-4000-8000-000000000001');
                if (data.p_operation === 'context')
                  return json({ user_id: actor, employee_id: employee });
                if (data.p_operation === 'prepare')
                  return json({
                    intent_id: operation,
                    user_id: actor,
                    bucket_id: 'attendance-clock-in',
                    object_path: photoPath,
                    sha256: photoHash,
                  });
                if (data.p_operation === 'commit')
                  return json({ id: operation, storage_saved: true, employee_qr_verified: true });
                assert.fail('Unexpected QR operation');
              }
              if (path === '/rest/v1/rpc/security_identity_context')
                return json({ user_id: actor, display_name: 'Runtime Employee', credential: null });
              if (path === '/rest/v1/rpc/security_identity_challenge')
                return json({
                  id: operation,
                  user_id: actor,
                  kind: 'punch',
                  challenge: identityNonce,
                  rp_id: 'workspace.snr-nest.test',
                  credential: identityCredential,
                });
              if (path === '/rest/v1/rpc/complete_security_identity') {
                assert.equal(request.headers.get('apikey'), settings.adminKey);
                assert.equal(data.p_counter, 1);
                return json({ id: operation, status: 'verified' });
              }
              if (path === '/rest/v1/rpc/security_begin_identity')
                return json({
                  id: operation,
                  challenge: identityNonce,
                  expires_at: new Date(Date.now() + 120000).toISOString(),
                });
              if (
                path === '/rest/v1/rpc/prepare_attendance_photo' ||
                path === '/rest/v1/rpc/prepare_security_attendance_photo'
              )
                return json({
                  intent_id: operation,
                  user_id: actor,
                  bucket_id: 'attendance-clock-in',
                  object_path: photoPath,
                  sha256: photoHash,
                });
              if (path === '/storage/v1/object/attendance-clock-in/' + photoPath) {
                assert.deepEqual(Buffer.from(data), photoBytes);
                assert.equal(request.headers.get('apikey'), settings.adminKey);
                return json({ Key: photoPath });
              }
              if (path === '/rest/v1/rpc/verify_attendance_photo_upload') {
                assert.equal(request.headers.get('apikey'), settings.adminKey);
                assert.equal(request.headers.get('Authorization'), 'Bearer ' + settings.adminKey);
                return new RuntimeResponse(null, { status: 204 });
              }
              if (path === '/rest/v1/rpc/record_attendance_storage') {
                assert.equal(request.headers.get('Authorization'), 'Bearer fixture-user-token');
                return json({ id: operation, storage_saved: true });
              }
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
    redirectPath = undefined;
    calls = [];
    const uploaded = await runtime.dispatchFetch(
      'https://workspace.snr-nest.test/api/attendance/photos',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fixture-user-token' },
        body: JSON.stringify({
          id: operation,
          employeeId: employee,
          type: 'clock_in',
          previousId: null,
          location: { latitude: 12.97 },
          evidence: {
            photo: {
              jpeg_base64: photoBytes.toString('base64'),
              captured_at: new Date().toISOString(),
              consent_version: 'attendance-photo-location-v1',
            },
          },
        }),
      },
    );
    assert.equal(uploaded.status, 200);
    assert.equal((await uploaded.json()).storage_saved, true);
    assert.ok(
      calls.some((call) => call.path === '/storage/v1/object/attendance-clock-in/' + photoPath),
    );
    console.log(
      'PASS Worker ' +
        compatibilityDate +
        ': verified private attendance photo upload and caller-scoped commit',
    );
    calls = [];
    const retired = await runtime.dispatchFetch(
      'https://workspace.snr-nest.test/api/attendance/qr/photos',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrToken: '98000000-0000-4000-8000-000000000001' }),
      },
    );
    assert.equal(retired.status, 401);
    assert.equal(calls.length, 0);
    console.log(`PASS Worker ${compatibilityDate}: bearer QR attendance is disabled`);
    const options = await runtime.dispatchFetch(
      'https://workspace.snr-nest.test/api/attendance/identity/register-options',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fixture-user-token' },
        body: JSON.stringify({ flowId: 'flow' }),
      },
    );
    assert.equal(options.status, 200);
    const ceremony = await options.json();
    assert.equal(ceremony.options.authenticatorSelection.userVerification, 'required');
    assert.equal(ceremony.options.rp.id, 'workspace.snr-nest.test');
    console.log(
      `PASS Worker ${compatibilityDate}: WebAuthn enrollment uses native cryptography and required UV`,
    );
    const signed = await runtime.dispatchFetch(
      'https://workspace.snr-nest.test/api/attendance/identity/assert-verify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fixture-user-token' },
        body: JSON.stringify({
          flowId: 'flow',
          challengeId: operation,
          response: identityAssertion(),
        }),
      },
    );
    assert.equal(signed.status, 200);
    assert.equal((await signed.json()).status, 'verified');
    calls = [];
    const wrongOrigin = await runtime.dispatchFetch(
      'https://workspace.snr-nest.test/api/attendance/identity/assert-verify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fixture-user-token' },
        body: JSON.stringify({
          flowId: 'flow',
          challengeId: operation,
          response: identityAssertion('https://phishing.invalid'),
        }),
      },
    );
    assert.equal(wrongOrigin.status, 403);
    assert.equal(
      calls.some((call) => call.path.endsWith('complete_security_identity')),
      false,
    );
    console.log(
      `PASS Worker ${compatibilityDate}: WebAuthn signature verified; wrong origin refused`,
    );
  } finally {
    await runtime.dispose();
  }
}
