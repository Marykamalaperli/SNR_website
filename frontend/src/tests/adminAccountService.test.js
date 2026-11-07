import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { getAuthClient } from '../services/authService';
import {
  createStaffAccount,
  updateStaffAccount,
  recoverStaffAccount,
  updateOwnLogin,
} from '../services/adminAccountService';
vi.mock('../services/authService', () => ({ getAuthClient: vi.fn() }));
let fetcher;
const values = {
  email: ' new@example.invalid ',
  password: 'Synthetic-Password-17',
  display_name: ' Person ',
  employee_number: ' TEST-1 ',
  site_id: 'site',
  department_id: 'department',
  role: 'employee',
  active: 'true',
};
beforeEach(() => {
  getAuthClient.mockResolvedValue({
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: 'own-user', email: 'old@example.invalid' } } }),
      updateUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'own-user', email: 'old@example.invalid' } },
        error: null,
      }),
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: { access_token: 'verified-user-token' } } }),
    },
  });
  fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ status: 'completed', employee_id: 'profile' }));
  vi.stubGlobal('fetch', fetcher);
});

it('updates only the current Auth user and reports email confirmation as pending', async () => {
  const result = await updateOwnLogin({ email: 'new@example.invalid', password: '' });
  const client = await getAuthClient();
  expect(client.auth.updateUser).toHaveBeenCalledWith(
    { email: 'new@example.invalid' },
    { emailRedirectTo: new URL('/login', window.location.origin).href },
  );
  expect(result.emailPending).toBe(true);
  expect(fetcher).not.toHaveBeenCalled();
});
it('denies self-account changes without verified identity and sanitizes Auth errors', async () => {
  const client = await getAuthClient();
  client.auth.getUser.mockResolvedValueOnce({ error: new Error('private'), data: { user: null } });
  await expect(updateOwnLogin({ email: 'new@example.invalid' })).rejects.toThrow('Please sign in');
  expect(client.auth.updateUser).not.toHaveBeenCalled();
  client.auth.updateUser.mockResolvedValue({ error: new Error('PRIVATE-DETAILS') });
  await expect(updateOwnLogin({ email: 'new@example.invalid' })).rejects.toThrow(
    'could not be updated',
  );
});
afterEach(() => vi.unstubAllGlobals());
it('sends create credentials only to the same-origin server and never a client-selected actor/org', async () => {
  await createStaffAccount({ ...values, organization_id: 'forged', user_id: 'forged' }, 'request');
  const [path, options] = fetcher.mock.calls[0];
  expect(path).toBe('/api/admin/staff');
  expect(options.headers.Authorization).toBe('Bearer verified-user-token');
  expect(JSON.parse(options.body)).toEqual({
    request_id: 'request',
    email: 'new@example.invalid',
    password: values.password,
    account_mode: 'create',
    profile: {
      display_name: 'Person',
      employee_number: 'TEST-1',
      site_id: 'site',
      department_id: 'department',
      role: 'employee',
      active: true,
    },
  });
});
it('omits an unchanged password and sends both snapshots for account edits', async () => {
  await updateStaffAccount(
    { id: 'profile', version: 3, membership_version: 2 },
    { email: values.email, password: '' },
    'request',
  );
  expect(fetcher.mock.calls[0][0]).toBe('/api/admin/staff/profile/account');
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
    request_id: 'request',
    email: 'new@example.invalid',
    version: 3,
    membership_version: 2,
  });
});
it('retains interruption IDs and closes rejected operations without exposing arbitrary server text', async () => {
  fetcher.mockResolvedValue(
    Response.json(
      {
        error: { code: 'password_rejected', message: 'PRIVATE-CREDENTIAL' },
        operation_id: 'request',
        operation_closed: true,
        profile_version: 4,
      },
      { status: 422 },
    ),
  );
  await expect(createStaffAccount(values, 'request')).rejects.toMatchObject({
    message: 'Choose a different, stronger password.',
    operationId: 'request',
    operationClosed: true,
    profileVersion: 4,
  });
  fetcher.mockRejectedValue(new Error('private network details'));
  await expect(createStaffAccount(values, 'request')).rejects.toMatchObject({
    operationId: 'request',
  });
});
it('requires a session and rejects malformed successful responses', async () => {
  getAuthClient.mockResolvedValueOnce(null);
  await expect(recoverStaffAccount('request')).rejects.toThrow('Please sign in');
  fetcher.mockResolvedValue(Response.json({ status: 'unexpected' }));
  await expect(recoverStaffAccount('request')).rejects.toThrow('could not be verified');
});
