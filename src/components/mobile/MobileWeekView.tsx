// src/components/mobile/MobileWeekView.tsx
import React, { useState } from 'react';
import { Project, Task, Worker, GanttDateColumn } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, CheckCircle2 } from 'lucide-react';
import { addDays, subDays, format, parseISO, startOfDay } from 'date-fns';
import { generateDateColumns } from '../../utils/dateUtils';
import { getCountryOffState } from '../../utils/workCalendar';
import { MobileAgendaCard } from './MobileAgendaCard';
import { getActualProgress } from '../../utils/progressDisplay';

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
  onTaskClick?: (task: Task) => void;
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
  onTaskClick,
}) => {
  const { t, lang } = useI18n();
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [anchorDate, setAnchorDate] = useState<Date>(startOfDay(new Date()));
  const [selectedDateStr, setSelectedDateStr] = useState<string>(todayStr);

  const startDate = anchorDate;
  const endDate = addDays(anchorDate, 6);
  const weekDateColumns: GanttDateColumn[] = generateDateColumns(startDate, endDate, new Date(), lang);

  const goPrev = () => setAnchorDate((prev) => subDays(prev, 7));
  const goNext = () => setAnchorDate((prev) => addDays(prev, 7));
  const goToday = () => {
    setAnchorDate(startOfDay(new Date()));
    setSelectedDateStr(todayStr);
  };

  const rangeTitle = `${format(startDate, 'yyyy.MM.dd')} ~ ${format(endDate, 'yyyy.MM.dd')}`;

  const getProjectDisplayName = (prj: Project): string => {
    if (lang === 'vi') return prj.name_vi || prj.name_ko || prj.name;
    return prj.name_ko || prj.name_vi || prj.name;
  };

  const getTaskDisplayName = (tItem: Task): string => {
    if (lang === 'vi') return tItem.task_name_vi || tItem.task_name_ko || tItem.task_name;
    return tItem.task_name_ko || tItem.task_name_vi || tItem.task_name;
  };

  // Filter items active on selectedDateStr
  const activeProjectsForDate = projects.filter(
    (p) => p.start_date <= selectedDateStr && selectedDateStr <= p.end_date
  );

  const activeTasksForDate = tasks.filter(
    (tItem) => tItem.start_date && tItem.end_date && tItem.start_date <= selectedDateStr && selectedDateStr <= tItem.end_date
  );

  // Count active items for each column day
  const getItemCountForDate = (dateStr: string) => {
    if (mode === 'OVERVIEW') {
      return projects.filter((p) => p.start_date <= dateStr && dateStr <= p.end_date).length;
    }
    return tasks.filter((tItem) => tItem.start_date && tItem.end_date && tItem.start_date <= dateStr && dateStr <= tItem.end_date).length;
  };

  return (
    <div
      data-testid="mobile-week-view"
      data-view-mode="WEEK"
      role="tabpanel"
      aria-label={t('weekView')}
      className="space-y-4 w-full text-slate-900 overflow-x-hidden pb-16"
    >
      {/* 7-Day Navigation Control Bar */}
      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-2 shadow-xs">
        <button
          type="button"
          data-testid="mobile-week-prev-btn"
          onClick={goPrev}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Previous week"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-1.5">
          <CalendarIcon className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="text-xs font-bold text-slate-800">{rangeTitle}</span>
          <button
            type="button"
            data-testid="mobile-week-today-btn"
            onClick={goToday}
            className="ml-1 px-2.5 py-1 text-xs font-bold bg-blue-50 text-blue-600 rounded-lg border border-blue-200 hover:bg-blue-100 transition min-h-[32px] flex items-center"
          >
            {t('today')}
          </button>
        </div>

        <button
          type="button"
          data-testid="mobile-week-next-btn"
          onClick={goNext}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Next week"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* 7 Date Buttons Row */}
      <div className="grid grid-cols-7 gap-1 bg-white border border-slate-200 rounded-xl p-1.5 shadow-xs">
        {weekDateColumns.map((col) => {
          const isSelected = col.dateStr === selectedDateStr;
          const count = getItemCountForDate(col.dateStr);
          const countryOff = getCountryOffState(col.dateStr, overrides, holidays);

          let bgStyle = 'bg-slate-50 hover:bg-slate-100 text-slate-700';
          if (countryOff.state === 'BOTH_OFF') {
            bgStyle = 'bg-rose-50/80 text-rose-800 border-rose-200';
          } else if (countryOff.krIsOff) {
            bgStyle = 'bg-amber-50/80 text-amber-800 border-amber-200';
          } else if (countryOff.vnIsOff) {
            bgStyle = 'bg-sky-50/80 text-sky-800 border-sky-200';
          }

          if (isSelected) {
            bgStyle = 'bg-blue-600 text-white font-bold shadow-xs border-blue-600';
          } else if (col.isToday) {
            bgStyle += ' border-2 border-blue-500 font-extrabold';
          } else {
            bgStyle += ' border border-slate-200/60';
          }

          return (
            <button
              key={col.dateStr}
              type="button"
              data-testid={`mobile-week-date-btn-${col.dateStr}`}
              onClick={() => setSelectedDateStr(col.dateStr)}
              className={`flex flex-col items-center justify-center py-2 px-0.5 rounded-lg min-h-[48px] transition-all relative ${bgStyle}`}
            >
              <span className="text-[10px] uppercase tracking-tight opacity-80">
                {col.dayName}
              </span>
              <span className="text-sm font-extrabold leading-tight">
                {col.dayNum}
              </span>
              {count > 0 && (
                <span
                  className={`mt-0.5 px-1 py-0.2 text-[9px] font-extrabold rounded-full ${
                    isSelected
                      ? 'bg-white text-blue-700'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Date Agenda Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-800">
            {selectedDateStr} ({weekDateColumns.find((c) => c.dateStr === selectedDateStr)?.dayName || ''})
          </span>
          {selectedDateStr === todayStr && (
            <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">
              {t('today')}
            </span>
          )}
        </div>
        <span className="text-xs font-medium text-slate-500">
          {mode === 'OVERVIEW'
            ? `${activeProjectsForDate.length}개 프로젝트`
            : `${activeTasksForDate.length}개 작업`}
        </span>
      </div>

      {/* Agenda Card List */}
      <div className="space-y-3">
        {mode === 'OVERVIEW' ? (
          activeProjectsForDate.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-xs text-slate-400 font-medium">
              선택한 날짜에 진행 중인 프로젝트가 없습니다.
            </div>
          ) : (
            activeProjectsForDate.map((prj) => (
              <MobileAgendaCard
                key={prj.id}
                type="PROJECT"
                title={getProjectDisplayName(prj)}
                startDate={prj.start_date}
                endDate={prj.end_date}
                actualProgress={getActualProgress(prj)}
                scheduleState={prj.status}
                completionConfirmed={prj.status === 'COMPLETED'}
                onClick={() => onProjectClick?.(prj)}
                testId={`mobile-week-agenda-project-${prj.id}`}
              />
            ))
          )
        ) : (
          activeTasksForDate.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-xs text-slate-400 font-medium">
              선택한 날짜에 진행 예정인 세부 작업이 없습니다.
            </div>
          ) : (
            activeTasksForDate.map((tItem) => (
              <MobileAgendaCard
                key={tItem.id}
                type="TASK"
                title={getTaskDisplayName(tItem)}
                projectName={project ? getProjectDisplayName(project) : undefined}
                startDate={tItem.start_date || undefined}
                endDate={tItem.end_date || undefined}
                assignees={(tItem.assignees || []).map((a) => ({ id: a.worker_id, name: a.name || (a as any).worker_name }))}
                actualProgress={getActualProgress(tItem)}
                scheduleState={tItem.schedule_state}
                completionConfirmed={tItem.completion_confirmed}
                taskGroupTitle={(tItem as any).task_group_name}
                onClick={() => {
                  onTaskClick?.(tItem);
                  onTaskCellClick?.(tItem, selectedDateStr);
                }}
                testId={`mobile-week-agenda-task-${tItem.id}`}
              />
            ))
          )
        )}
      </div>
    </div>
  );
};
