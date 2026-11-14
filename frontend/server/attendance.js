import { handleSecurityIdentity } from './securityIdentity.js';
import { readPublicAuthConfig } from '../scripts/public-auth-config.mjs';
import { checkedMapUrl, parseStoreMapLink } from '../src/services/storeMapLink.js';

class Failure extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hex = (bytes) =>
  [...new Uint8Array(bytes)].map((n) => n.toString(16).padStart(2, '0')).join('');
const digest = async (bytes) => hex(await crypto.subtle.digest('SHA-256', bytes));
async function readBytes(response, limit) {
  const reader = response.body?.getReader();
  if (!reader) throw new Failure(422, 'invalid_attendance_photo');
  const chunks = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Failure(413, 'invalid_attendance_photo');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex,nofollow',
    },
  });
}
function adminKey(value) {
  if (/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(value || '')) return true;
  try {
    return (
      JSON.parse(atob(value.split('.')[1].replaceAll('-', '+').replaceAll('_', '/'))).role ===
      'service_role'
    );
  } catch {
    return false;
  }
}
export async function handleAttendance(request, settings, { fetcher = fetch } = {}) {
  try {
    const url = new URL(request.url);
    if (request.method !== 'POST') throw new Failure(405, 'method_not_allowed');
    if (request.headers.has('Origin') && request.headers.get('Origin') !== url.origin)
      throw new Failure(403, 'origin_denied');
    const identityOperation = url.pathname.startsWith('/api/attendance/identity/')
      ? url.pathname.split('/').at(-1)
      : null;
    const securityMode = [
      '/api/attendance/security/workspace',
      '/api/attendance/security/location',
      '/api/attendance/security/photos',
      '/api/attendance/security/check-photos',
    ].includes(url.pathname);
    const stationMode = url.pathname === '/api/attendance/station/workspace';
    if (url.pathname.startsWith('/api/attendance/qr/')) throw new Failure(401, 'sign_in_required');
    if (
      !securityMode &&
      !stationMode &&
      ![
        'register-options',
        'register-verify',
        'assert-options',
        'assert-verify',
        'station-options',
        'station-verify',
      ].includes(identityOperation) &&
      !['/api/attendance/photos', '/api/attendance/resolve-map-link'].includes(url.pathname)
    )
      throw new Failure(404, 'not_found');
    const authorization = request.headers.get('Authorization') || '';
    if (!/^Bearer [A-Za-z0-9_.-]{10,12000}$/.test(authorization))
      throw new Failure(401, 'sign_in_required');
    const config = readPublicAuthConfig({
      VITE_SUPABASE_URL: settings.supabaseUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: settings.supabaseKey,
    });
    if (!config.supabaseUrl) throw new Failure(503, 'attendance_upload_unavailable');
    const deadline = Date.now() + 28000;
    async function upstream(path, options = {}, elevated = false) {
      const key = elevated ? settings.adminKey : config.supabaseKey;
      const result = await fetcher(config.supabaseUrl + path, {
        ...options,
        redirect: 'manual',
        headers: {
          apikey: key,
          Authorization: elevated ? 'Bearer ' + key : authorization,
          ...options.headers,
        },
        signal: AbortSignal.timeout(Math.max(1, Math.min(8000, deadline - Date.now()))),
      });
      if (result.status >= 300 && result.status < 400)
        throw new Failure(503, 'attendance_upload_unavailable');
      return result;
    }
    async function rpc(
      name,
      body,
      { elevated = false, allowNoContent = false, callerAuthorization = null } = {},
    ) {
      const result = await upstream(
        '/rest/v1/rpc/' + name,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(callerAuthorization ? { Authorization: callerAuthorization } : {}),
          },
          body: JSON.stringify(body),
        },
        elevated,
      );
      // PostgREST returns 204 for a void RPC. Only upload verification has that
      // contract; preparation and commit must still return their JSON receipts.
      if (result.status === 204 && allowNoContent) return null;
      const data = await result.json();
      if (!result.ok) {
        const status = /^PT(401|403|404|409|422|429)$/.test(data.code)
          ? Number(data.code.slice(2))
          : 503;
        // Machine codes are bounded; provider bodies, keys and payloads never escape.
        throw new Failure(
          status,
          /^[a-z_]{1,70}$/.test(data.message || '') ? data.message : 'attendance_request_failed',
        );
      }
      return data;
    }
    const identityResponse = await upstream('/auth/v1/user');
    const identity = await identityResponse.json();
    if (!identityResponse.ok || !uuid.test(identity.id || ''))
      throw new Failure(401, 'sign_in_required');
    if (!request.headers.get('Content-Type')?.startsWith('application/json'))
      throw new Failure(415, 'json_required');
    const bytes = await readBytes(
      request,
      url.pathname.endsWith('/resolve-map-link') ? 5000 : 215000,
    );
    let body;
    try {
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new Failure(422, 'invalid_request');
    }
    if (identityOperation) {
      if (!adminKey(settings.adminKey)) throw new Failure(503, 'attendance_upload_unavailable');
      return json(
        await handleSecurityIdentity(identityOperation, { body, rpc, url, userId: identity.id }),
      );
    }
    if (stationMode) {
      if (!adminKey(settings.adminKey)) throw new Failure(503, 'attendance_upload_unavailable');
      const guard = await rpc('security_station_context', { p_flow_id: body.flowId });
      if (guard.user_id !== identity.id) throw new Failure(403, 'station_operator_required');
      const employeeAuthorization = request.headers.get('X-Employee-Authorization') || '';
      if (!/^Bearer [A-Za-z0-9_.-]{10,12000}$/.test(employeeAuthorization))
        throw new Failure(401, 'sign_in_required');
      const result = await upstream('/auth/v1/user', {
        headers: { Authorization: employeeAuthorization },
      });
      const employee = await result.json();
      if (!result.ok || !uuid.test(employee.id || '')) throw new Failure(401, 'sign_in_required');
      if (employee.id === identity.id)
        throw new Failure(403, 'station_different_employee_required');
      const employeeRpc = (name, parameters) =>
        rpc(name, parameters, { callerAuthorization: employeeAuthorization });
      const workspace = await employeeRpc('security_attendance_workspace', {
        p_client_id: body.clientId,
      });
      const context = await employeeRpc('security_station_employee_context', {
        p_flow_id: workspace.security_flow_id,
      });
      if (context.user_id !== employee.id) throw new Failure(403, 'workforce_access_denied');
      const visit = await rpc(
        'open_security_station_visit',
        {
          p_operator_flow_id: guard.flow_id,
          p_operator_user_id: identity.id,
          p_employee_flow_id: context.flow_id,
          p_employee_user_id: employee.id,
        },
        { elevated: true },
      );
      return json({
        ...visit,
        workspace: { ...workspace, employee_number: context.employee_number },
      });
    }
    if (securityMode && url.pathname.endsWith('/workspace'))
      return json(await rpc('security_attendance_workspace', { p_client_id: body.clientId }));
    if (securityMode && url.pathname.endsWith('/location'))
      return json(
        await rpc('security_attendance_location', {
          p_flow_id: body.flowId,
          p_employee_id: body.employeeId,
          p_event_type: body.type,
          p_previous_event_id: body.previousId || null,
          p_location: body.location,
        }),
      );
    const presenceMode = securityMode && url.pathname.endsWith('/check-photos');
    if (url.pathname.endsWith('/resolve-map-link')) {
      await rpc('hr_workspace_settings', {});
      let link = checkedMapUrl(body.url); // Never forward session headers to maps.
      for (let i = 0; i < 5; i++) {
        const point = parseStoreMapLink(link.href);
        if (point) return json(point);
        const result = await fetcher(link.href, {
          method: 'GET',
          redirect: 'manual',
          signal: AbortSignal.timeout(4000),
        });
        const next = result.headers.get('Location');
        await result.body?.cancel();
        if (!next || result.status < 300 || result.status >= 400) break;
        link = checkedMapUrl(new URL(next, link).href);
      }
      throw new Failure(422, 'map_coordinates_unavailable');
    }
    if (!adminKey(settings.adminKey)) throw new Failure(503, 'attendance_upload_unavailable');
    if (
      !uuid.test(body.id || '') ||
      !uuid.test(body.employeeId || '') ||
      !(presenceMode
        ? body.type === 'security_check'
        : ['clock_in', 'clock_out'].includes(body.type))
    )
      throw new Failure(422, 'invalid_request');
    const action = {
      id: body.id,
      employeeId: body.employeeId,
      previousId: body.previousId || null,
      type: body.type,
      location: body.location,
      evidence: body.evidence,
      ...(presenceMode ? { checkId: body.checkId } : {}),
    };
    const encoded = action.evidence?.photo?.jpeg_base64;
    if (
      typeof encoded !== 'string' ||
      encoded.length > 204800 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
    )
      throw new Failure(422, 'invalid_attendance_photo');
    let image;
    try {
      image = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    } catch {
      throw new Failure(422, 'invalid_attendance_photo');
    }
    if (
      image.length < 32 ||
      image.length > 153600 ||
      image[0] !== 255 ||
      image[1] !== 216 ||
      image[image.length - 1] !== 217
    )
      throw new Failure(422, 'invalid_attendance_photo');
    // PostgreSQL validates JPEG structure, consent, shutter fix and expected
    // employee/state, and derives a unique bucket/path and immutable intent.
    const intent = securityMode
      ? await rpc(
          presenceMode ? 'prepare_security_presence_photo' : 'prepare_security_attendance_photo',
          {
            p_flow_id: body.flowId,
            p_identity_id: body.identityId,
            p_action: action,
          },
        )
      : await rpc('prepare_attendance_photo', { p_action: action });
    if (intent.receipt) return json(intent.receipt);
    const expectedBucket = presenceMode
      ? 'attendance-security-checks'
      : body.type === 'clock_in'
        ? 'attendance-clock-in'
        : 'attendance-clock-out';
    const path = intent.object_path;
    const legacyPath = new RegExp(
      '^[0-9a-f-]{36}/' +
        identity.id +
        '/' +
        identity.id +
        '_[0-9-]+_[0-9.-]+_' +
        body.id +
        '[.]jpg$',
    );
    const namedPath = new RegExp(
      '^(\\d{4}-\\d{2}-\\d{2})/[A-Za-z0-9][A-Za-z0-9_]{0,79}_\\1_' +
        '\\d{2}-\\d{2}-\\d{2}[.]\\d{6}_' +
        body.id +
        '[.]jpg$',
    );
    if (
      intent.user_id !== identity.id ||
      intent.intent_id !== body.id ||
      intent.bucket_id !== expectedBucket ||
      typeof path !== 'string' ||
      !(legacyPath.test(path) || namedPath.test(path)) ||
      intent.sha256 !== (await digest(image))
    )
      throw new Failure(503, 'attendance_upload_unavailable');
    const object = '/storage/v1/object/' + expectedBucket + '/' + path;
    const uploaded = await upstream(
      object,
      {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'false', 'cache-control': 'no-store' },
        body: image,
      },
      true,
    );
    if (!uploaded.ok) {
      const detail = await uploaded.json().catch(() => ({}));
      if (uploaded.status !== 409 && detail.error !== 'Duplicate' && detail.code !== 'Duplicate')
        throw new Failure(503, 'attendance_upload_unavailable');
      const existing = await upstream(
        object.replace('/object/', '/object/authenticated/'),
        {},
        true,
      );
      if (!existing.ok || (await digest(await readBytes(existing, 153600))) !== intent.sha256)
        throw new Failure(409, 'attendance_request_changed');
    } else {
      await uploaded.body?.cancel();
    }
    await rpc(
      presenceMode ? 'verify_security_presence_upload' : 'verify_attendance_photo_upload',
      { p_intent_id: intent.intent_id, p_sha256: intent.sha256 },
      { elevated: true, allowNoContent: true },
    );
    const receipt = presenceMode
      ? await rpc('commit_security_presence', { p_flow_id: body.flowId, p_id: body.id })
      : await rpc('record_attendance_storage', {
          p_request_id: body.id,
          p_employee_id: body.employeeId,
        });
    return json(receipt);
  } catch (failure) {
    return json(
      {
        error: {
          code:
            failure instanceof Failure
              ? failure.code
              : failure.securityCode === 'attendance_passkey_required'
                ? failure.securityCode
                : 'attendance_request_failed',
        },
      },
      failure instanceof Failure
        ? failure.status
        : failure.securityCode === 'attendance_passkey_required'
          ? 403
          : 503,
    );
  }
}
