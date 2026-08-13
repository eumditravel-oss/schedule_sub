import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getOpenPilotActorId, pilotAuth, setOpenPilotActorId, type PilotSession } from '../services/api';

type PilotAuthState = {
  loading: boolean;
  session: PilotSession | null;
  login: (employeeId: string, pin: string) => Promise<PilotSession>;
  logout: () => Promise<void>;
  refresh: () => Promise<PilotSession | null>;
  openTestMode: boolean;
  selectOpenPilotActor: (employeeId: string) => Promise<PilotSession | null>;
};

const PilotAuthContext = createContext<PilotAuthState | null>(null);

export function PilotAuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<PilotSession | null>(null);
  const [openTestMode, setOpenTestMode] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const infoResponse = await globalThis.fetch('/api/build-info', { credentials: 'same-origin' });
      const info: any = await infoResponse.json();
      const isOpen = info?.data?.featureFlags?.accessMode === 'open_test';
      setOpenTestMode(isOpen);
      if (isOpen) {
        const employees = await api.getPilotLoginEmployees();
        const selected = getOpenPilotActorId() || employees[0]?.id || '';
        if (!selected) throw new Error('No active pilot employees configured');
        setOpenPilotActorId(selected);
        const actor = (employees.find((employee) => employee.id === selected) || employees[0])!;
        const openSession: PilotSession = {
          authenticated: true,
          actor: { employeeId: actor.id, displayName: actor.name, role: actor.access_role || 'EDITOR', office: actor.country_code || null, timezone: null },
          expiresAt: null,
          isQaTestSession: false,
          accessMode: 'open_test',
        };
        setSession(openSession);
        return openSession;
      }
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
    if (openTestMode) return;
    try { await pilotAuth.logout(); } finally { pilotAuth.clearLocalSession(); setSession(null); }
  }, [openTestMode]);
  const selectOpenPilotActor = useCallback(async (employeeId: string) => {
    if (!openTestMode) return session;
    setOpenPilotActorId(employeeId);
    const employees = await api.getPilotLoginEmployees();
    const actor = employees.find((employee) => employee.id === employeeId);
    if (!actor) return session;
    const next: PilotSession = { authenticated: true, actor: { employeeId: actor.id, displayName: actor.name, role: actor.access_role || 'EDITOR', office: actor.country_code || null, timezone: null }, expiresAt: null, accessMode: 'open_test' };
    setSession(next);
    return next;
  }, [openTestMode, session]);
  const value = useMemo(() => ({ loading, session, login, logout, refresh, openTestMode, selectOpenPilotActor }), [loading, session, login, logout, refresh, openTestMode, selectOpenPilotActor]);
  return <PilotAuthContext.Provider value={value}>{children}</PilotAuthContext.Provider>;
}

export function usePilotAuth() {
  const context = useContext(PilotAuthContext);
  if (!context) throw new Error('PilotAuthProvider is required');
  return context;
}
