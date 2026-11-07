import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import AuthProvider from '../features/auth/AuthProvider';
import { useAuth } from '../hooks/useAuth';
import { clearAuthSession, confirmSession, getAuthClient } from '../services/authService';
import AppRoutes from '../app/routes';

vi.mock('../services/authService', () => ({
  clearAuthSession: vi.fn(),
  confirmSession: vi.fn(),
  getAuthClient: vi.fn(),
}));

const membership = {
  user_id: 'user-one',
  organization_id: 'org-one',
  organization_name: 'Verified organization',
  role: 'employee',
  workspace: '/me',
  display_name: 'Verified Person',
  email: 'person@example.invalid',
};
let client;
let emit;
beforeEach(() => {
  client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      signInWithPassword: vi
        .fn()
        .mockResolvedValue({ data: { session: { access_token: 'signed-in-token' } }, error: null }),
      onAuthStateChange: vi.fn((callback) => {
        emit = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
  };
  getAuthClient.mockResolvedValue(client);
  confirmSession.mockResolvedValue(membership);
  clearAuthSession.mockResolvedValue();
});

function Probe() {
  const { session, loading, signOut, refreshSession } = useAuth();
  return (
    <>
      <output aria-label="Session state">
        {loading ? 'loading' : session ? `${session.role}:${session.display_name}` : 'signed out'}
      </output>
      <button onClick={signOut}>Sign out</button>
      <button onClick={() => refreshSession().catch(() => {})}>Refresh workspace</button>
    </>
  );
}

it('restores a stored session only after server membership confirmation', async () => {
  client.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'stored-token' } } });
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  expect(await screen.findByText('employee:Verified Person')).toBeVisible();
  expect(confirmSession).toHaveBeenCalledWith('stored-token', client);
});

it('refreshes verified account details after dashboard settings change', async () => {
  client.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'stored-token' } } });
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  expect(await screen.findByText('employee:Verified Person')).toBeVisible();
  confirmSession.mockResolvedValue({ ...membership, display_name: 'Updated Person' });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Refresh workspace' }));
  expect(await screen.findByText('employee:Updated Person')).toBeVisible();
});

it('signs in through the form and opens real account details without sample records', async () => {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email address'), membership.email);
  await user.type(screen.getByLabelText('Password'), 'test-password');
  await user.click(screen.getByRole('button', { name: 'Sign In' }));
  expect(await screen.findByRole('heading', { name: 'Welcome, Verified Person.' })).toBeVisible();
  expect(screen.getByText('Your workday at Verified organization.')).toBeVisible();
  expect(await screen.findByText('Attendance is not ready')).toBeVisible();
  expect(screen.queryByText('Design preview')).not.toBeInTheDocument();
  expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
    email: membership.email,
    password: 'test-password',
  });
});

it('denies valid credentials when the account has no authorized membership', async () => {
  confirmSession.mockRejectedValue(new Error('Your account has no active workspace assignment.'));
  render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email address'), membership.email);
  await user.type(screen.getByLabelText('Password'), 'test-password');
  await user.click(screen.getByRole('button', { name: 'Sign In' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('no active workspace assignment');
  expect(clearAuthSession).toHaveBeenCalledWith(client);
  expect(screen.queryByRole('heading', { name: /Welcome, Verified/ })).not.toBeInTheDocument();
});

it('cannot restore a stale session response after sign-out', async () => {
  let resolve;
  client.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'old-token' } } });
  confirmSession.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await waitFor(() => expect(confirmSession).toHaveBeenCalled());
  await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }));
  expect(screen.getByLabelText('Session state')).toHaveTextContent('signed out');
  await act(async () => resolve(membership));
  expect(screen.getByLabelText('Session state')).toHaveTextContent('signed out');
});

it('rechecks membership after token refresh and signs out revoked accounts', async () => {
  client.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'old-token' } } });
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  expect(await screen.findByText('employee:Verified Person')).toBeVisible();
  confirmSession.mockRejectedValue(new Error('Membership revoked'));
  act(() => emit('TOKEN_REFRESHED', { access_token: 'new-token' }));
  await waitFor(() =>
    expect(screen.getByLabelText('Session state')).toHaveTextContent('signed out'),
  );
  expect(clearAuthSession).toHaveBeenCalledWith(client);
});

it('cancels scheduled token verification when the SDK signs out', async () => {
  client.auth.getSession.mockResolvedValue({ data: { session: { access_token: 'old-token' } } });
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  expect(await screen.findByText('employee:Verified Person')).toBeVisible();
  act(() => {
    emit('TOKEN_REFRESHED', { access_token: 'new-token' });
    emit('SIGNED_OUT', null);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  expect(confirmSession).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Session state')).toHaveTextContent('signed out');
});
