// src/components/mobile/MobileThirtyDayGanttView.tsx
import React, { useState } from 'react';
import { Project, Task, Worker, GanttDateColumn } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { addDays, subDays, format, parseISO, startOfDay, getMonth, getYear } from 'date-fns';
import { generateDateColumns } from '../../utils/dateUtils';
import { getCountryOffState } from '../../utils/workCalendar';
import { MobileAgendaCard } from './MobileAgendaCard';
import { getActualProgress } from '../../utils/progressDisplay';

interface MobileThirtyDayGanttViewProps {
  mode: 'OVERVIEW' | 'DETAIL';
  projects?: Project[];
  project?: Project | null;
  tasks?: Task[];
  workers?: Worker[];
  dateColumns: GanttDateColumn[];
  holidays?: any[];
  overrides?: any[];
  onProjectClick?: (project: Project) => void;
  onTaskCellClick?: (task: Task, dateStr: string) => void;
  onTaskClick?: (task: Task) => void;
}

export const MobileThirtyDayGanttView: React.FC<MobileThirtyDayGanttViewProps> = ({
  mode,
  projects = [],
  project,
  tasks = [],
  workers = [],
  dateColumns: propDateColumns,
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
  const endDate = addDays(anchorDate, 29);
  const calendarDateColumns: GanttDateColumn[] = generateDateColumns(startDate, endDate, new Date(), lang);

  const goPrev = () => setAnchorDate((prev) => subDays(prev, 30));
  const goNext = () => setAnchorDate((prev) => addDays(prev, 30));
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

  // Active items for selectedDateStr
  const activeProjectsForDate = projects.filter(
    (p) => p.start_date <= selectedDateStr && selectedDateStr <= p.end_date
  );

  const activeTasksForDate = tasks.filter(
    (tItem) => tItem.start_date && tItem.end_date && tItem.start_date <= selectedDateStr && selectedDateStr <= tItem.end_date
  );

  const getItemCountForDate = (dateStr: string) => {
    if (mode === 'OVERVIEW') {
      return projects.filter((p) => p.start_date <= dateStr && dateStr <= p.end_date).length;
    }
    return tasks.filter((tItem) => tItem.start_date && tItem.end_date && tItem.start_date <= dateStr && dateStr <= tItem.end_date).length;
  };

  // Day names for 7 columns header
  const weekDayHeaders = lang === 'vi'
    ? ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
    : ['월', '화', '수', '목', '금', '토', '일'];

  // Summary statistics for 30-day window
  const active30DayProjects = projects.filter((p) => p.end_date >= format(startDate, 'yyyy-MM-dd') && p.start_date <= format(endDate, 'yyyy-MM-dd'));
  const active30DayTasks = tasks.filter((t) => t.end_date && t.start_date && t.end_date >= format(startDate, 'yyyy-MM-dd') && t.start_date <= format(endDate, 'yyyy-MM-dd'));
  const total30Items = mode === 'OVERVIEW' ? active30DayProjects.length : active30DayTasks.length;

  return (
    <div
      data-testid="mobile-gantt-view"
      data-view-mode="GANTT"
      role="tabpanel"
      aria-label={t('thirtyDaysGanttView')}
      className="space-y-4 w-full text-slate-900 overflow-x-hidden pb-16"
    >
      {/* 30-Day Navigation Control Bar */}
      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-2 shadow-xs">
        <button
          type="button"
          data-testid="mobile-thirty-prev-btn"
          onClick={goPrev}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Previous 30 days"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-1.5 min-w-0">
          <CalendarIcon className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="text-xs font-bold text-slate-800 truncate">{rangeTitle}</span>
          <button
            type="button"
            data-testid="mobile-thirty-today-btn"
            onClick={goToday}
            className="ml-1 px-2.5 py-1 text-xs font-bold bg-blue-50 text-blue-600 rounded-lg border border-blue-200 hover:bg-blue-100 transition min-h-[32px] shrink-0 flex items-center"
          >
            {t('today')}
          </button>
        </div>

        <button
          type="button"
          data-testid="mobile-thirty-next-btn"
          onClick={goNext}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Next 30 days"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* 30-Day Summary Metric Strip */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center justify-around text-center text-xs">
        <div>
          <div className="text-[10px] text-slate-500 font-medium">30일 전체 일정</div>
          <div className="text-sm font-extrabold text-blue-700">{total30Items}건</div>
        </div>
        <div className="h-6 border-r border-slate-200" />
        <div>
          <div className="text-[10px] text-slate-500 font-medium">선택 날짜 ({selectedDateStr.slice(5)})</div>
          <div className="text-sm font-extrabold text-indigo-600">
            {mode === 'OVERVIEW' ? activeProjectsForDate.length : activeTasksForDate.length}건
          </div>
        </div>
      </div>

      {/* 30-Day Calendar Grid */}
      <div className="bg-white border border-slate-200 rounded-xl p-2 shadow-xs space-y-2">
        {/* 7 Days Column Header */}
        <div className="grid grid-cols-7 gap-1 text-center border-b border-slate-100 pb-1 text-[11px] font-bold text-slate-500">
          {weekDayHeaders.map((dh, idx) => (
            <div key={idx} className={idx >= 5 ? 'text-rose-500' : ''}>
              {dh}
            </div>
          ))}
        </div>

        {/* 30 Calendar Cells */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDateColumns.map((col, idx) => {
            const isSelected = col.dateStr === selectedDateStr;
            const count = getItemCountForDate(col.dateStr);
            const countryOff = getCountryOffState(col.dateStr, overrides, holidays);
            const isMonthStart = Number(col.dayNum) === 1 || idx === 0;
            const monthLabel = `${getMonth(parseISO(col.dateStr)) + 1}월`;

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
                data-testid={`mobile-thirty-date-cell-${col.dateStr}`}
                onClick={() => setSelectedDateStr(col.dateStr)}
                className={`flex flex-col items-center justify-center p-1 rounded-lg min-h-[46px] transition-all relative ${bgStyle}`}
              >
                {isMonthStart && (
                  <span
                    className={`absolute -top-1.5 left-0.5 text-[8px] font-extrabold px-1 rounded ${
                      isSelected ? 'bg-white text-blue-800' : 'bg-slate-700 text-white'
                    }`}
                  >
                    {monthLabel}
                  </span>
                )}
                <span className="text-xs font-extrabold leading-none mt-0.5">
                  {col.dayNum}
                </span>

                {/* Dots / Badge */}
                {count > 0 && (
                  <div className="flex items-center gap-0.5 mt-1">
                    {count <= 3 ? (
                      Array.from({ length: Math.min(3, count) }).map((_, i) => (
                        <span
                          key={i}
                          className={`w-1.5 h-1.5 rounded-full ${
                            isSelected ? 'bg-white' : 'bg-blue-600'
                          }`}
                        />
                      ))
                    ) : (
                      <span
                        className={`text-[9px] font-extrabold px-1 rounded-full ${
                          isSelected ? 'bg-white text-blue-700' : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Date Agenda Header */}
      <div className="flex items-center justify-between px-1 pt-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-800">
            {selectedDateStr} 일정
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

      {/* Selected Date Agenda Card List */}
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
                testId={`mobile-thirty-agenda-project-${prj.id}`}
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
                testId={`mobile-thirty-agenda-task-${tItem.id}`}
              />
            ))
          )
        )}
      </div>
    </div>
  );
};
