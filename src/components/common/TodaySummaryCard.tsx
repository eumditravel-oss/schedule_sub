import React, { useEffect, useState } from 'react';
import { Worker, CountryHoliday, CalendarOverride } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { CheckCircle2, Clock, AlertTriangle, Calendar, Flame, RefreshCw, FolderCheck } from 'lucide-react';
import { resolveWorkDayStatus } from '../../utils/workCalendar';
import { getKoreaDateString } from '../../utils/dateUtils';
import { api } from '../../services/api';

interface TodaySummaryCardProps {
  currentWorker: Worker | null;
  holidays?: CountryHoliday[];
  overrides?: CalendarOverride[];
  refreshTrigger?: number;
}

export interface TodaySummaryData {
  date: string;
  scheduled_today: { count: number; task_ids: string[] };
  in_progress: { count: number; task_ids: string[] };
  completed_today: { count: number; task_ids: string[] };
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

  const fetchSummary = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getTodaySummary(todayStr);
      setData(res || null);
    } catch (err: any) {
      console.error('[TodaySummary] API error details:', {
        message: err?.message,
        code: err?.code,
        status: err?.status,
        details: err?.details,
      });
      setError(err?.message || 'Error fetching summary');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [todayStr, refreshTrigger]);

  const workerStatus = currentWorker
    ? resolveWorkDayStatus(todayStr, currentWorker, holidays, overrides)
    : null;

  if (error) {
    return (
      <div
        data-testid="today-summary-card"
        className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-2xs text-xs space-y-2.5"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
            <h4 className="font-extrabold text-slate-900 text-xs">
              {lang === 'vi' ? 'Công việc hôm nay' : '오늘의 업무 현황'}
            </h4>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200">
              {todayStr}
            </span>
          </div>
        </div>
        <div data-testid="today-summary-error" className="py-3 text-center text-rose-600 font-bold flex items-center justify-center gap-2">
          <span>{lang === 'vi' ? 'Không thể tải công việc hôm nay.' : '오늘 업무 현황을 불러오지 못했습니다.'}</span>
          <button
            type="button"
            onClick={fetchSummary}
            className="px-2 py-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-md font-bold text-xs flex items-center gap-1 transition"
          >
            <RefreshCw className="w-3 h-3" />
            <span>{lang === 'vi' ? 'Thử lại' : '재시도'}</span>
          </button>
        </div>
      </div>
    );
  }

  const scheduledTodayCount = data?.scheduled_today?.count ?? 0;
  const inProgressCount = data?.in_progress?.count ?? 0;
  const completedTodayCount = data?.completed_today?.count ?? 0;
  const completedThisMonthCount = data?.completed_this_month?.count ?? 0;
  const overdueCount = data?.overdue?.count ?? 0;

  return (
    <div
      data-testid="today-summary-card"
      className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-2xs text-xs space-y-2.5"
    >
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
          <h4 className="font-extrabold text-slate-900 text-xs">
            {lang === 'vi' ? 'Công việc hôm nay' : '오늘의 업무 현황'}
          </h4>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200">
            {todayStr}
          </span>
        </div>
        {workerStatus && !workerStatus.is_working_day && (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
            {lang === 'vi' ? workerStatus.label_vi : workerStatus.label_ko}
          </span>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
        {/* 1. Today Scheduled */}
        <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 space-y-0.5">
          <div className="text-[10px] text-slate-500 font-bold flex items-center justify-center gap-1">
            <Clock className="w-3 h-3 text-slate-500" />
            <span>{lang === 'vi' ? 'Lịch hôm nay' : '오늘 예정'}</span>
          </div>
          <div className="text-sm font-black text-slate-800">
            {loading ? <span className="animate-pulse">...</span> : `${scheduledTodayCount}건`}
          </div>
        </div>

        {/* 2. In Progress */}
        <div className="p-2 rounded-xl bg-blue-50/70 border border-blue-200 space-y-0.5">
          <div className="text-[10px] text-blue-700 font-bold flex items-center justify-center gap-1">
            <Flame className="w-3 h-3 text-blue-600" />
            <span>{lang === 'vi' ? 'Đang làm' : '진행 중'}</span>
          </div>
          <div className="text-sm font-black text-blue-900">
            {loading ? <span className="animate-pulse">...</span> : `${inProgressCount}건`}
          </div>
        </div>

        {/* 3. Completed Today */}
        <div
          title={lang === 'vi' ? 'Số công việc chi tiết được xác nhận hoàn thành hôm nay' : '오늘 완료 확정된 세부 작업 수'}
          className="p-2 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-0.5"
        >
          <div className="text-[10px] text-emerald-700 font-bold flex items-center justify-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>{lang === 'vi' ? 'Hoàn thành' : '오늘 완료'}</span>
          </div>
          <div className="text-sm font-black text-emerald-900">
            {loading ? <span className="animate-pulse">...</span> : `${completedTodayCount}건`}
          </div>
        </div>

        {/* 4. Completed This Month (Projects) */}
        <div
          title={lang === 'vi' ? 'Số lượng dự án thực tế đã hoàn thành trong tháng này' : '이번 달 실제 완료 처리된 프로젝트 수'}
          className="p-2 rounded-xl bg-violet-50/70 border border-violet-200 space-y-0.5"
        >
          <div className="text-[10px] text-violet-700 font-bold flex items-center justify-center gap-1">
            <FolderCheck className="w-3 h-3 text-violet-600" />
            <span>{lang === 'vi' ? 'Dự án hoàn thành tháng này' : '이번 달 완료 프로젝트'}</span>
          </div>
          <div className="text-sm font-black text-violet-900">
            {loading ? <span className="animate-pulse">...</span> : `${completedThisMonthCount}개`}
          </div>
        </div>
      </div>

      {/* Secondary Risk Strips */}
      {overdueCount > 0 && (
        <div data-testid="today-summary-overdue-secondary-strip" className="mt-2 px-3 py-1 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-[11px] font-extrabold flex items-center justify-between">
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
    </div>
  );
};
