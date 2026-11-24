import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock3 } from 'lucide-react';
import { AuthContext } from '../../hooks/useAuth';
import { config } from '../../lib/config';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';
import {
  clearAuthSession,
  confirmSession,
  getAuthClient,
  getCurrentUserFromApi,
  loginWithApi,
  logoutWithApi,
  refreshApiSession,
} from '../../services/authService';

const DEFAULT_IDLE_WARNING_MS = 14 * 60 * 1000; // 14 minutes
const DEFAULT_COUNTDOWN_SECONDS = 60; // 60 seconds
const DEFAULT_PROACTIVE_REFRESH_MS = 10 * 60 * 1000; // 10 minutes

export default function AuthProvider({
  children,
  idleWarningMs = DEFAULT_IDLE_WARNING_MS,
  countdownSeconds = DEFAULT_COUNTDOWN_SECONDS,
  proactiveRefreshMs = DEFAULT_PROACTIVE_REFRESH_MS,
}) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [idleWarningOpen, setIdleWarningOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(countdownSeconds);
  const [stayingSignedIn, setStayingSignedIn] = useState(false);

  const request = useRef(0);
  const lastActivityRef = useRef(Date.now());
  const lastRefreshRef = useRef(Date.now());
  const idleWarningOpenRef = useRef(false);
  const secondsLeftRef = useRef(countdownSeconds);

  useEffect(() => {
    idleWarningOpenRef.current = idleWarningOpen;
  }, [idleWarningOpen]);

  useEffect(() => {
    let active = true;
    let subscription;
    let refreshTimer;
    const restoreRequest = ++request.current;
    async function restore() {
      let client;
      try {
        client = await getAuthClient();
        if (!active) return;
        if (client) {
          subscription = client?.auth.onAuthStateChange((event, authSession) => {
            if (event === 'SIGNED_OUT' && active) {
              ++request.current;
              setSession(null);
              setLoading(false);
            }
            if (event === 'TOKEN_REFRESHED' && authSession && active) {
              clearTimeout(refreshTimer);
              const refreshRequest = ++request.current;
              refreshTimer = setTimeout(async () => {
                if (!active || refreshRequest !== request.current) return;
                try {
                  const confirmed = await confirmSession(authSession.access_token, client);
                  if (active && refreshRequest === request.current) setSession(confirmed);
                } catch {
                  if (active && refreshRequest === request.current) {
                    setSession(null);
                    await clearAuthSession(client).catch(() => {});
                  }
                }
              }, 0);
            }
          });
          const result = await client?.auth.getSession();
          if (result?.data.session) {
            const confirmed = await confirmSession(result.data.session.access_token, client);
            if (active && restoreRequest === request.current) setSession(confirmed);
          }
        } else if (config.apiBaseUrl) {
          try {
            const current = await getCurrentUserFromApi();
            if (active && restoreRequest === request.current) setSession(current);
          } catch {
            try {
              const refreshed = await refreshApiSession();
              if (active && restoreRequest === request.current) setSession(refreshed);
            } catch {
              if (active && restoreRequest === request.current) setSession(null);
            }
          }
        }
      } catch {
        if (active && restoreRequest === request.current)
          await clearAuthSession(client).catch(() => {});
      } finally {
        if (active) setLoading(false);
      }
    }
    restore();
    return () => {
      active = false;
      clearTimeout(refreshTimer);
      subscription?.data?.subscription?.unsubscribe();
    };
  }, []);

  async function signIn(email, password) {
    const signInRequest = ++request.current;
    const client = await getAuthClient();
    if (client) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw new Error('We could not sign you in. Check your email and password.');
      try {
        if (!data.session?.access_token)
          throw new Error('We could not sign you in. Please try again.');
        const confirmed = await confirmSession(data.session.access_token, client);
        if (signInRequest !== request.current)
          throw new Error('Sign-in was interrupted. Please try again.');
        lastActivityRef.current = Date.now();
        lastRefreshRef.current = Date.now();
        setSession(confirmed);
        return confirmed;
      } catch (error) {
        if (signInRequest === request.current) {
          setSession(null);
          await clearAuthSession(client).catch(() => {});
        }
        throw error;
      }
    } else if (config.apiBaseUrl) {
      try {
        const confirmed = await loginWithApi(email, password);
        if (signInRequest !== request.current)
          throw new Error('Sign-in was interrupted. Please try again.');
        lastActivityRef.current = Date.now();
        lastRefreshRef.current = Date.now();
        setSession(confirmed);
        return confirmed;
      } catch (error) {
        if (signInRequest === request.current) {
          setSession(null);
        }
        throw new Error(
          error.message || 'We could not sign you in. Check your email and password.',
          { cause: error },
        );
      }
    } else {
      throw new Error('Sign-in is not available yet. Please contact your administrator.');
    }
  }

  const signOut = useCallback(async () => {
    ++request.current;
    setIdleWarningOpen(false);
    try {
      const client = await getAuthClient();
      if (client) {
        await clearAuthSession(client);
      } else {
        await logoutWithApi();
      }
    } catch {
      // Local credentials are removed even if the remote logout cannot be reached.
    } finally {
      setSession(null);
      setLoading(false);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    const refreshRequest = ++request.current;
    const client = await getAuthClient();
    if (client) {
      try {
        const { data, error } = await client.auth.getSession();
        if (error || !data?.session?.access_token) throw new Error('Please sign in again.');
        const confirmed = await confirmSession(data.session.access_token, client);
        if (refreshRequest === request.current) {
          lastRefreshRef.current = Date.now();
          setSession(confirmed);
        }
        return confirmed;
      } catch (error) {
        if (refreshRequest === request.current) {
          setSession(null);
          await clearAuthSession(client).catch(() => {});
        }
        throw error;
      }
    } else if (config.apiBaseUrl) {
      try {
        const confirmed = await refreshApiSession();
        if (refreshRequest === request.current) {
          lastRefreshRef.current = Date.now();
          setSession(confirmed);
        }
        return confirmed;
      } catch (error) {
        if (refreshRequest === request.current) setSession(null);
        throw error;
      }
    }
  }, []);

  // Listen for terminal 401 session expiration events from apiClient
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleExpired = () => {
      setIdleWarningOpen(false);
      setSession(null);
    };
    window.addEventListener('snr:session-expired', handleExpired);
    return () => window.removeEventListener('snr:session-expired', handleExpired);
  }, []);

  // Track user activity, proactively refresh while active, and show idle logout notice
  useEffect(() => {
    if (!session) {
      setIdleWarningOpen(false);
      return undefined;
    }

    lastActivityRef.current = Date.now();
    lastRefreshRef.current = Date.now();

    const recordActivity = () => {
      if (!idleWarningOpenRef.current) {
        lastActivityRef.current = Date.now();
      }
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach((evt) => window.addEventListener(evt, recordActivity, { passive: true }));

    const ticker = setInterval(() => {
      const now = Date.now();

      if (!idleWarningOpenRef.current) {
        if (now - lastActivityRef.current >= idleWarningMs) {
          idleWarningOpenRef.current = true;
          secondsLeftRef.current = countdownSeconds;
          setSecondsLeft(countdownSeconds);
          setIdleWarningOpen(true);
        } else if (config.apiBaseUrl && now - lastRefreshRef.current >= proactiveRefreshMs) {
          lastRefreshRef.current = now;
          refreshApiSession()
            .then((confirmed) => {
              setSession(confirmed);
            })
            .catch(() => {
              // Handled on next API interaction if refresh token is no longer valid
            });
        }
      } else {
        const next = secondsLeftRef.current - 1;
        secondsLeftRef.current = Math.max(0, next);
        setSecondsLeft(secondsLeftRef.current);
        if (next <= 0) {
          idleWarningOpenRef.current = false;
          clearInterval(ticker);
          signOut();
        }
      }
    }, 1000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, recordActivity));
      clearInterval(ticker);
    };
  }, [session, idleWarningMs, countdownSeconds, proactiveRefreshMs, signOut]);

  const handleStaySignedIn = async () => {
    setStayingSignedIn(true);
    try {
      await refreshSession();
      lastActivityRef.current = Date.now();
      setIdleWarningOpen(false);
    } catch {
      await signOut();
    } finally {
      setStayingSignedIn(false);
    }
  };

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signOut, refreshSession }}>
      {children}
      {idleWarningOpen && session && (
        <Modal
          title="Are you still there?"
          onClose={handleStaySignedIn}
          busy={stayingSignedIn}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.85rem 1rem',
                background: '#fff2d0',
                border: '1px solid #e9c46a',
                borderRadius: '8px',
                color: '#1e2d35',
              }}
            >
              <Clock3 size={22} color="#b45309" style={{ flexShrink: 0 }} />
              <div style={{ fontSize: '0.925rem', lineHeight: 1.45 }}>
                You have been inactive for a while. For your security, you will be automatically
                logged out in <strong>{secondsLeft}s</strong>.
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                marginTop: '0.5rem',
              }}
            >
              <Button
                variant="secondary"
                onClick={signOut}
                disabled={stayingSignedIn}
              >
                Log Out Now
              </Button>
              <Button
                variant="primary"
                onClick={handleStaySignedIn}
                disabled={stayingSignedIn}
              >
                {stayingSignedIn ? 'Refreshing…' : 'Stay Signed In'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </AuthContext.Provider>
  );
}
