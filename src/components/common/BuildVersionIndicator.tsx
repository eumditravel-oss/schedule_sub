// src/components/common/BuildVersionIndicator.tsx
import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';

interface BuildVersionIndicatorProps {
  inline?: boolean;
}

export const BuildVersionIndicator: React.FC<BuildVersionIndicatorProps> = ({ inline = false }) => {
  const [versionInfo, setVersionInfo] = useState<{ commit: string; environment: string }>({
    commit: 'unknown',
    environment: typeof window !== 'undefined' && window.location.hostname.includes('-qa') ? 'qa' : 'production',
  });

  useEffect(() => {
    api.getVersion()
      .then((data) => {
        const commitStr = data?.commit || (data as any)?.data?.commit || (import.meta.env.VITE_BUILD_SHA || '');
        if (commitStr) {
          setVersionInfo({
            commit: commitStr,
            environment: data?.environment || (data as any)?.data?.environment || (window.location.hostname.includes('-qa') ? 'qa' : 'production'),
          });
        }
      })
      .catch(() => {
        setVersionInfo((prev) => ({ ...prev, commit: 'unknown' }));
      });
  }, []);

  const frontendSha = (import.meta.env.VITE_BUILD_SHA || '').substring(0, 7);
  const backendSha = (versionInfo.commit && versionInfo.commit !== 'unknown' ? versionInfo.commit : import.meta.env.VITE_BUILD_SHA || '').substring(0, 7);
  const buildTime = import.meta.env.VITE_BUILD_TIME || '';
  const isMismatch = frontendSha && backendSha && frontendSha !== 'unknown' && backendSha !== 'unknown' && frontendSha !== backendSha;

  const envLabel = isMismatch ? 'Build mismatch' : versionInfo.environment === 'qa' ? 'QA' : 'Production';
  const envStyle = isMismatch
    ? 'bg-rose-100 text-rose-900 border-rose-300 font-black'
    : versionInfo.environment === 'qa'
    ? 'bg-amber-100 text-amber-900 border-amber-300'
    : 'bg-emerald-100 text-emerald-900 border-emerald-300';

  if (inline) {
    return (
      <div
        data-testid="build-version-indicator"
        data-frontend-sha={frontendSha}
        data-backend-sha={backendSha}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold bg-white text-slate-700 shadow-2xs"
      >
        <span className="text-slate-500 font-mono">Build: {backendSha} {buildTime ? `· ${buildTime}` : ''}</span>
        <span className="text-slate-300">·</span>
        <span className={`px-1.5 py-0.2 rounded text-[10px] font-extrabold border ${envStyle}`}>
          {envLabel}
        </span>
      </div>
    );
  }

  return (
    <div
      data-testid="build-version-indicator"
      data-frontend-sha={frontendSha}
      data-backend-sha={backendSha}
      className="fixed bottom-3 right-3 z-40 hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 bg-white/95 backdrop-blur-xs text-xs font-bold text-slate-700 shadow-md transition hover:shadow-lg"
    >
      <span className={`w-2 h-2 rounded-full ${isMismatch ? 'bg-rose-500' : 'bg-emerald-500'} animate-pulse`} />
      <span className="text-slate-600 font-mono text-[11px]">Build: {backendSha} {buildTime ? `· ${buildTime}` : ''}</span>
      <span className="text-slate-300">·</span>
      <span className={`px-1.5 py-0.2 rounded text-[10px] font-black uppercase border ${envStyle}`}>
        {envLabel}
      </span>
    </div>
  );
};
