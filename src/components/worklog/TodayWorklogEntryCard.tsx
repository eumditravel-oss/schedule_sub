import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, ExternalLink, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Worker } from '../../types';
import { api } from '../../services/api';

interface TodayWorklogEntryCardProps {
  currentWorker: Worker | null;
  language: 'ko' | 'vi';
  onOpen?: () => void;
}

function localDateFor(worker: Worker | null) {
  const timeZone = worker?.country_code === 'VN' ? 'Asia/Ho_Chi_Minh' : 'Asia/Seoul';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '01';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function managerFor(worker: Worker | null) {
  // VIEWER executives use the same read-only operations snapshot; only
  // EDITOR + schedule-engine managers can approve from the linked queue.
  return Boolean(worker && (worker.access_role === 'VIEWER' || (worker.access_role === 'EDITOR' && Number(worker.can_manage_schedule_engine) === 1)));
}

function statusLabel(status: string | undefined, language: 'ko' | 'vi') {
  if (status === 'APPROVED') return language === 'vi' ? 'Đã duyệt' : '승인 완료';
  if (status === 'PENDING') return language === 'vi' ? 'Chờ quản lý duyệt' : '승인 대기';
  if (status === 'RETURNED' || status === 'CORRECTION_REQUESTED') return language === 'vi' ? 'Cần chỉnh sửa' : '수정 요청';
  if (status === 'REJECTED') return language === 'vi' ? 'Từ chối' : '반려';
  if (status === 'EOD_SUBMITTED') return language === 'vi' ? 'Đã gửi EOD' : 'EOD 제출';
  if (status === 'MORNING_SUBMITTED') return language === 'vi' ? 'Đã gửi Morning' : 'Morning 제출';
  return language === 'vi' ? 'Chưa bắt đầu' : '미작성';
}

export function TodayWorklogEntryCard({ currentWorker, language, onOpen }: TodayWorklogEntryCardProps) {
  const [context, setContext] = useState<any>(null);
  const [managerSnapshot, setManagerSnapshot] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const date = useMemo(() => localDateFor(currentWorker), [currentWorker]);
  const isManager = managerFor(currentWorker);

  useEffect(() => {
    if (!currentWorker?.id) { setContext(null); setManagerSnapshot(null); return; }
    let cancelled = false;
    setLoading(true);
    const request = isManager
      ? api.getManagerOperations(date).then((value) => { if (!cancelled) setManagerSnapshot(value); })
      : api.getWorklogContext(currentWorker.id, date).then((value) => { if (!cancelled) setContext(value); });
    void request.catch(() => { if (!cancelled) { setContext(null); setManagerSnapshot(null); } }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [currentWorker?.id, date, isManager]);

  if (!currentWorker) return null;
  const worklog = context?.worklog || {};
  const tasks = (context?.scheduled_tasks || []).slice(0, 4);
  const managerWorklog = managerSnapshot?.worklogSummary || {};
  const managerApprovals = managerSnapshot?.approvalSummary || {};
  const title = language === 'vi' ? 'Công việc hôm nay' : '오늘 할 일';
  const office = currentWorker.country_code === 'VN' ? 'Vietnam' : 'Korea';

  return (
    <section data-testid="today-worklog-entry-card" className="rounded-xl border border-emerald-200 bg-gradient-to-br from-white to-emerald-50/40 p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-emerald-600" />
            <h2 className="text-base font-extrabold text-slate-900">{isManager ? (language === 'vi' ? 'Tổng quan công việc hôm nay' : '오늘 업무 현황') : title}</h2>
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-500">{date} · {office} · {currentWorker.name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isManager && <Link to="/manager/operations" data-testid="today-manager-operations-btn" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-extrabold text-slate-700 hover:bg-slate-50">오늘 전체 현황</Link>}
          <button type="button" data-testid="today-worklog-open-btn" onClick={onOpen} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-extrabold text-white shadow-sm hover:bg-emerald-700">
            {isManager ? (language === 'vi' ? 'Mở phê duyệt' : '승인 큐 열기') : (language === 'vi' ? 'Mở nhật ký' : '오늘 업무일지 작성')}
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {loading ? <div className="mt-4 h-12 animate-pulse rounded-lg bg-slate-100" /> : isManager ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-2.5"><div className="text-[11px] text-slate-500">{language === 'vi' ? 'Nhân viên' : '대상 직원'}</div><div className="mt-1 text-lg font-extrabold">{managerWorklog.employee_count ?? 0}</div></div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5"><div className="text-[11px] text-blue-700">Morning</div><div className="mt-1 text-lg font-extrabold text-blue-900">{managerWorklog.morning_complete ?? 0} / {managerWorklog.employee_count ?? 0}</div></div>
          <div className="rounded-lg border border-violet-200 bg-violet-50 p-2.5"><div className="text-[11px] text-violet-700">EOD {language === 'vi' ? 'đang chờ' : '승인 대기'}</div><div className="mt-1 text-lg font-extrabold text-violet-900">{managerApprovals.worklog_pending ?? 0}</div></div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5"><div className="text-[11px] text-amber-700">{language === 'vi' ? 'Ngoại lệ' : '예외 검토'}</div><div className="mt-1 text-lg font-extrabold text-amber-900">{(managerSnapshot?.overtime || []).length + (managerSnapshot?.corrections || []).length}</div></div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-blue-800">Morning · {statusLabel(worklog.current_morning_revision_id ? 'MORNING_SUBMITTED' : undefined, language)}</span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-800">EOD · {statusLabel(worklog.approval_status || (worklog.current_eod_revision_id ? 'EOD_SUBMITTED' : undefined), language)}</span>
            <span className="ml-auto inline-flex items-center gap-1 text-slate-600"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />{language === 'vi' ? 'Lịch chính thức' : '공식 일정 기준'}</span>
          </div>
          {tasks.length ? <ul className="grid gap-2 sm:grid-cols-2">{tasks.map((task: any) => <li key={task.task_id} className="rounded-lg border border-slate-200 bg-white px-3 py-2"><div className="truncate text-xs font-extrabold text-slate-800">{task.project_name}</div><div className="truncate text-xs text-slate-600">{task.task_name}</div><div className="mt-1 text-[10px] font-semibold text-slate-400">Official: {task.official_forecast_start || task.start_date || '-'} ~ {task.official_forecast_end || task.end_date || '-'}</div></li>)}</ul> : <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-xs font-semibold text-slate-600">{language === 'vi' ? 'Hôm nay không có công việc chính thức được phân công.' : '오늘 공식 배정 업무가 없습니다. 필요하면 다른 업무를 추가할 수 있습니다.'}</div>}
        </div>
      )}
    </section>
  );
}

export default TodayWorklogEntryCard;
