import React, { useCallback, useEffect, useState } from 'react';
import { Worker, CountryHoliday, CalendarOverride } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { CheckCircle2, Clock, AlertTriangle, Calendar, Flame, RefreshCw, FolderCheck } from 'lucide-react';
import { resolveWorkDayStatus } from '../../utils/workCalendar';
import { getKoreaDateString } from '../../utils/dateUtils';
import { api } from '../../services/api';
import { OverdueTaskDetailModal } from '../modals/OverdueTaskDetailModal';

interface TodaySummaryCardProps {
  currentWorker: Worker | null;
  holidays?: CountryHoliday[];
  overrides?: CalendarOverride[];
  refreshTrigger?: number;
}

export interface TodaySummaryData {
  date: string;
  scheduled_today: { count: number; project_ids: string[] };
  in_progress: { count: number; project_ids: string[] };
  completed_today: { count: number; project_ids: string[] };
  completed_this_month: { count: number; project_ids: string[] };
  overdue: { count: number; task_ids: string[] };
}

export const TodaySummaryCard: React.FC<TodaySummaryCardProps> = ({
  currentWorker,
  holidays = [],
  overrides = [],
  refreshTrigger = 0,
}) => {
  const { lang } = useI18n();
  const todayStr = getKoreaDateString();

  const [data, setData] = useState<TodaySummaryData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isOverdueModalOpen, setIsOverdueModalOpen] = useState<boolean>(false);

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getTodaySummary(todayStr);
      setData(res);
    } catch (err: any) {
      console.error('[TodaySummaryCard] Fetch error:', err);
      setError(err?.message || 'Failed to load today summary');
    } finally {
      setLoading(false);
    }
  }, [todayStr]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary, refreshTrigger]);

  const dayStatus = currentWorker ? resolveWorkDayStatus(todayStr, currentWorker, holidays, overrides) : null;

  const scheduledTodayCount = data?.scheduled_today?.count ?? 0;
  const inProgressCount = data?.in_progress?.count ?? 0;
  const completedTodayCount = data?.completed_today?.count ?? 0;
  const completedThisMonthCount = data?.completed_this_month?.count ?? 0;
  const overdueCount = data?.overdue?.count ?? 0;

  return (
    <div
      data-testid="today-summary-card"
      className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs text-slate-800 shrink-0 select-none"
    >
      {/* Header Row */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="font-extrabold text-xs text-slate-900" data-testid="today-date-text">
            {todayStr}
          </span>

          {/* Business Work Status Chip */}
          {dayStatus && (
            <span
              data-testid="worker-today-status-chip"
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold inline-flex items-center gap-1 ${
                dayStatus.is_working_day
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  dayStatus.is_working_day ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                }`}
              />
              {dayStatus.label_ko}
            </span>
          )}
        </div>

        <button
          type="button"
          data-testid="today-summary-refresh-btn"
          onClick={fetchSummary}
          className="text-slate-400 hover:text-blue-600 transition p-1 rounded-md hover:bg-slate-50"
          title={lang === 'vi' ? 'Làm mới tóm tắt' : '오늘 요약 새로고침'}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
        </button>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* KPI 1: Scheduled Today */}
        <div
          data-testid="today-kpi-scheduled"
          className="bg-slate-50 border border-slate-100 rounded-lg p-2 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
            <span>{lang === 'vi' ? 'Lịch hôm nay' : '오늘 일정'}</span>
            <Clock className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="text-sm font-black text-slate-900">
            {loading ? <span className="animate-pulse">...</span> : `${scheduledTodayCount}개 ${lang === 'vi' ? 'dự án' : '프로젝트'}`}
          </div>
        </div>

        {/* KPI 2: In Progress */}
        <div
          data-testid="today-kpi-in-progress"
          className="bg-blue-50/50 border border-blue-100 rounded-lg p-2 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-[11px] font-medium text-blue-700">
            <span>{lang === 'vi' ? 'Đang thực hiện' : '진행 중'}</span>
            <Flame className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <div className="text-sm font-black text-blue-900">
            {loading ? <span className="animate-pulse">...</span> : `${inProgressCount}개 ${lang === 'vi' ? 'dự án' : '프로젝트'}`}
          </div>
        </div>

        {/* KPI 3: Completed Today */}
        <div
          data-testid="today-kpi-completed-today"
          className="bg-emerald-50/50 border border-emerald-100 rounded-lg p-2 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-[11px] font-medium text-emerald-700">
            <span>{lang === 'vi' ? 'Hoàn thành hôm nay' : '오늘 완료'}</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-sm font-black text-emerald-900">
            {loading ? <span className="animate-pulse">...</span> : `${completedTodayCount}개 ${lang === 'vi' ? 'dự án' : '프로젝트'}`}
          </div>
        </div>

        {/* KPI 4: Completed This Month */}
        <div
          data-testid="today-kpi-completed-month"
          className="bg-violet-50/50 border border-violet-100 rounded-lg p-2 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-[11px] font-medium text-violet-700">
            <span>{lang === 'vi' ? 'Hoàn thành tháng này' : '이번 달 완료 프로젝트'}</span>
            <FolderCheck className="w-3.5 h-3.5 text-violet-500" />
          </div>
          <div className="text-sm font-black text-violet-900">
            {loading ? <span className="animate-pulse">...</span> : `${completedThisMonthCount}개 ${lang === 'vi' ? 'dự án' : '프로젝트'}`}
          </div>
        </div>
      </div>

      {/* Secondary Risk Strips */}
      {overdueCount > 0 && (
        <div
          data-testid="today-summary-overdue-secondary-strip"
          onClick={() => setIsOverdueModalOpen(true)}
          className="mt-2 px-3 py-1 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-[11px] font-extrabold flex items-center justify-between cursor-pointer hover:bg-amber-100 transition"
        >
          <span className="flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>{lang === 'vi' ? 'Công việc quá hạn (Overdue)' : '기한 경과 작업'}</span>
          </span>
          <span className="bg-amber-200 text-amber-900 px-2 py-0.5 rounded font-black text-xs">
            {overdueCount}건
          </span>
        </div>
      )}

      {Number((data as any)?.completion_review?.count || 0) > 0 && (
        <div data-testid="today-summary-completion-review-strip" className="mt-2 px-3 py-1 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 text-[11px] font-extrabold flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            <span>{lang === 'vi' ? 'Công việc cần xác nhận hoàn thành' : '완료 확인 필요 작업'}</span>
          </span>
          <span className="bg-blue-200 text-blue-900 px-2 py-0.5 rounded font-black text-xs">
            {Number((data as any)?.completion_review?.count)}건
          </span>
        </div>
      )}

      {Number((data as any)?.blocked_count || 0) > 0 && (
        <div data-testid="today-summary-blocked-secondary-strip" className="mt-2 px-3 py-1 bg-rose-50 border border-rose-200 rounded-lg text-rose-900 text-[11px] font-extrabold flex items-center justify-between">
          <span className="flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            <span>{lang === 'vi' ? 'Công việc bị tắc nghẽn (Blocked)' : '진행 막힘 (Blocked) 작업'}</span>
          </span>
          <span className="bg-rose-200 text-rose-900 px-2 py-0.5 rounded font-black text-xs">
            {Number((data as any)?.blocked_count)}건
          </span>
        </div>
      )}

      <OverdueTaskDetailModal
        isOpen={isOverdueModalOpen}
        onClose={() => setIsOverdueModalOpen(false)}
        date={todayStr}
      />
    </div>
  );
};
