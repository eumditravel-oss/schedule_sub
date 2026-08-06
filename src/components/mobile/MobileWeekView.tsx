// src/components/mobile/MobileWeekView.tsx
import React, { useState } from 'react';
import { Project, Task, Worker, GanttDateColumn, WorkDayStatus, DailyStatusType } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { addDays, subDays, format, parseISO, startOfDay } from 'date-fns';
import { generateDateColumns } from '../../utils/dateUtils';
import { resolveWorkDayStatus, getCountryOffState } from '../../utils/workCalendar';
import { WorkerDayCellBackground } from '../gantt/WorkerDayCellBackground';

interface MobileWeekViewProps {
  mode: 'OVERVIEW' | 'DETAIL';
  projects?: Project[];
  project?: Project | null;
  tasks?: Task[];
  workers?: Worker[];
  currentWorker?: Worker | null;
  holidays?: any[];
  overrides?: any[];
  onProjectClick?: (project: Project) => void;
  onTaskCellClick?: (task: Task, dateStr: string) => void;
}

export const MobileWeekView: React.FC<MobileWeekViewProps> = ({
  mode,
  projects = [],
  project,
  tasks = [],
  workers = [],
  currentWorker,
  holidays = [],
  overrides = [],
  onProjectClick,
  onTaskCellClick,
}) => {
  const { t, lang } = useI18n();
  const { width } = useResponsiveLayout();
  const [anchorDate, setAnchorDate] = useState<Date>(startOfDay(new Date()));

  // Dynamic responsive width for 7-day info rail
  const getWeekInfoRailWidth = (w: number): number => {
    if (w < 344) return 64;
    if (w < 360) return 68;
    if (w < 390) return 72;
    if (w < 768) return 76;
    return 96;
  };

  const railWidthPx = getWeekInfoRailWidth(width);
  const railStyle = {
    width: `${railWidthPx}px`,
    minWidth: `${railWidthPx}px`,
    maxWidth: `${railWidthPx}px`,
  };

  // Calculate exact 7-day columns
  const startDate = anchorDate;
  const endDate = addDays(anchorDate, 6);
  const weekDateColumns: GanttDateColumn[] = generateDateColumns(startDate, endDate, new Date(), lang);

  const goPrev = () => setAnchorDate((prev) => subDays(prev, 7));
  const goNext = () => setAnchorDate((prev) => addDays(prev, 7));
  const goToday = () => setAnchorDate(startOfDay(new Date()));

  const rangeTitle = `${format(startDate, 'yyyy.MM.dd')} ~ ${format(endDate, 'yyyy.MM.dd')}`;

  const getProjectDisplayName = (prj: Project): string => {
    if (lang === 'vi') return prj.name_vi || prj.name_ko || prj.name;
    return prj.name_ko || prj.name_vi || prj.name;
  };

  const getTaskDisplayName = (tItem: Task): string => {
    if (lang === 'vi') return tItem.task_name_vi || tItem.task_name_ko || tItem.task_name;
    return tItem.task_name_ko || tItem.task_name_vi || tItem.task_name;
  };

  const getStatusColor = (status?: DailyStatusType) => {
    switch (status) {
      case 'IN_PROGRESS': return 'bg-blue-500 text-white';
      case 'COMPLETED': return 'bg-emerald-500 text-white';
      case 'ISSUE': return 'bg-amber-500 text-white';
      default: return 'bg-slate-100 text-slate-400';
    }
  };

  return (
    <div
      data-testid="mobile-week-view"
      data-view-mode="WEEK"
      role="tabpanel"
      aria-label={t('weekView')}
      className="space-y-3 w-full text-slate-900 overflow-x-hidden"
    >
      {/* 7-Day Navigation Control Bar */}
      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-2 shadow-xs">
        <button
          type="button"
          data-testid="mobile-week-prev-btn"
          onClick={goPrev}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition"
          aria-label="Previous 7 days"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-1.5">
          <CalendarIcon className="w-3.5 h-3.5 text-blue-600" />
          <span className="text-xs font-bold text-slate-800">{rangeTitle}</span>
          <button
            type="button"
            data-testid="mobile-week-today-btn"
            onClick={goToday}
            className="ml-1 px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-600 rounded border border-blue-200 hover:bg-blue-100 transition"
          >
            {t('today')}
          </button>
        </div>

        <button
          type="button"
          data-testid="mobile-week-next-btn"
          onClick={goNext}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition"
          aria-label="Next 7 days"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 7-Day Grid Container */}
      <div className="w-full bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {/* Grid Header Row */}
        <div className="flex w-full border-b border-slate-200 bg-slate-50/80 font-bold text-[11px] text-slate-700">
          {/* Info Rail Header */}
          <div
            data-testid="mobile-week-info-rail"
            style={railStyle}
            className="p-2 border-r border-slate-200 shrink-0 flex items-center justify-center text-[10px] text-slate-500 uppercase tracking-wider"
          >
            {mode === 'OVERVIEW' ? t('project') : t('task')}
          </div>

          {/* 7 Days Headers */}
          <div className="flex-1 grid grid-cols-7 divide-x divide-slate-200">
            {weekDateColumns.map((col) => (
              <div
                key={col.dateStr}
                data-testid={`mobile-week-header-${col.dateStr}`}
                className={`p-1 text-center flex flex-col items-center justify-center ${
                  col.isToday ? 'bg-blue-50/90 text-blue-700 font-extrabold' : ''
                }`}
              >
                <span className="text-[9px] opacity-75">{col.dayName}</span>
                <span className="text-xs">{col.dayNum}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Grid Rows */}
        <div className="divide-y divide-slate-100">
          {mode === 'OVERVIEW' ? (
            projects.map((prj) => (
              <div
                key={prj.id}
                data-testid={`mobile-week-row-${prj.id}`}
                onClick={() => onProjectClick?.(prj)}
                className="flex w-full items-stretch hover:bg-slate-50/50 transition cursor-pointer"
              >
                {/* Info Rail Column */}
                <div
                  data-testid="mobile-week-info-rail"
                  style={railStyle}
                  className="p-1.5 border-r border-slate-200 shrink-0 flex flex-col justify-center text-[10px]"
                >
                  <span className="font-bold text-slate-900 line-clamp-2 leading-tight">
                    {getProjectDisplayName(prj)}
                  </span>
                  <span className="text-[9px] font-extrabold text-blue-600 mt-0.5">
                    {prj.progress}%
                  </span>
                </div>

                {/* 7 Days Cells */}
                <div className="flex-1 grid grid-cols-7 divide-x divide-slate-100">
                  {weekDateColumns.map((col) => {
                    const isWithin = col.dateStr >= prj.start_date && col.dateStr <= prj.end_date;
                    return (
                      <div
                        key={col.dateStr}
                        data-testid={`mobile-week-cell-${col.dateStr}`}
                        className={`p-1 flex items-center justify-center ${
                          col.isToday ? 'bg-blue-50/30' : ''
                        }`}
                      >
                        {isWithin && (
                          <div
                            className={`w-full h-4 rounded-sm ${
                              prj.status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-blue-500'
                            }`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            tasks.map((tItem) => {
              const workerObj = workers.find((w) => w.id === tItem.worker_name || w.name === tItem.worker_name) || {
                id: tItem.worker_name,
                name: tItem.worker_name,
                country_code: 'KR' as any,
                workweek_profile: 'MON_FRI' as any,
              };

              return (
                <div
                  key={tItem.id}
                  data-testid={`mobile-week-task-row-${tItem.id}`}
                  className="flex w-full items-stretch hover:bg-slate-50/50 transition"
                >
                  {/* Info Rail Column */}
                  <div
                    data-testid="mobile-week-info-rail"
                    style={railStyle}
                    className="p-1.5 border-r border-slate-200 shrink-0 flex flex-col justify-center text-[10px]"
                  >
                    <span className="font-bold text-slate-900 line-clamp-2 leading-tight">
                      {getTaskDisplayName(tItem)}
                    </span>
                    <span className="text-[9px] text-slate-500 truncate mt-0.5">
                      {tItem.worker_name[0]}
                    </span>
                  </div>

                  {/* 7 Days Cells */}
                  <div className="flex-1 grid grid-cols-7 divide-x divide-slate-100">
                    {weekDateColumns.map((col) => {
                      const dayStatus: WorkDayStatus = resolveWorkDayStatus(
                        col.dateStr,
                        workerObj as any,
                        holidays,
                        overrides
                      );
                      const countryOffInfo = getCountryOffState(col.dateStr, overrides, holidays);
                      const statusVal = tItem.daily_statuses?.[col.dateStr];
                      const isInSchedule = !!(tItem.start_date && tItem.end_date && col.dateStr >= tItem.start_date && col.dateStr <= tItem.end_date);

                      return (
                        <WorkerDayCellBackground
                          key={col.dateStr}
                          dateStr={col.dateStr}
                          worker={workerObj as any}
                          dayStatus={dayStatus}
                          countryOffState={countryOffInfo}
                          countryHolidays={holidays}
                          calendarOverrides={overrides}
                          isToday={col.isToday}
                          onClick={() => onTaskCellClick?.(tItem, col.dateStr)}
                          className="p-1 cursor-pointer flex items-center justify-center min-h-[36px]"
                        >
                          {isInSchedule && (
                            <div className="w-full h-4 bg-blue-600 rounded-xs z-10 opacity-90" />
                          )}

                          {statusVal && statusVal !== 'NONE' ? (
                            <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold z-30 ${getStatusColor(statusVal)}`}>
                              {statusVal[0]}
                            </div>
                          ) : null}
                        </WorkerDayCellBackground>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
