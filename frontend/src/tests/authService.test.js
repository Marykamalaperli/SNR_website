import { beforeEach, expect, it, vi } from 'vitest';
import { config } from '../lib/config';
import { apiRequest } from '../lib/apiClient';
import { confirmSession, clearAuthSession, getAuthClient } from '../services/authService';
import { authStorage, AUTH_STORAGE_KEY } from '../lib/authStorage';
import { createClient } from '@supabase/supabase-js';

vi.mock('../lib/config', () => ({
  authConfigured: true,
  config: {
    sessionSource: 'supabase',
    supabaseUrl: 'https://project.example.org',
    supabaseKey: 'sb_publishable_unit_test',
  },
}));
vi.mock('../lib/apiClient', () => ({ apiRequest: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ auth: {} })) }));

const user = { id: 'user-one', email: 'person@example.invalid', user_metadata: { role: 'hr' } };
const membership = {
  user_id: user.id,
  organization_id: 'organization-one',
  organization_name: 'Test organization',
  role: 'employee',
  display_name: 'Verified Person',
};
let client;
beforeEach(() => {
  config.sessionSource = 'supabase';
  client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    rpc: vi.fn().mockResolvedValue({ data: membership, error: null }),
  };
});

it('uses tab storage for real sessions and creates one Supabase client', async () => {
  expect(await getAuthClient()).toBe(await getAuthClient());
  expect(createClient).toHaveBeenCalledOnce();
  expect(createClient.mock.calls[0][2].auth).toMatchObject({
    persistSession: true,
    storageKey: AUTH_STORAGE_KEY,
    storage: authStorage,
  });
});

it.each([
  ['employee', '/me'],
  ['supervisor', '/team'],
  ['hr', '/hr'],
])('routes database-assigned %s to %s and ignores user metadata roles', async (role, workspace) => {
  client.rpc.mockResolvedValue({ data: { ...membership, role }, error: null });
  const result = await confirmSession('user-access-token', client);
  expect(result).toMatchObject({
    role,
    workspace,
    email: user.email,
    organization_id: membership.organization_id,
  });
  expect(client.auth.getUser).toHaveBeenCalledWith('user-access-token');
  expect(client.rpc).toHaveBeenCalledWith('current_workspace', {});
  expect(apiRequest).not.toHaveBeenCalled();
});

it('rejects an identity the Auth server cannot verify before requesting membership', async () => {
  client.auth.getUser.mockResolvedValue({
    data: { user: null },
    error: { message: 'Invalid token' },
  });
  await expect(confirmSession('expired-token', client)).rejects.toThrow('session has expired');
  expect(client.rpc).not.toHaveBeenCalled();
});

it.each([
  ['PT403', 'no active workspace'],
  ['PT409', 'More than one workspace'],
  ['PGRST301', 'session has expired'],
  ['PGRST202', 'could not be opened'],
])('fails closed for membership error %s', async (code, message) => {
  client.rpc.mockResolvedValue({
    data: null,
    error: { code, message: 'Private database details that must not be reflected' },
  });
  await expect(confirmSession('access-token', client)).rejects.toThrow(message);
  expect(apiRequest).not.toHaveBeenCalled();
});

it('rejects mismatched identity data and malformed membership responses', async () => {
  for (const data of [
    null,
    [],
    { ...membership, user_id: 'another-user' },
    { ...membership, organization_id: null },
  ]) {
    client.rpc.mockResolvedValue({ data, error: null });
    await expect(confirmSession('access-token', client)).rejects.toThrow('could not be verified');
  }
});

it.each(['security_auditor', 'system_owner', 'toString', '__proto__'])(
  'does not map %s to HR',
  async (role) => {
    client.rpc.mockResolvedValue({ data: { ...membership, role }, error: null });
    await expect(confirmSession('access-token', client)).rejects.toThrow(
      'not available for your assigned role',
    );
  },
);

it('keeps API session verification available as an explicit transport', async () => {
  config.sessionSource = 'api';
  apiRequest.mockResolvedValue(membership);
  expect(await confirmSession('access-token', client)).toMatchObject({ workspace: '/me' });
  expect(apiRequest).toHaveBeenCalledWith('/api/v1/session', { token: 'access-token' });
  expect(client.rpc).not.toHaveBeenCalled();
  apiRequest.mockRejectedValue(new Error('API unavailable'));
  await expect(confirmSession('access-token', client)).rejects.toThrow('API unavailable');
  expect(client.rpc).not.toHaveBeenCalled();
});

it('removes local credentials even when remote sign-out fails', async () => {
  authStorage.setItem(AUTH_STORAGE_KEY, 'test-session');
  client.auth.signOut.mockRejectedValue(new Error('Network unavailable'));
  await expect(clearAuthSession(client)).rejects.toThrow('Network unavailable');
  expect(authStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  expect(client.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
});
