import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { usePilotAuth } from '../auth/PilotAuthContext';

function Metric({ label, value, tone = 'slate' }: { label: string; value: React.ReactNode; tone?: string }) {
  return <div className={`rounded-xl border border-${tone}-200 bg-${tone}-50 p-4`}><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-2xl font-bold text-slate-900">{value}</div></div>;
}

export function ManagerOperationsPage() {
  const { session } = usePilotAuth();
  const [snapshot, setSnapshot] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const act = async (work: () => Promise<any>) => { setBusy(true); try { await work(); await refresh(); } catch (e: any) { setError(e?.message || '처리하지 못했습니다.'); } finally { setBusy(false); } };
  const refresh = async () => {
    try {
      const [next, notice] = await Promise.all([api.getManagerOperations(), api.getManagerNotifications({ unread: 'true' })]);
      setSnapshot(next); setNotifications(notice.notifications || []); setError('');
    } catch (e: any) { setError(e?.message || '관리자 운영 현황을 불러오지 못했습니다.'); }
  };
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 30000);
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, []);
  const date = snapshot?.local_date || '';
  const worklog = snapshot?.worklogSummary || {};
  const schedule = snapshot?.scheduleSummary || {};
  const approvals = snapshot?.approvalSummary || {};
  const readOnly = snapshot?.scope?.read_only || false;
  const canManage = snapshot?.scope?.can_manage || false;
  const pending = useMemo(() => snapshot?.approvals || [], [snapshot]);
  if (error && !snapshot) return <div className="mx-auto max-w-6xl p-6"><div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-800">{error}</div></div>;
  return <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6">
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex justify-end"><Link to="/manager/worklog-approvals" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">업무일지 승인</Link></div>
      <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold text-emerald-700">Manager Operations</p><h1 className="text-2xl font-bold text-slate-900">개발팀 운영 현황</h1><p className="text-sm text-slate-500">기준일 {date} · {session?.actor.office || 'ALL'} · {readOnly ? '읽기 전용' : '관리자'}</p></div><button onClick={() => void refresh()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold">새로고침</button></header>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-6"><Metric label="관리 직원" value={worklog.employee_count ?? 0}/><Metric label="Morning 완료" value={worklog.morning_complete ?? 0}/><Metric label="Morning 지각" value={worklog.morning_late ?? 0} tone="amber"/><Metric label="EOD 완료" value={worklog.eod_complete ?? 0}/><Metric label="일정 지연" value={schedule.delayed ?? 0} tone="amber"/><Metric label="승인 대기" value={approvals.pending ?? 0} tone="violet"/></section>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5"><Metric label="업무일지 정상" value={approvals.worklog_normal ?? worklog.approval_normal ?? 0} tone="emerald"/><Metric label="확인 필요" value={approvals.worklog_review_required ?? worklog.approval_review_required ?? 0} tone="amber"/><Metric label="예외" value={approvals.worklog_exception ?? worklog.approval_exception ?? 0} tone="rose"/><Metric label="3시간+ 대기" value={approvals.worklog_aging_3h ?? worklog.approval_aging_3h ?? 0} tone="violet"/><Metric label="1일+ 대기" value={approvals.worklog_aging_1d ?? worklog.approval_aging_1d ?? 0} tone="rose"/></section>
      <section className="grid gap-6 lg:grid-cols-[1.5fr_1fr]"><div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><h2 className="font-bold">직원별 업무일지·Shadow</h2><span className="text-xs text-slate-500">30초 자동 갱신</span></div><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b text-xs text-slate-500"><tr><th className="p-2">직원</th><th className="p-2">Office</th><th className="p-2">Morning</th><th className="p-2">EOD</th><th className="p-2">Actual</th><th className="p-2">Shadow</th><th className="p-2">변동</th></tr></thead><tbody>{(snapshot?.employees || []).map((row: any) => <tr key={row.id} className="border-b last:border-0"><td className="p-2 font-semibold">{row.name}</td><td className="p-2">{row.country_code}</td><td className="p-2">{row.morning}</td><td className="p-2">{row.eod}</td><td className="p-2">{row.actual_minutes}분</td><td className="p-2"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{row.shadow_status}</span></td><td className={`p-2 font-semibold ${row.schedule_variance_workdays > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{row.schedule_variance_workdays > 0 ? '+' : ''}{row.schedule_variance_workdays}일</td></tr>)}</tbody></table></div></div>
      <div className="space-y-6"><div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><h2 className="font-bold">알림</h2><button onClick={() => api.markAllManagerNotificationsRead().then(refresh)} className="text-xs text-blue-700">모두 읽음</button></div>{notifications.length ? <div className="space-y-2">{notifications.slice(0,8).map((n: any) => <button key={n.event_id} onClick={() => api.markManagerNotificationRead(n.event_id).then(refresh)} className="block w-full rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50"><div className="flex justify-between text-xs"><span className="font-bold">{n.event_type}</span><span>{n.severity}</span></div><div className="mt-1 text-sm text-slate-700">{n.payload?.project_end_after ? `프로젝트 종료 후보: ${n.payload.project_end_after}` : '관리자 확인이 필요한 운영 이벤트입니다.'}</div></button>)}</div> : <p className="text-sm text-slate-500">읽지 않은 알림이 없습니다.</p>}</div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="mb-3 font-bold">검토 대기</h2><div className="space-y-2 text-sm"><div className="flex justify-between"><span>Forecast 승인</span><b>{approvals.pending ?? 0}</b></div><div className="flex justify-between"><span>초과근무</span><b>{approvals.overtime ?? 0}</b></div><div className="flex justify-between"><span>정정 요청</span><b>{approvals.corrections ?? 0}</b></div><div className="flex justify-between"><span>Blocked</span><b>{schedule.blocked ?? 0}</b></div></div>{pending.length > 0 && <div className="mt-3 space-y-2">{pending.slice(0, 5).map((item: any) => <div key={item.approval_request_id} className="rounded-lg border border-violet-100 bg-violet-50 p-2"><div className="text-xs">프로젝트 {item.project_id} · {item.status}</div>{canManage && <div className="mt-2 flex gap-2"><button disabled={busy} onClick={() => act(() => api.approveShadowForecast(item.shadow_version_id))} className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white">승인·적용</button><button disabled={busy} onClick={() => act(() => api.rejectShadowForecast(item.shadow_version_id, '관리자 검토'))} className="rounded bg-rose-600 px-2 py-1 text-xs font-semibold text-white">반려</button></div>}</div>)}</div>}</div></div></section>
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="mb-3 font-bold">오늘의 요약</h2><div className="grid gap-3 sm:grid-cols-4"><div><div className="text-xs text-slate-500">Morning 미작성</div><b>{worklog.morning_missing ?? 0}</b></div><div><div className="text-xs text-slate-500">EOD 미작성</div><b>{worklog.eod_missing ?? 0}</b></div><div><div className="text-xs text-slate-500">일정 앞당김</div><b>{schedule.advanced ?? 0}</b></div><div><div className="text-xs text-slate-500">읽지 않은 알림</div><b>{snapshot?.notifications?.unread ?? 0}</b></div></div></section>
      {busy && <div className="text-xs text-slate-500">처리 중…</div>}
    </div>
  </main>;
}

export default ManagerOperationsPage;
