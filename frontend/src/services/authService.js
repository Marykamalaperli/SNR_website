import { apiRequest } from '../lib/apiClient';
import { authConfigured, config } from '../lib/config';
import { AUTH_STORAGE_KEY, authStorage } from '../lib/authStorage';

let clientPromise;
export async function getAuthClient() {
  if (!authConfigured) return null;
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

const workspaceByRole = { employee: '/me', supervisor: '/team', hr: '/hr' };

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
