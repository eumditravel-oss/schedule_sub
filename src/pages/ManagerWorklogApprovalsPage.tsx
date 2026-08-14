import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronLeft, Eye, RotateCcw, X } from 'lucide-react';
import { api } from '../services/api';
import { usePilotAuth } from '../auth/PilotAuthContext';

const statusLabel: Record<string, string> = {
  PENDING: '승인 대기', RETURNED: '수정 요청', APPROVED: '승인 완료', REJECTED: '반려',
};

export function ManagerWorklogApprovalsPage() {
  const { session } = usePilotAuth();
  const [status, setStatus] = useState('PENDING');
  const [rows, setRows] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try { setRows(await api.getManagerWorklogApprovals({ status })); setError(''); }
    catch (e: any) { setError(e?.message || 'Worklog 승인 대기열을 불러오지 못했습니다.'); }
  }, [status]);
  useEffect(() => { void refresh(); }, [refresh]);

  const open = async (row: any) => {
    try { setSelected(await api.getManagerWorklogApproval(row.id)); setReason(''); }
    catch (e: any) { setError(e?.message || '상세 정보를 불러오지 못했습니다.'); }
  };
  const decide = async (action: 'approve' | 'return' | 'reject') => {
    if (!selected?.id || !selected?.current_eod_revision_id) return;
    if ((action !== 'approve') && !reason.trim()) { setError(action === 'return' ? '수정 요청 사유를 입력하세요.' : '반려 사유를 입력하세요.'); return; }
    setBusy(true);
    try {
      await api.reviewManagerWorklog(selected.id, action, selected.current_eod_revision_id, reason.trim() || undefined);
      setSelected(null); setReason(''); await refresh();
    } catch (e: any) { setError(e?.message || 'Worklog 승인 처리를 완료하지 못했습니다.'); }
    finally { setBusy(false); }
  };

  return <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6">
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><Link to="/manager/operations" className="inline-flex items-center gap-1 text-sm text-slate-500"><ChevronLeft className="h-4 w-4"/>운영 현황</Link><p className="mt-3 text-sm font-semibold text-emerald-700">Manager Worklog</p><h1 className="text-2xl font-bold text-slate-900">업무일지 승인</h1><p className="text-sm text-slate-500">{session?.actor.office || '전체'} · 제출된 EOD를 검토하고 Actual 반영을 결정합니다.</p></div>
        <button onClick={() => void refresh()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold">새로고침</button>
      </header>
      <nav className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        {[['PENDING','승인 대기'],['RETURNED','수정 요청'],['APPROVED','승인 완료'],['REJECTED','반려'],['ALL','전체']].map(([value,label]) => <button key={value} onClick={() => setStatus(value)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${status === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{label}</button>)}
      </nav>
      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      <section className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-2">
          {rows.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">해당 상태의 업무일지가 없습니다.</div>}
          {rows.map((row) => <button key={row.id} onClick={() => void open(row)} className={`w-full rounded-xl border bg-white p-4 text-left shadow-sm transition hover:border-emerald-400 ${selected?.id === row.id ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-200'}`}><div className="flex flex-wrap items-center justify-between gap-2"><div className="font-bold text-slate-900">{row.employee_name || row.employee_id}</div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">{statusLabel[row.approval_status] || row.approval_status}</span></div><div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500 sm:grid-cols-4"><span>Office: {row.employee_country || '-'}</span><span>근무일: {row.local_work_date}</span><span>Actual: {row.actual_recorded_minutes || 0}분</span><span>Task: {row.entry_count || 0}개</span></div><div className="mt-2 text-xs text-slate-400">제출: {row.eod_submitted_at_utc || '-'} · Revision {row.eod_revision_number || row.current_revision_number}</div></button>)}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {!selected ? <div className="grid min-h-64 place-items-center text-center text-sm text-slate-500"><Eye className="mb-2 h-7 w-7 text-slate-300"/>왼쪽 목록에서 업무일지를 선택하세요.</div> : <>
            <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">{selected.employee_id} · {selected.local_work_date}</h2><p className="text-xs text-slate-500">Revision {selected.current_revision_number} · {statusLabel[selected.approval_status] || selected.approval_status}</p></div><span className="rounded bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">승인 전 Actual 미반영</span></div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Actual Minutes</div><b>{selected.actual_recorded_minutes || 0}분</b></div><div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Capacity</div><b>{selected.capacity_minutes || 0}분</b></div><div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Gap</div><b>{selected.has_gap ? selected.gap_reason_code || '있음' : '없음'}</b></div><div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">Overtime</div><b>{selected.overtime_candidate_minutes || 0}분</b></div></div>
            <div className="mt-4 space-y-2"><h3 className="font-semibold">제출 내용</h3>{(selected.entries || []).filter((entry: any) => entry.revision_id === selected.current_eod_revision_id).map((entry: any) => <div key={entry.id} className="rounded-lg border border-slate-200 p-3 text-sm"><div className="font-semibold">{entry.task_name || entry.work_category}</div><div className="mt-1 grid grid-cols-2 gap-1 text-xs text-slate-500"><span>Actual {entry.actual_minutes || 0}분</span><span>Progress {entry.progress_after == null ? '-' : `${entry.progress_after}%`}</span><span>Remaining {entry.remaining_estimated_minutes == null ? '-' : `${entry.remaining_estimated_minutes}분`}</span><span>{entry.work_result || entry.deliverable || entry.blocker || '-'}</span></div></div>)}</div>
            {selected.approval_status === 'PENDING' && <><textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="수정 요청/반려 사유(승인은 선택)" className="mt-4 min-h-20 w-full rounded-lg border border-slate-300 p-3 text-sm"/><div className="mt-3 flex flex-wrap justify-end gap-2"><button disabled={busy} onClick={() => void decide('return')} className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800"><RotateCcw className="h-4 w-4"/>수정 요청</button><button disabled={busy} onClick={() => void decide('reject')} className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800"><X className="h-4 w-4"/>반려</button><button disabled={busy} onClick={() => void decide('approve')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"><Check className="h-4 w-4"/>승인</button></div></>}
          </>}
        </div>
      </section>
    </div>
  </main>;
}

export default ManagerWorklogApprovalsPage;
