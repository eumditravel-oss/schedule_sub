import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { usePilotAuth } from '../auth/PilotAuthContext';
import type { Worker } from '../types';

export function OpenPilotActorSelector() {
  const { openTestMode, session, selectOpenPilotActor } = usePilotAuth();
  const [workers, setWorkers] = useState<Worker[]>([]);
  useEffect(() => {
    if (!openTestMode) return;
    void api.getPilotLoginEmployees().then(setWorkers).catch(() => setWorkers([]));
  }, [openTestMode]);
  if (!openTestMode || !session) return null;
  return (
    <div className="sticky top-0 z-[70] flex items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-950 shadow-sm">
      <div className="flex items-center gap-2 font-semibold">
        <span className="rounded bg-amber-500 px-2 py-1 text-white">TEST MODE</span>
        <span>선택 직원 기준으로 업무 흐름을 시뮬레이션합니다.</span>
      </div>
      <label className="flex items-center gap-2">
        <span className="font-medium">Test Actor</span>
        <select
          aria-label="Test Actor 선택"
          className="rounded border border-amber-400 bg-white px-2 py-1 text-xs"
          value={session.actor.employeeId}
          onChange={(event) => {
            void selectOpenPilotActor(event.target.value).then(() => {
              // Legacy pages hold a local worker snapshot; a full reload makes
              // actor A/B switching atomic across every routed view and draft.
              window.location.reload();
            });
          }}
        >
          {workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name} · {worker.access_role}</option>)}
        </select>
      </label>
    </div>
  );
}
