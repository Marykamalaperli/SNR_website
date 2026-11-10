import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { handleAttendance } from './attendance.js';

const user = 'e1000000-0000-4000-8000-000000000004';
const employee = 'e4000000-0000-4000-8000-000000000004';
const requestId = 'ec000000-0000-4000-8000-000000000001';
const fixture = readFileSync(
  new URL('../../supabase/tests/attendance-photo-qr.sql', import.meta.url),
  'utf8',
);
const image = Buffer.from(fixture.match(/'jpeg_base64','([A-Za-z0-9+/=]+)'/)[1], 'base64');
const hash = createHash('sha256').update(image).digest('hex');
const settings = {
  supabaseUrl: 'https://storage.snr-nest.test',
  supabaseKey: 'sb_publishable_fixture',
  adminKey: 'sb_secret_' + 'fixture_only_'.repeat(3),
};
const photo = {
  jpeg_base64: image.toString('base64'),
  captured_at: new Date().toISOString(),
  consent_version: 'attendance-photo-location-v1',
};
const action = {
  id: requestId,
  employeeId: employee,
  type: 'clock_in',
  previousId: null,
  location: { latitude: 12.97 },
  evidence: { photo },
};
const filename = user + '_2026-11-11_09-30-00.123456_' + requestId + '.jpg';
const path = 'e2000000-0000-4000-8000-000000000001/' + user + '/' + filename;
const intent = {
  intent_id: requestId,
  user_id: user,
  bucket_id: 'attendance-clock-in',
  object_path: path,
  sha256: hash,
};
const receipt = {
  id: 'event',
  storage_saved: true,
  photo_saved: true,
  qr_verified: false,
  qr_required: false,
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function req(body = action, suffix = 'photos', headers = {}) {
  return new Request('https://workspace.snr-nest.test/api/attendance/' + suffix, {
    method: 'POST',
    headers: {
      Origin: 'https://workspace.snr-nest.test',
      Authorization: 'Bearer fixture-user-token',
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
function upstream({
  duplicate = false,
  mismatch = false,
  redirect = false,
  replay = false,
  denied = false,
  verificationNoContent = false,
} = {}) {
  const calls = [];
  return {
    calls,
    fetcher: async (url, options = {}) => {
      const target = new URL(url);
      calls.push({ path: target.pathname, options, origin: target.origin });
      assert.equal(options.redirect, 'manual');
      if (target.pathname === '/auth/v1/user') return json({ id: user });
      if (target.pathname.endsWith('prepare_attendance_photo'))
        return json(replay ? { receipt } : intent);
      if (target.pathname.endsWith('hr_workspace_settings'))
        return denied ? json({ code: 'PT403', message: 'workforce_access_denied' }, 403) : json({});
      if (target.pathname.endsWith('verify_attendance_photo_upload'))
        return verificationNoContent ? new Response(null, { status: 204 }) : json(null);
      if (target.pathname.endsWith('record_attendance_storage')) return json(receipt);
      if (target.pathname.startsWith('/storage/v1/object/')) {
        if (redirect)
          return new Response(null, {
            status: 302,
            headers: { Location: 'https://untrusted.example.invalid/' },
          });
        if (options.method === 'POST') {
          assert.deepEqual(Buffer.from(options.body), image);
          assert.equal(options.headers['x-upsert'], 'false');
          assert.equal(options.headers.apikey, settings.adminKey);
          return duplicate ? json({ error: 'Duplicate' }, 409) : json({ Key: path });
        }
        return new Response(mismatch ? Buffer.from('wrong bytes') : image);
      }
      if (target.hostname === 'maps.app.goo.gl')
        return new Response(null, {
          status: 302,
          headers: { Location: 'https://www.google.com/maps?q=12.971599,77.594566' },
        });
      throw new Error('Unexpected fixture request ' + target.pathname);
    },
  };
}
test('uploads exact photo bytes to the action bucket before verified commit; caller JWT scopes SQL', async () => {
  const fixture = upstream();
  const response = await handleAttendance(req(), settings, fixture);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), receipt);
  assert.deepEqual(
    fixture.calls.map((c) => c.path),
    [
      '/auth/v1/user',
      '/rest/v1/rpc/prepare_attendance_photo',
      '/storage/v1/object/attendance-clock-in/' + path,
      '/rest/v1/rpc/verify_attendance_photo_upload',
      '/rest/v1/rpc/record_attendance_storage',
    ],
  );
  const commit = fixture.calls.at(-1);
  assert.equal(commit.options.headers.Authorization, 'Bearer fixture-user-token');
  assert.equal(fixture.calls[3].options.headers.Authorization, 'Bearer ' + settings.adminKey);
});
test('accepts the no-content verification response before committing attendance', async () => {
  for (const duplicate of [false, true]) {
    const fixture = upstream({ verificationNoContent: true, duplicate });
    const response = await handleAttendance(req(), settings, fixture);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), receipt);
    assert.equal(fixture.calls.at(-1).path, '/rest/v1/rpc/record_attendance_storage');
    assert.equal(
      fixture.calls.filter((call) => call.path.endsWith('record_attendance_storage')).length,
      1,
    );
    assert.equal(fixture.calls.at(-1).options.headers.Authorization, 'Bearer fixture-user-token');
  }
});
test('requires JSON receipts for preparation and commit and never commits after a rejected verification', async () => {
  for (const stage of ['prepare_attendance_photo', 'record_attendance_storage']) {
    const fixture = upstream({ verificationNoContent: true });
    const fetcher = fixture.fetcher;
    fixture.fetcher = (url, options) =>
      new URL(url).pathname.endsWith(stage)
        ? new Response(null, { status: 204 })
        : fetcher(url, options);
    const response = await handleAttendance(req(), settings, fixture);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: { code: 'attendance_request_failed' } });
    if (stage === 'prepare_attendance_photo')
      assert.equal(
        fixture.calls.some((call) => call.path.startsWith('/storage/')),
        false,
      );
  }
  const fixture = upstream();
  const fetcher = fixture.fetcher;
  fixture.fetcher = (url, options) =>
    new URL(url).pathname.endsWith('verify_attendance_photo_upload')
      ? json({ code: 'PT409', message: 'attendance_photo_not_uploaded' }, 409)
      : fetcher(url, options);
  const response = await handleAttendance(req(), settings, fixture);
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: { code: 'attendance_photo_not_uploaded' } });
  assert.equal(
    fixture.calls.some((call) => call.path.endsWith('record_attendance_storage')),
    false,
  );
});
test('an already committed retry does not upload again; duplicate files must match the expected digest', async () => {
  const fixture = upstream({ replay: true });
  assert.equal((await handleAttendance(req(), settings, fixture)).status, 200);
  assert.equal(fixture.calls.length, 2);
  for (const mismatch of [false, true]) {
    const retry = upstream({ duplicate: true, mismatch });
    assert.equal((await handleAttendance(req(), settings, retry)).status, mismatch ? 409 : 200);
    if (mismatch)
      assert.equal(
        retry.calls.some((c) => c.path.endsWith('record_attendance_storage')),
        false,
      );
  }
});
test('cross-origin, invalid JPEG, missing server binding and upstream redirects cannot create attendance', async () => {
  assert.equal(
    (
      await handleAttendance(
        req(action, 'photos', { Origin: 'https://evil.example.invalid' }),
        settings,
        upstream(),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handleAttendance(
        req({ ...action, evidence: { photo: { jpeg_base64: 'bm90LWltYWdl' } } }),
        settings,
        upstream(),
      )
    ).status,
    422,
  );
  assert.equal(
    (await handleAttendance(req(), { ...settings, adminKey: '' }, upstream())).status,
    503,
  );
  const fixture = upstream({ redirect: true });
  assert.equal((await handleAttendance(req(), settings, fixture)).status, 503);
  assert.ok(fixture.calls.every((c) => c.origin === settings.supabaseUrl));
  assert.equal(
    fixture.calls.some((c) => c.path.endsWith('record_attendance_storage')),
    false,
  );
});
test('HR-only map resolution follows approved redirects without forwarding any credentials', async () => {
  const fixture = upstream();
  const response = await handleAttendance(
    req({ url: 'https://maps.app.goo.gl/fixture' }, 'resolve-map-link'),
    settings,
    fixture,
  );
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).latitude, 12.971599);
  assert.equal(fixture.calls.at(-1).options.headers, undefined);
  const denied = upstream({ denied: true });
  assert.equal(
    (
      await handleAttendance(
        req({ url: 'https://maps.app.goo.gl/fixture' }, 'resolve-map-link'),
        settings,
        denied,
      )
    ).status,
    403,
  );
  assert.equal(
    denied.calls.some((c) => c.origin.includes('google')),
    false,
  );
  const attack = upstream();
  attack.fetcher = async (url, options) =>
    new URL(url).hostname === 'maps.app.goo.gl'
      ? new Response(null, { status: 302, headers: { Location: 'https://127.0.0.1/private' } })
      : fixture.fetcher(url, options);
  const failed = await handleAttendance(
    req({ url: 'https://maps.app.goo.gl/fixture' }, 'resolve-map-link'),
    settings,
    attack,
  );
  assert.notEqual(failed.status, 200);
});
