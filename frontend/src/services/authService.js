import { apiRequest } from '../lib/apiClient';
import { config } from '../lib/config';
import { AUTH_STORAGE_KEY, authStorage } from '../lib/authStorage';

let clientPromise;
export async function getAuthClient() {
  if (!config.supabaseUrl || !config.supabaseKey) return null;
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(config.supabaseUrl, config.supabaseKey, {
      auth: {
        persistSession: true,
        storage: authStorage,
        storageKey: AUTH_STORAGE_KEY,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, options = {}) =>
          fetch(input, {
            ...options,
            signal: options.signal
              ? AbortSignal.any([options.signal, AbortSignal.timeout(10000)])
              : AbortSignal.timeout(10000),
          }),
      },
    }),
  );
  return clientPromise;
}

const workspaceByRole = { employee: '/me', supervisor: '/team', hr: '/hr', admin: '/admin/stores' };

export async function confirmSession(token, client = null) {
  client ||= await getAuthClient();
  if (!client || !token) throw new Error('Please sign in to continue.');
  // Auth server verifies identity; Postgres/RLS supplies the application role.
  const { data: identity, error: identityError } = await client.auth.getUser(token);
  if (identityError || !identity?.user?.id)
    throw new Error('Your session has expired. Please sign in again.');
  let session;
  if (config.sessionSource === 'api') {
    session = await apiRequest('/api/v1/session', { token });
  } else {
    const { data, error } = await client.rpc('current_workspace', {});
    if (error) {
      if (error.code === 'PT403')
        throw new Error(
          'Your account has no active workspace assignment. Contact your administrator.',
        );
      if (error.code === 'PT409')
        throw new Error(
          'More than one workspace is assigned to this account. Contact your administrator.',
        );
      if (['PGRST301', 'PGRST303'].includes(error.code))
        throw new Error('Your session has expired. Please sign in again.');
      throw new Error('Your workspace could not be opened. Please contact your administrator.');
    }
    session = data;
  }
  if (!session?.organization_id || !session?.user_id || session.user_id !== identity.user.id) {
    throw new Error('Your workspace could not be verified. Please contact your administrator.');
  }
  if (!Object.hasOwn(workspaceByRole, session.role)) {
    throw new Error(
      'A workspace is not available for your assigned role yet. Contact your administrator.',
    );
  }
  return {
    ...session,
    email: identity.user.email || '',
    display_name: session.display_name || identity.user.email?.split('@')[0] || 'Your workspace',
    workspace: workspaceByRole[session.role],
  };
}

export async function clearAuthSession(client) {
  try {
    await client?.auth.signOut({ scope: 'local' });
  } finally {
    authStorage.removeItem(AUTH_STORAGE_KEY);
  }
}

export function mapUserToSession(me) {
  const scope = me.scopes?.[0] || {};
  let uiRole = 'employee';
  if (me.scopes?.some((s) => s.role === 'system_admin')) {
    uiRole = 'admin';
  } else if (me.scopes?.some((s) => ['store_admin', 'supervisor'].includes(s.role))) {
    uiRole = 'supervisor';
  } else if (
    me.scopes?.some((s) => ['hr_payroll', 'auditor', 'hr'].includes(s.role))
  ) {
    uiRole = 'hr';
  }
  const workspaceMapping = {
    employee: '/me',
    supervisor: '/team',
    hr: '/hr',
    admin: '/admin/stores',
  };
  return {
    user_id: me.user_id,
    email: me.email,
    display_name: me.display_name,
    organization_id: scope.organization_id || '',
    store_id: scope.store_id || '',
    role: uiRole,
    actual_role: scope.role,
    scopes: me.scopes || [],
    workspace: workspaceMapping[uiRole],
  };
}

export async function loginWithApi(email, password) {
  await apiRequest('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const me = await apiRequest('/api/v1/me', { method: 'GET' });
  return mapUserToSession(me);
}

export async function getCurrentUserFromApi() {
  const me = await apiRequest('/api/v1/me', { method: 'GET' });
  return mapUserToSession(me);
}

export async function refreshApiSession() {
  await apiRequest('/api/v1/auth/refresh', { method: 'POST' });
  const me = await apiRequest('/api/v1/me', { method: 'GET' });
  return mapUserToSession(me);
}

export async function logoutWithApi() {
  return apiRequest('/api/v1/auth/logout', { method: 'POST' }).catch(() => {});
}
