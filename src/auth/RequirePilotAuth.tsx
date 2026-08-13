import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { usePilotAuth } from './PilotAuthContext';

export function RequirePilotAuth({ children }: { children: React.ReactNode }) {
  const { loading, session } = usePilotAuth();
  const location = useLocation();
  if (loading) return <main className="min-h-screen grid place-items-center bg-slate-50 text-sm font-semibold text-slate-600">세션 확인 중…</main>;
  if (!session) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  return <>{children}</>;
}
