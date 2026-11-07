import { getAuthClient } from './authService';

async function accountRequest(path, method, body) {
  const client = await getAuthClient();
  const { data, error } = (await client?.auth.getSession()) || {};
  if (error || !data?.session?.access_token) throw new Error('Please sign in again.');
  let response, result;
  try {
    response = await fetch(`/api/admin/staff${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.session.access_token}`,
      },
      credentials: 'same-origin',
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(35000),
    });
    if (!response.headers.get('Content-Type')?.includes('application/json')) throw new Error();
    result = await response.json();
  } catch {
    const failure = new Error(
      'The account request could not be confirmed. Check Pending account requests before trying again.',
    );
    failure.operationId = body.request_id;
    throw failure;
  }
  if (!response.ok) {
    // Only our own server's fixed codes are translated; never show arbitrary response text.
    const messages = {
      account_management_unavailable:
        'Account management is not available yet. Contact your workspace administrator.',
      sign_in_required: 'Your session has expired. Please sign in again.',
      access_denied: 'Your account does not have access to this action.',
      invalid_fields: 'Check the email, required fields and workplace assignments.',
      invalid_password: 'Choose a password of 12–64 characters.',
      account_already_exists:
        'This email already has an account. Choose “Link existing account” to add its employee profile.',
      account_not_found: 'No account uses this email. Choose “Create new account” to set it up.',
      password_rejected: 'Choose a different, stronger password.',
      account_rejected: 'The account could not be saved. Check the email and login details.',
      record_changed: 'This record changed. Close the form, refresh the directory and try again.',
      employee_exists: 'The employee number or account already has a profile.',
      protected_account: 'This account has a protected role and cannot be changed here.',
      choose_organization_records: 'Choose a site and department in this organization.',
      account_unavailable: 'This account cannot be managed in this organization.',
      operation_in_progress:
        'The account request is still processing. Check its status again shortly.',
      pending_account_change:
        'An account request is already pending. Review Pending account requests in the directory.',
      operation_changed:
        'This request changed. Check its pending status before starting another request.',
      operation_closed: 'This request has ended. Close this form, refresh and try again.',
      account_change_not_confirmed:
        'The account change is not confirmed yet. Check Pending account requests.',
      request_interrupted:
        result.connection_stage === 'verify_session'
          ? 'The sign-in service could not be reached. Please try again shortly.'
          : 'The request was interrupted. Check Pending account requests before trying again.',
      upstream_unavailable: result.operation_id
        ? 'The account service could not confirm this request. Check Pending account requests.'
        : 'The account service returned an unexpected response. Please try again shortly.',
      account_rate_limit: 'Too many account requests. Wait a minute before trying again.',
    };
    const failure = new Error(
      Object.hasOwn(messages, result.error?.code)
        ? messages[result.error.code]
        : 'The account request could not be completed. Please try again.',
    );
    if (result.operation_id) failure.operationId = result.operation_id;
    failure.operationClosed = result.operation_closed === true;
    failure.profileVersion = result.profile_version;
    failure.membershipVersion = result.membership_version;
    throw failure;
  }
  if (
    !result ||
    !['completed', 'failed'].includes(result.status) ||
    (result.status === 'completed' && typeof result.employee_id !== 'string')
  )
    throw new Error(
      'The account result could not be verified. Refresh the directory and check its pending requests.',
    );
  return result;
}

export function createStaffAccount(values, requestId, mode = 'create') {
  return accountRequest('', 'POST', {
    request_id: requestId,
    email: values.email.trim(),
    ...(values.password ? { password: values.password } : {}),
    account_mode: mode,
    profile: {
      display_name: values.display_name.trim(),
      employee_number: values.employee_number.trim(),
      site_id: values.site_id,
      department_id: values.department_id,
      role: values.role,
      active: values.active === 'true',
    },
  });
}
export function updateStaffAccount(record, values, requestId) {
  return accountRequest(`/${record.id}/account`, 'PATCH', {
    request_id: requestId,
    email: values.email.trim(),
    version: record.version,
    membership_version: record.membership_version,
    ...(values.password ? { password: values.password } : {}),
  });
}
export const recoverStaffAccount = (id) => accountRequest(`/operations/${id}/recover`, 'POST', {});

export async function updateOwnLogin(values) {
  const client = await getAuthClient();
  if (!client) throw new Error('Please sign in again.');
  let identity;
  try {
    identity = await client.auth.getUser();
  } catch {
    throw new Error('Please sign in again.');
  }
  if (identity.error || !identity.data?.user?.id) throw new Error('Please sign in again.');
  const email = values.email.trim();
  const changedEmail = email.toLowerCase() !== identity.data.user.email?.toLowerCase();
  if (!changedEmail && !values.password)
    throw new Error('Change your email or enter a new password before saving.');
  if (values.password && (values.password.length < 12 || values.password.length > 64))
    throw new Error('Choose a password of 12–64 characters.');
  let result;
  try {
    result = await client.auth.updateUser(
      {
        ...(changedEmail ? { email } : {}),
        ...(values.password ? { password: values.password } : {}),
      },
      { emailRedirectTo: new URL('/login', window.location.origin).href },
    );
  } catch {
    throw new Error('Your login details could not be updated. Please try again.');
  }
  if (result.error || !result.data?.user?.id || result.data.user.id !== identity.data.user.id)
    throw new Error(
      'Your login details could not be updated. Check the fields or sign in again before retrying.',
    );
  return {
    emailPending: changedEmail && result.data.user.email?.toLowerCase() !== email.toLowerCase(),
  };
}
