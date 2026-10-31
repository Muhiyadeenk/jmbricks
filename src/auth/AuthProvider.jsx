import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState('');
  const [recovering, setRecovering] = useState(new URLSearchParams(window.location.search).get('recovery') === '1');
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    let changed = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      changed = true;
      if (!alive) return;
      setSession(next);
      setLoading(false);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_OUT') setRecovering(false);
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive || changed) return;
      setSession(data.session);
      setError(error ? 'Unable to restore your session. Please sign in again.' : '');
      setLoading(false);
    }).catch(() => { if (alive) { setError('Unable to connect. Check your connection and try again.'); setLoading(false); } });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);
  function finishRecovery() {
    setRecovering(false);
    window.history.replaceState(null, '', window.location.pathname + window.location.hash);
  }
  async function signOut() {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
    finishRecovery();
  }
  return <AuthContext.Provider value={{ session, loading, error, recovering, finishRecovery, signOut }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
