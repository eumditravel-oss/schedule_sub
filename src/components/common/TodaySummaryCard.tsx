// src/components/common/TodaySummaryCard.tsx
import React from 'react';
import { Task, Worker, Project, CountryHoliday, CalendarOverride, isExecutiveViewer } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { CheckCircle2, Clock, AlertTriangle, Calendar, UserCheck, Flame } from 'lucide-react';
import { resolveWorkDayStatus } from '../../utils/workCalendar';

interface TodaySummaryCardProps {
  currentWorker: Worker | null;
  tasks: Task[];
  projects: Project[];
  holidays?: CountryHoliday[];
  overrides?: CalendarOverride[];
}

export const TodaySummaryCard: React.FC<TodaySummaryCardProps> = ({
  currentWorker,
  tasks,
  projects,
  holidays = [],
  overrides = [],
}) => {
  const { lang } = useI18n();
  const todayStr = new Date().toISOString().slice(0, 10);
  const isViewer = isExecutiveViewer(currentWorker);

  // Filter tasks based on role
  const relevantTasks = isViewer
    ? tasks
    : currentWorker
    ? tasks.filter((t) => t.worker_name === currentWorker.id || t.worker_name === currentWorker.name)
    : tasks;

  // Active today tasks
  const todayTasks = relevantTasks.filter((t) => t.start_date && t.end_date && t.start_date <= todayStr && t.end_date >= todayStr);
  const inProgressTasks = relevantTasks.filter((t) => t.start_date && t.end_date && t.start_date <= todayStr && t.end_date >= todayStr && t.progress < 100);
  const completedTodayTasks = relevantTasks.filter((t) => t.daily_statuses && t.daily_statuses[todayStr] === 'COMPLETED');
  const delayedTasks = relevantTasks.filter((t) => t.end_date && t.end_date < todayStr && t.progress < 100);

  // Worker leave/off today
  const workerStatus = currentWorker
    ? resolveWorkDayStatus(todayStr, currentWorker, holidays, overrides)
    : null;

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
        {/* Today Scheduled */}
        <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 space-y-0.5">
          <div className="text-[10px] text-slate-500 font-bold flex items-center justify-center gap-1">
            <Clock className="w-3 h-3 text-slate-500" />
            <span>{lang === 'vi' ? 'Lịch hôm nay' : '오늘 예정'}</span>
          </div>
          <div className="text-sm font-black text-slate-800">{todayTasks.length}건</div>
        </div>

        {/* In Progress */}
        <div className="p-2 rounded-xl bg-blue-50/70 border border-blue-200 space-y-0.5">
          <div className="text-[10px] text-blue-700 font-bold flex items-center justify-center gap-1">
            <Flame className="w-3 h-3 text-blue-600" />
            <span>{lang === 'vi' ? 'Đang làm' : '진행 중'}</span>
          </div>
          <div className="text-sm font-black text-blue-900">{inProgressTasks.length}건</div>
        </div>

        {/* Completed Today */}
        <div className="p-2 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-0.5">
          <div className="text-[10px] text-emerald-700 font-bold flex items-center justify-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>{lang === 'vi' ? 'Hoàn thành' : '오늘 완료'}</span>
          </div>
          <div className="text-sm font-black text-emerald-900">{completedTodayTasks.length}건</div>
        </div>

        {/* Delayed */}
        <div className="p-2 rounded-xl bg-rose-50/70 border border-rose-200 space-y-0.5">
          <div className="text-[10px] text-rose-700 font-bold flex items-center justify-center gap-1">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            <span>{lang === 'vi' ? 'Trễ hạn' : '기한 경과'}</span>
          </div>
          <div className={`text-sm font-black ${delayedTasks.length > 0 ? 'text-rose-700' : 'text-slate-700'}`}>
            {delayedTasks.length}건
          </div>
        </div>
      </div>
    </div>
  );
};
