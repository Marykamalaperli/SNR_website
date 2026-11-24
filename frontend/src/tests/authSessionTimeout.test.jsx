import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { apiRequest } from '../lib/apiClient';
import AuthProvider from '../features/auth/AuthProvider';
import { useAuth } from '../hooks/useAuth';
import * as authService from '../services/authService';

vi.mock('../lib/config', () => ({
  config: {
    apiBaseUrl: 'https://api.example.test',
    supabaseUrl: '',
    supabaseAnonKey: '',
  },
}));

function SessionProbe() {
  const { session, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  return <div>{session ? `Signed in as ${session.display_name}` : 'Signed out'}</div>;
}

describe('Session Timeout & Silent Refresh', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('silently refreshes access cookie on 401 and retries the original request', async () => {
    let callCount = 0;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const target = String(url);
      if (target.endsWith('/api/v1/auth/refresh')) {
        return new Response(JSON.stringify({ status: 'refreshed' }), { status: 200 });
      }
      if (target.endsWith('/api/v1/stores')) {
        callCount += 1;
        if (callCount === 1) {
          return new Response(
            JSON.stringify({ error: { message: 'Your session has expired.' } }),
            { status: 401 },
          );
        }
        return new Response(JSON.stringify({ items: [{ id: 'store-1' }], total: 1 }), {
          status: 200,
        });
      }
      return new Response('{}', { status: 404 });
    });

    const result = await apiRequest('/api/v1/stores');
    expect(result).toEqual({ items: [{ id: 'store-1' }], total: 1 });
    expect(callCount).toBe(2);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/auth/refresh',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('shows idle warning modal and keeps user signed in when they click Stay Signed In', async () => {
    vi.useFakeTimers();

    vi.spyOn(authService, 'getAuthClient').mockResolvedValue(null);
    vi.spyOn(authService, 'getCurrentUserFromApi').mockResolvedValue({
      user_id: 'u-1',
      email: 'admin@example.com',
      display_name: 'Super Admin',
      role: 'admin',
      scopes: [{ role: 'system_admin' }],
    });
    const refreshSpy = vi.spyOn(authService, 'refreshApiSession').mockResolvedValue({
      user_id: 'u-1',
      email: 'admin@example.com',
      display_name: 'Super Admin',
      role: 'admin',
      scopes: [{ role: 'system_admin' }],
    });

    render(
      <AuthProvider idleWarningMs={5000} countdownSeconds={3} proactiveRefreshMs={60000}>
        <SessionProbe />
      </AuthProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('Signed in as Super Admin')).toBeInTheDocument();

    // Advance past idleWarningMs (5 seconds)
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });

    expect(screen.getByText('Are you still there?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stay Signed In' })).toBeInTheDocument();

    // User responds by clicking Stay Signed In
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stay Signed In' }));
      await Promise.resolve();
    });

    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Are you still there?')).not.toBeInTheDocument();
    expect(screen.getByText('Signed in as Super Admin')).toBeInTheDocument();
  });

  it('logs out automatically when user does not respond before countdown expires', async () => {
    vi.useFakeTimers();

    vi.spyOn(authService, 'getAuthClient').mockResolvedValue(null);
    vi.spyOn(authService, 'getCurrentUserFromApi').mockResolvedValue({
      user_id: 'u-1',
      email: 'admin@example.com',
      display_name: 'Super Admin',
      role: 'admin',
      scopes: [{ role: 'system_admin' }],
    });
    const logoutSpy = vi.spyOn(authService, 'logoutWithApi').mockResolvedValue({});

    render(
      <AuthProvider idleWarningMs={5000} countdownSeconds={3} proactiveRefreshMs={60000}>
        <SessionProbe />
      </AuthProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('Signed in as Super Admin')).toBeInTheDocument();

    // Trigger idle modal (6s) + let 3s countdown expire (3s)
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.getByText('Are you still there?')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(4000);
      await Promise.resolve();
    });

    expect(logoutSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Signed out')).toBeInTheDocument();
  });
});

