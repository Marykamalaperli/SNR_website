import { useEffect, useState } from 'react';
import { AuthContext } from '../../hooks/useAuth';
import { confirmSession, getAuthClient } from '../../services/authService';

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let subscription;
    async function restore() {
      let client;
      try {
        client = await getAuthClient();
        if (!active) return;
        subscription = client?.auth.onAuthStateChange((event) => {
          if (event === 'SIGNED_OUT' && active) setSession(null);
        });
        const result = await client?.auth.getSession();
        if (result?.data.session) {
          const confirmed = await confirmSession(result.data.session.access_token);
          if (active) setSession(confirmed);
        }
      } catch {
        await client?.auth.signOut().catch(() => {});
      } finally {
        if (active) setLoading(false);
      }
    }
    restore();
    return () => {
      active = false;
      subscription?.data.subscription.unsubscribe();
    };
  }, []);

  async function signIn(email, password) {
    const client = await getAuthClient();
    if (!client)
      throw new Error('Sign-in is not available yet. Please contact your administrator.');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error('We could not sign you in. Check your email and password.');
    try {
      const confirmed = await confirmSession(data.session.access_token);
      setSession(confirmed);
      return confirmed;
    } catch (error) {
      await client.auth.signOut();
      throw error;
    }
  }

  async function signOut() {
    try {
      await (await getAuthClient())?.auth.signOut();
    } finally {
      setSession(null);
    }
  }

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
