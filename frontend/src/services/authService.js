import { apiRequest } from '../lib/apiClient';
import { authConfigured, config } from '../lib/config';

let clientPromise;
export async function getAuthClient() {
  if (!authConfigured) return null;
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(config.supabaseUrl, config.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false },
    }),
  );
  return clientPromise;
}

const workspaceByRole = { employee: '/me', supervisor: '/team', hr: '/hr' };

export async function confirmSession(token) {
  const session = await apiRequest('/api/v1/session', { token });
  if (!session?.organization_id || !session?.user_id || !workspaceByRole[session.role]) {
    throw new Error(
      'A workspace has not been assigned to this account. Contact your administrator.',
    );
  }
  return { ...session, workspace: workspaceByRole[session.role] };
}
