import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { usePilotAuth } from '../auth/PilotAuthContext';
import type { Worker } from '../types';

export function OpenPilotActorSelector() {
  const { openTestMode, session, selectOpenPilotActor } = usePilotAuth();
  const internalTrust = session?.accessMode === 'internal_trust';
  const [workers, setWorkers] = useState<Worker[]>([]);
  useEffect(() => {
    if (!openTestMode) return;
    void api.getPilotLoginEmployees().then(setWorkers).catch(() => setWorkers([]));
  }, [openTestMode]);
  if (!openTestMode || !session) return null;
  return (
    <div className={`sticky top-0 z-[70] flex items-center justify-between gap-3 border-b px-4 py-2 text-xs shadow-sm ${internalTrust ? 'border-slate-200 bg-white text-slate-700' : 'border-amber-300 bg-amber-50 text-amber-950'}`}>
      <div className="flex items-center gap-2 font-semibold">
        {!internalTrust && <span className="rounded bg-amber-500 px-2 py-1 text-white">TEST MODE</span>}
        <span>{internalTrust ? '현재 사용자' : 'Pilot 테스트 사용자 선택'}</span>
      </div>
      <label className="flex items-center gap-2">
        <span className="font-medium">{internalTrust ? '사용자 선택' : 'Test Actor'}</span>
        <select
          aria-label={internalTrust ? '사용자 선택' : 'Test Actor 선택'}
          className={`rounded border bg-white px-2 py-1 text-xs ${internalTrust ? 'border-slate-300' : 'border-amber-400'}`}
          value={session.actor.employeeId}
          onChange={(event) => {
            void selectOpenPilotActor(event.target.value).then(() => window.location.reload());
          }}
        >
          {workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name} · {worker.access_role}</option>)}
        </select>
        {workers.find((worker) => worker.id === session.actor.employeeId)?.can_manage_schedule_engine === 1 && (
          <a href="/manager/operations" className={`rounded border bg-white px-2 py-1 font-semibold ${internalTrust ? 'border-slate-300 text-slate-700' : 'border-amber-500 text-amber-800'}`}>
            운영 현황
          </a>
        )}
      </label>
    </div>
  );
}
