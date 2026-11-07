import { readPublicAuthConfig } from '../scripts/public-auth-config.mjs';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const safeMessages = {
  account_not_found: 'No account uses this email. Choose “Create new account” to set it up.',
  record_changed: 'This record changed. Close the form, refresh the directory and try again.',
  employee_exists: 'This employee number or account already has a profile.',
  account_already_exists:
    'This email already has an account. Choose “Link existing account” to add its profile.',
  account_unavailable: 'This account cannot be managed in this organization.',
  protected_account: 'This account has a protected role and cannot be changed here.',
  choose_organization_records: 'Choose a site and department in this organization.',
  pending_account_change:
    'An account request is already pending. Review Pending account requests in the directory.',
  operation_in_progress:
    'This request is still processing. Check Pending account requests again shortly.',
  operation_changed:
    'The request changed. Review its pending status before starting another request.',
  operation_closed: 'This request has ended. Refresh the directory and start a new request.',
  account_change_not_confirmed:
    'The account change is not confirmed yet. Check Pending account requests.',
  account_rate_limit: 'Too many account requests. Wait a minute before trying again.',
};

class Failure extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
const unavailable = () =>
  new Failure(
    503,
    'account_management_unavailable',
    'Account management is not available yet. Contact your workspace administrator.',
  );
function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
function fromRpc(error = {}) {
  const status = /^PT(401|403|404|409|422|429)$/.test(error.code)
    ? Number(error.code.slice(2))
    : 503;
  const known = Object.hasOwn(safeMessages, error.message);
  return new Failure(
    status,
    known ? error.message : status === 403 ? 'access_denied' : 'account_request_failed',
    known
      ? safeMessages[error.message]
      : status === 403
        ? 'Your account does not have access to this action.'
        : status === 401
          ? 'Please sign in again.'
          : status === 422
            ? 'Check the fields and try again.'
            : 'The account request could not be completed. Please try again.',
  );
}
function isAdminKey(key) {
  if (typeof key !== 'string') return false;
  if (/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(key)) return true;
  try {
    return (
      key.split('.').length === 3 &&
      JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role ===
        'service_role'
    );
  } catch {
    return false;
  }
}
async function readBody(request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))
    throw new Failure(415, 'json_required', 'Send this form as JSON.');
  const reader = request.body?.getReader();
  if (!reader) throw new Failure(400, 'invalid_request', 'Check the fields and try again.');
  let length = 0;
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 8192) {
      await reader.cancel();
      throw new Failure(413, 'request_too_large', 'This form is too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new Failure(400, 'invalid_request', 'Check the fields and try again.');
  }
}
function cleanInput(body, action) {
  const allowed =
    action !== 'credentials'
      ? ['request_id', 'email', 'password', 'profile', 'account_mode']
      : ['request_id', 'email', 'password', 'version', 'membership_version'];
  if (
    Object.keys(body).some((key) => !allowed.includes(key)) ||
    (body.account_mode !== undefined && !['create', 'existing'].includes(body.account_mode)) ||
    !uuid.test(body.request_id) ||
    typeof body.email !== 'string' ||
    body.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
  )
    throw new Failure(422, 'invalid_fields', 'Check the email and required fields.');
  if (action === 'create' || body.password !== undefined) {
    if (
      typeof body.password !== 'string' ||
      body.password.length < 12 ||
      body.password.length > 64 ||
      new TextEncoder().encode(body.password).length > 72
    )
      throw new Failure(422, 'invalid_password', 'Choose a password of 12–64 characters.');
  }
  if (
    action === 'credentials' &&
    (!Number.isInteger(body.version) ||
      body.version < 1 ||
      !Number.isInteger(body.membership_version) ||
      body.membership_version < 1)
  )
    throw new Failure(422, 'invalid_fields', 'Refresh the employee record and try again.');
  if (action !== 'credentials') {
    const p = body.profile;
    if (
      !p ||
      typeof p !== 'object' ||
      Array.isArray(p) ||
      Object.keys(p).some(
        (key) =>
          ![
            'display_name',
            'employee_number',
            'site_id',
            'department_id',
            'role',
            'active',
          ].includes(key),
      ) ||
      typeof p.display_name !== 'string' ||
      p.display_name.trim().length < 1 ||
      p.display_name.trim().length > 120 ||
      typeof p.employee_number !== 'string' ||
      p.employee_number.trim().length < 1 ||
      p.employee_number.trim().length > 40 ||
      !uuid.test(p.site_id) ||
      !uuid.test(p.department_id) ||
      !['employee', 'supervisor'].includes(p.role) ||
      typeof p.active !== 'boolean'
    )
      throw new Failure(
        422,
        'invalid_fields',
        'Check the employee details, role, site and department.',
      );
    body.profile = {
      display_name: p.display_name.trim(),
      employee_number: p.employee_number.trim(),
      site_id: p.site_id.toLowerCase(),
      department_id: p.department_id.toLowerCase(),
      role: p.role,
      active: p.active,
    };
  }
  return { ...body, request_id: body.request_id.toLowerCase(), email: body.email.trim() };
}
async function fingerprint(key, body, action, target) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const canonical = JSON.stringify([
    action,
    target,
    body.request_id,
    body.email,
    body.password || null,
    body.profile || null,
    body.version || null,
    body.membership_version || null,
  ]);
  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(canonical),
  );
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

export async function handleStaffAccounts(
  request,
  settings,
  { fetcher = fetch, now = Date.now } = {},
) {
  let operation = null;
  let rpc;
  try {
    const url = new URL(request.url);
    if (request.headers.has('Origin') && request.headers.get('Origin') !== url.origin)
      throw new Failure(403, 'origin_denied', 'This request must come from your workspace.');
    const create = url.pathname === '/api/admin/staff';
    const edit = url.pathname.match(/^\/api\/admin\/staff\/([a-f0-9-]{36})\/account$/i);
    const recover = url.pathname.match(
      /^\/api\/admin\/staff\/operations\/([a-f0-9-]{36})\/recover$/i,
    );
    if (!create && !edit && !recover)
      throw new Failure(404, 'not_found', 'This account action is not available.');
    if (request.method !== (edit ? 'PATCH' : 'POST'))
      throw new Failure(405, 'method_not_allowed', 'This method is not supported.');
    const authorization = request.headers.get('Authorization') || '';
    if (!/^Bearer [A-Za-z0-9_.-]{10,12000}$/.test(authorization))
      throw new Failure(401, 'sign_in_required', 'Please sign in again.');
    let config;
    try {
      config = readPublicAuthConfig({
        VITE_SUPABASE_URL: settings.supabaseUrl,
        VITE_SUPABASE_PUBLISHABLE_KEY: settings.supabaseKey,
      });
    } catch {
      throw unavailable();
    }
    if (!config.supabaseUrl || !config.supabaseKey) throw unavailable();
    const deadline = now() + 25000;
    async function upstream(path, method, body, admin = false) {
      if (now() >= deadline)
        throw new Failure(
          503,
          'request_interrupted',
          'The request was interrupted. Check Pending account requests before trying again.',
        );
      let result;
      try {
        result = await fetcher(`${config.supabaseUrl}${path}`, {
          method,
          redirect: 'error',
          headers: {
            apikey: admin ? settings.adminKey : config.supabaseKey,
            Authorization: admin ? `Bearer ${settings.adminKey}` : authorization,
            'Content-Type': 'application/json',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(Math.max(1, Math.min(8000, deadline - now()))),
        });
      } catch {
        throw new Failure(
          503,
          'request_interrupted',
          'The request was interrupted. Check Pending account requests before trying again.',
        );
      }
      let data;
      try {
        data = await result.json();
      } catch {
        throw new Failure(
          503,
          'upstream_unavailable',
          'Account management could not be reached. Please try again.',
        );
      }
      return { result, data };
    }
    rpc = async (name, params = {}) => {
      const { result, data } = await upstream(`/rest/v1/rpc/${name}`, 'POST', params);
      if (!result.ok) throw fromRpc(data);
      return data;
    };
    const identity = await upstream('/auth/v1/user', 'GET');
    if (!identity.result.ok || !uuid.test(identity.data?.id))
      throw new Failure(401, 'sign_in_required', 'Please sign in again.');
    if (recover) {
      if (!uuid.test(recover[1]))
        throw new Failure(422, 'invalid_fields', 'Check the account request.');
      return response(await rpc('hr_recover_staff_account', { p_request_id: recover[1] }));
    }
    if (!isAdminKey(settings.adminKey)) throw unavailable();
    const input = await readBody(request);
    const action = create ? (input.account_mode === 'existing' ? 'link' : 'create') : 'credentials';
    const target = edit?.[1].toLowerCase() || null;
    if (target && !uuid.test(target))
      throw new Failure(422, 'invalid_fields', 'Check the employee record.');
    const body = cleanInput(input, action);
    operation = await rpc('hr_begin_staff_account', {
      p_request_id: body.request_id,
      p_action: action,
      p_employee_id: target,
      p_version: body.version || null,
      p_membership_version: body.membership_version || null,
      p_email: body.email,
      p_profile: body.profile || {},
      p_fingerprint: await fingerprint(settings.adminKey, body, action, target),
    });
    if (operation.status === 'completed')
      return response({ status: 'completed', employee_id: operation.employee_id });
    if (operation.recover_only)
      return response(
        await rpc('hr_recover_staff_account', { p_request_id: operation.operation_id }),
      );
    async function authorize() {
      const context = await rpc('hr_staff_account_context', {
        p_request_id: operation.operation_id,
        p_lease_token: operation.lease_token,
      });
      if (
        context.actor_user_id !== identity.data.id ||
        context.operation_id !== body.request_id ||
        !uuid.test(context.organization_id) ||
        (action !== 'create' && !uuid.test(context.account_user_id))
      )
        throw new Failure(
          403,
          'access_denied',
          'Your account does not have access to this action.',
        );
      return context;
    }
    const context = await authorize();
    const markers = {
      snr_admin_operation: context.operation_id,
      snr_admin_actor: context.actor_user_id,
      snr_admin_organization: context.organization_id,
    };
    let authResult;
    if (action === 'create') {
      authResult = await upstream(
        '/auth/v1/admin/users',
        'POST',
        {
          email: context.email,
          password: body.password,
          email_confirm: true,
          app_metadata: markers,
        },
        true,
      );
    } else {
      const account = await upstream(
        `/auth/v1/admin/users/${context.account_user_id}`,
        'GET',
        undefined,
        true,
      );
      if (!account.result.ok || account.data?.id !== context.account_user_id)
        throw new Failure(503, 'account_unavailable', 'The account could not be loaded.');
      await authorize();
      authResult = await upstream(
        `/auth/v1/admin/users/${context.account_user_id}`,
        'PUT',
        {
          email: context.email,
          email_confirm: true,
          ...(body.password ? { password: body.password } : {}),
          app_metadata: { ...account.data.app_metadata, ...markers },
        },
        true,
      );
    }
    if (!authResult.result.ok) {
      // A definite 4xx rejection can be closed now; timeouts/5xx remain recoverable.
      if (authResult.result.status >= 400 && authResult.result.status < 500) {
        await rpc('hr_close_staff_account', {
          p_request_id: operation.operation_id,
          p_lease_token: operation.lease_token,
        });
        if ([401, 403].includes(authResult.result.status))
          throw new Failure(
            503,
            'account_management_unavailable',
            'Account management is not available yet. Contact your workspace administrator.',
            {
              operation_closed: true,
              profile_version: operation.profile_version,
              membership_version: operation.membership_version,
            },
          );
        const weak = ['weak_password', 'password_too_short', 'same_password'].includes(
          authResult.data?.code || authResult.data?.error_code,
        );
        throw new Failure(
          422,
          weak ? 'password_rejected' : 'account_rejected',
          weak
            ? 'Choose a different, stronger password.'
            : 'The account could not be saved. Check the email and login details.',
          {
            operation_closed: true,
            profile_version: operation.profile_version,
            membership_version: operation.membership_version,
          },
        );
      }
      throw new Failure(
        503,
        'request_interrupted',
        'The account request needs a status check. Use Pending account requests in the directory.',
      );
    }
    return response(
      await rpc('hr_complete_staff_account', { p_request_id: operation.operation_id }),
    );
  } catch (error) {
    const safe = error instanceof Failure ? error : unavailable();
    return response(
      {
        error: { code: safe.code, message: safe.message },
        ...(operation ? { operation_id: operation.operation_id } : {}),
        ...safe.extra,
      },
      safe.status,
    );
  }
}
