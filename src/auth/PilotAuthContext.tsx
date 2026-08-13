import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { pilotAuth, type PilotSession } from '../services/api';

type PilotAuthState = {
  loading: boolean;
  session: PilotSession | null;
  login: (employeeId: string, pin: string) => Promise<PilotSession>;
  logout: () => Promise<void>;
  refresh: () => Promise<PilotSession | null>;
};

const PilotAuthContext = createContext<PilotAuthState | null>(null);

export function PilotAuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<PilotSession | null>(null);
  const refresh = useCallback(async () => {
    try {
      const next = await pilotAuth.session();
      setSession(next);
      return next;
    } catch (error: any) {
      if (error?.code === 'AUTH_REQUIRED' || error?.code === 'SESSION_EXPIRED' || error?.code === 'SESSION_REVOKED') {
        pilotAuth.clearLocalSession();
        setSession(null);
        return null;
      }
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const clearExpired = () => { pilotAuth.clearLocalSession(); setSession(null); };
    window.addEventListener('pilot-session-expired', clearExpired);
    return () => window.removeEventListener('pilot-session-expired', clearExpired);
  }, []);
  const login = useCallback(async (employeeId: string, pin: string) => {
    const next = await pilotAuth.login(employeeId, pin);
    setSession(next);
    return next;
  }, []);
  const logout = useCallback(async () => {
    try { await pilotAuth.logout(); } finally { pilotAuth.clearLocalSession(); setSession(null); }
  }, []);
  const value = useMemo(() => ({ loading, session, login, logout, refresh }), [loading, session, login, logout, refresh]);
  return <PilotAuthContext.Provider value={value}>{children}</PilotAuthContext.Provider>;
}

export function usePilotAuth() {
  const context = useContext(PilotAuthContext);
  if (!context) throw new Error('PilotAuthProvider is required');
  return context;
}
