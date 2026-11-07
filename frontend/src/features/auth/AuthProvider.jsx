import { useEffect, useRef, useState } from 'react';
import { AuthContext } from '../../hooks/useAuth';
import { clearAuthSession, confirmSession, getAuthClient } from '../../services/authService';

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const request = useRef(0);

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
        subscription = client?.auth.onAuthStateChange((event, authSession) => {
          if (event === 'SIGNED_OUT' && active) {
            ++request.current;
            setSession(null);
            setLoading(false);
          }
          if (event === 'TOKEN_REFRESHED' && authSession && active) {
            clearTimeout(refreshTimer);
            const refreshRequest = ++request.current;
            // Avoid calling Supabase synchronously while its auth callback holds a lock.
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
      subscription?.data.subscription.unsubscribe();
    };
  }, []);

  async function signIn(email, password) {
    const signInRequest = ++request.current;
    const client = await getAuthClient();
    if (!client)
      throw new Error('Sign-in is not available yet. Please contact your administrator.');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error('We could not sign you in. Check your email and password.');
    try {
      if (!data.session?.access_token)
        throw new Error('We could not sign you in. Please try again.');
      const confirmed = await confirmSession(data.session.access_token, client);
      if (signInRequest !== request.current)
        throw new Error('Sign-in was interrupted. Please try again.');
      setSession(confirmed);
      return confirmed;
    } catch (error) {
      if (signInRequest === request.current) {
        setSession(null);
        await clearAuthSession(client).catch(() => {});
      }
      throw error;
    }
  }

  async function signOut() {
    ++request.current;
    try {
      await clearAuthSession(await getAuthClient());
    } catch {
      // Local credentials are removed even if the remote logout cannot be reached.
    } finally {
      setSession(null);
      setLoading(false);
    }
  }

  async function refreshSession() {
    const refreshRequest = ++request.current;
    const client = await getAuthClient();
    try {
      const { data, error } = await client.auth.getSession();
      if (error || !data?.session?.access_token) throw new Error('Please sign in again.');
      const confirmed = await confirmSession(data.session.access_token, client);
      if (refreshRequest === request.current) setSession(confirmed);
      return confirmed;
    } catch (error) {
      if (refreshRequest === request.current) {
        setSession(null);
        await clearAuthSession(client).catch(() => {});
      }
      throw error;
    }
  }

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signOut, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}
