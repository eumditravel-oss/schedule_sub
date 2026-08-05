// src/components/mobile/MobileThirtyDayGanttView.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Project, Task, Worker, GanttDateColumn, WorkDayStatus, DailyStatusType } from '../../types';
import { useI18n } from '../../hooks/useI18n';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { ChevronsLeft, ChevronsRight, AlertTriangle } from 'lucide-react';
import { getCountryOffState, resolveWorkDayStatus } from '../../utils/workCalendar';
import { ScheduleBar, ScheduleBarStatus } from '../gantt/ScheduleBar';

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
}

export const MobileThirtyDayGanttView: React.FC<MobileThirtyDayGanttViewProps> = ({
  mode,
  projects = [],
  tasks = [],
  workers = [],
  dateColumns,
  holidays = [],
  overrides = [],
  onProjectClick,
  onTaskCellClick,
}) => {
  const { t, lang } = useI18n();
  const { width } = useResponsiveLayout();
  const [isRailExpanded, setIsRailExpanded] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const scrolledOnceRef = useRef(false);

  // Dynamic responsive width calculation
  const getGanttInfoRailWidth = (w: number, isExpanded: boolean): number => {
    if (isExpanded) {
      if (w < 768) return Math.min(108, Math.floor(w * 0.3));
      return Math.min(140, Math.floor(w * 0.3));
    }
    if (w < 344) return 60;
    if (w < 360) return 64;
    if (w < 390) return 68;
    if (w < 768) return 72;
    return 104;
  };

  const railWidthPx = getGanttInfoRailWidth(width, isRailExpanded);
  const railStyle = {
    width: `${railWidthPx}px`,
    minWidth: `${railWidthPx}px`,
    maxWidth: `${railWidthPx}px`,
  };

  // Auto-scroll to today on initial enter
  useEffect(() => {
    if (!scrolledOnceRef.current && timelineRef.current && dateColumns.length > 0) {
      const todayIdx = dateColumns.findIndex((col) => col.isToday);
      if (todayIdx > 0) {
        const scrollPos = Math.max(0, (todayIdx - 2) * 30);
        timelineRef.current.scrollLeft = scrollPos;
        scrolledOnceRef.current = true;
      }
    }
  }, [dateColumns]);

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
      case 'IN_PROGRESS': return 'bg-indigo-600 text-white';
      case 'COMPLETED': return 'bg-emerald-600 text-white';
      case 'ISSUE': return 'bg-amber-600 text-white';
      default: return 'bg-slate-100 text-slate-400';
    }
  };

  // Compute start column and span count for continuous ScheduleBar grid overlay
  const getGanttSpan = (startDateStr: string, endDateStr: string) => {
    if (!dateColumns.length) return null;
    const firstColDate = dateColumns[0].dateStr;
    const lastColDate = dateColumns[dateColumns.length - 1].dateStr;

    if (endDateStr < firstColDate || startDateStr > lastColDate) return null;

    const startIdx = dateColumns.findIndex((c) => c.dateStr >= startDateStr);
    const actualStartIdx = startIdx === -1 ? 0 : startIdx;

    let endIdx = dateColumns.findIndex((c) => c.dateStr > endDateStr);
    if (endIdx === -1) endIdx = dateColumns.length;

    const spanCount = Math.max(1, endIdx - actualStartIdx);
    return {
      startIndex: actualStartIdx,
      spanCount,
    };
  };

  const gridTemplateColsCss = `repeat(${dateColumns.length}, minmax(30px, 1fr))`;
  const gridMinWidthPx = dateColumns.length * 30;

  return (
    <div
      data-testid="mobile-gantt-view"
      data-view-mode="GANTT"
      role="tabpanel"
      aria-label={t('thirtyDaysGanttView')}
      className="w-full text-slate-900 overflow-x-hidden"
    >
      <div className="mobile-gantt-shell w-full bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden flex flex-col">
        {/* Main Gantt Table Shell */}
        <div className="flex w-full overflow-hidden">
          {/* Info Rail (Sticky Left Column) */}
          <div
            data-testid="compact-info-rail"
            style={railStyle}
            className="compact-info-rail border-r border-slate-200 bg-slate-50 shrink-0 transition-all duration-200 flex flex-col z-20"
          >
            {/* Info Rail Header */}
            <div className="h-10 p-1.5 border-b border-slate-200 flex items-center justify-between bg-slate-100/90 text-[10px] font-bold text-slate-600">
              <span className="truncate">
                {isRailExpanded ? (mode === 'OVERVIEW' ? t('project') : t('task')) : (mode === 'OVERVIEW' ? 'Prj' : 'Task')}
              </span>
              <button
                type="button"
                data-testid="rail-toggle-btn"
                onClick={() => setIsRailExpanded(!isRailExpanded)}
                className="p-1 rounded hover:bg-slate-200 text-slate-500 transition shrink-0"
                aria-label={isRailExpanded ? '정보 축소' : '정보 펼치기'}
              >
                {isRailExpanded ? <ChevronsLeft className="w-3 h-3" /> : <ChevronsRight className="w-3 h-3" />}
              </button>
            </div>

            {/* Info Rail Rows */}
            <div className="divide-y divide-slate-100 flex-1">
              {mode === 'OVERVIEW' ? (
                projects.map((prj) => (
                  <div
                    key={prj.id}
                    data-testid={`mobile-gantt-rail-item-${prj.id}`}
                    onClick={() => onProjectClick?.(prj)}
                    className="h-10 px-1.5 flex flex-col justify-center cursor-pointer hover:bg-slate-100 transition"
                  >
                    <span className="text-[10px] font-bold text-slate-900 line-clamp-1 leading-tight">
                      {getProjectDisplayName(prj)}
                    </span>
                    <span className="text-[9px] font-extrabold text-indigo-600">
                      {prj.actual_progress ?? prj.progress}%
                    </span>
                  </div>
                ))
              ) : (
                tasks.map((tItem) => {
                  const workerObj = workers.find((w) => w.id === tItem.worker_name || w.name === tItem.worker_name);
                  const isWorkerMissing = !workerObj || !workerObj.country_code || !workerObj.workweek_profile;

                  return (
                    <div
                      key={tItem.id}
                      data-testid={`mobile-gantt-rail-task-${tItem.id}`}
                      className="h-10 px-1.5 flex flex-col justify-center hover:bg-slate-100 transition"
                    >
                      <span className="text-[10px] font-bold text-slate-900 line-clamp-1 leading-tight">
                        {getTaskDisplayName(tItem)}
                      </span>
                      <div className="flex items-center gap-0.5 truncate">
                        <span className="text-[9px] text-slate-500 truncate">
                          {tItem.worker_name}
                        </span>
                        {isWorkerMissing && (
                          <AlertTriangle className="w-2.5 h-2.5 text-amber-500 shrink-0" aria-label="작업자 프로필 정보 없음" />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Timeline Scroll Area */}
          <div
            ref={timelineRef}
            data-testid="timeline-scroll-area"
            className="timeline-scroll-area flex-1 overflow-x-auto touch-pan-x touch-pan-y overscroll-x-contain custom-scrollbar bg-white"
          >
            <div className="inline-block min-w-max" style={{ minWidth: `${gridMinWidthPx}px` }}>
              {/* Date Header Row */}
              <div className="flex h-10 border-b border-slate-200 bg-slate-50/80 font-bold text-[10px] text-slate-700">
                {dateColumns.map((col) => {
                  const offInfo = getCountryOffState(col.dateStr, overrides, holidays);
                  let bgStyle = 'bg-white text-slate-700';
                  if (offInfo.state === 'BOTH_OFF') bgStyle = 'bg-rose-100 text-rose-900';
                  else if (offInfo.state === 'KR_ONLY_OFF') bgStyle = 'bg-orange-50 text-orange-900';
                  else if (offInfo.state === 'VN_ONLY_OFF') bgStyle = 'bg-amber-50 text-amber-900';

                  const todayStyle = col.isToday ? 'ring-2 ring-blue-500 ring-inset font-extrabold' : '';

                  return (
                    <div
                      key={col.dateStr}
                      data-testid={`mobile-gantt-header-${col.dateStr}`}
                      data-date={col.dateStr}
                      data-country-off-state={offInfo.state}
                      className={`w-[30px] min-w-[30px] max-w-[30px] border-r border-slate-100 p-0.5 flex flex-col items-center justify-center shrink-0 ${bgStyle} ${todayStyle}`}
                    >
                      <span className="text-[10px]">{col.dayNum}</span>
                      <span className="text-[8px] opacity-75">{col.dayName}</span>
                    </div>
                  );
                })}
              </div>

              {/* Grid Rows */}
              <div className="divide-y divide-slate-100">
                {mode === 'OVERVIEW' ? (
                  projects.map((prj) => {
                    const spanInfo = getGanttSpan(prj.start_date, prj.end_date);
                    const plannedProg = prj.planned_progress ?? 0;
                    const actualProg = prj.actual_progress ?? prj.progress ?? 0;
                    const rawStatus = prj.schedule_state || (prj.status === 'COMPLETED' ? 'COMPLETED' : null);
                    const validStatuses = ['UPCOMING', 'IN_PROGRESS', 'DELAYED', 'COMPLETED'];
                    const barStatus: ScheduleBarStatus = validStatuses.includes(rawStatus as string)
                      ? (rawStatus as ScheduleBarStatus)
                      : 'UNKNOWN';

                    return (
                      <div
                        key={prj.id}
                        onClick={() => onProjectClick?.(prj)}
                        className="relative h-10 flex items-center cursor-pointer hover:bg-slate-50/50 transition overflow-hidden"
                      >
                        {/* Background Date Grid Cells */}
                        <div className="absolute inset-0 flex h-full">
                          {dateColumns.map((col) => (
                            <div
                              key={col.dateStr}
                              className={`w-[30px] min-w-[30px] max-w-[30px] h-full border-r border-slate-100 shrink-0 ${
                                col.isToday ? 'bg-blue-50/30' : ''
                              }`}
                            />
                          ))}
                        </div>

                        {/* Continuous ScheduleBar Overlay */}
                        {spanInfo && (
                          <div
                            className="absolute inset-y-0 z-10 flex items-center pointer-events-none px-0.5"
                            style={{
                              display: 'grid',
                              gridTemplateColumns: gridTemplateColsCss,
                              width: `${gridMinWidthPx}px`,
                            }}
                          >
                            <div
                              style={{
                                gridColumn: `${spanInfo.startIndex + 1} / span ${spanInfo.spanCount}`,
                              }}
                              className="w-full flex items-center"
                            >
                              <ScheduleBar
                                isMobile={true}
                                interactionMode="CLICKABLE"
                                title={getProjectDisplayName(prj)}
                                startDate={prj.start_date}
                                endDate={prj.end_date}
                                calendarSpanDays={(prj as any).calendar_span_days ?? spanInfo.spanCount}
                                plannedWorkingDays={prj.planned_working_days ?? 0}
                                plannedProgress={plannedProg}
                                actualProgress={actualProg}
                                status={barStatus}
                                onClick={() => onProjectClick?.(prj)}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  tasks.map((tItem) => {
                    const workerObj = workers.find((w) => w.id === tItem.worker_name || w.name === tItem.worker_name);
                    const spanInfo = getGanttSpan(tItem.start_date, tItem.end_date);
                    const plannedProg = tItem.planned_progress ?? 0;
                    const actualProg = tItem.actual_progress ?? 0;
                    const rawStatus = (tItem as any).schedule_state || (tItem as any).status;
                    const validStatuses = ['UPCOMING', 'IN_PROGRESS', 'DELAYED', 'COMPLETED'];
                    const barStatus: ScheduleBarStatus = validStatuses.includes(rawStatus as string)
                      ? (rawStatus as ScheduleBarStatus)
                      : 'UNKNOWN';

                    return (
                      <div key={tItem.id} className="relative h-10 flex items-center hover:bg-slate-50/50 transition overflow-hidden">
                        {/* Background Date Grid Cells with Workday Status */}
                        <div className="absolute inset-0 flex h-full">
                          {dateColumns.map((col) => {
                            const dayStatus: WorkDayStatus = resolveWorkDayStatus(
                              col.dateStr,
                              workerObj as any,
                              holidays,
                              overrides
                            );
                            const statusVal = tItem.daily_statuses?.[col.dateStr];
                            const isInSchedule = col.dateStr >= tItem.start_date && col.dateStr <= tItem.end_date;

                            let bgClass = 'bg-white';
                            if (dayStatus.day_type === 'PUBLIC_HOLIDAY') {
                              bgClass = dayStatus.country_code === 'VN' ? 'bg-amber-100' : 'bg-rose-100';
                            } else if (dayStatus.day_type === 'LEAVE') {
                              bgClass = 'bg-violet-100';
                            } else if (dayStatus.day_type === 'MANUAL_OFF') {
                              bgClass = 'bg-orange-100';
                            } else if (dayStatus.day_type === 'WORK_OVERRIDE') {
                              bgClass = 'bg-cyan-100';
                            } else if (!dayStatus.is_working_day) {
                              bgClass = 'bg-slate-100';
                            } else if (col.isToday) {
                              bgClass = 'bg-blue-50';
                            }

                            return (
                              <div
                                key={col.dateStr}
                                onClick={() => onTaskCellClick?.(tItem, col.dateStr)}
                                className={`w-[30px] min-w-[30px] max-w-[30px] h-full border-r border-slate-100 p-0.5 relative flex items-center justify-center shrink-0 cursor-pointer transition ${bgClass}`}
                              >
                                {statusVal && statusVal !== 'NONE' ? (
                                  <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold z-20 ${getStatusColor(statusVal)}`}>
                                    {statusVal[0]}
                                  </div>
                                ) : !isInSchedule && !dayStatus.is_working_day ? (
                                  <span className="text-[7px] font-bold text-slate-400">
                                    {dayStatus.day_type === 'LEAVE' ? '휴' : 'Off'}
                                  </span>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>

                        {/* Continuous ScheduleBar Overlay (PASS_THROUGH Mode so cell clicks under bar work) */}
                        {spanInfo && (
                          <div
                            className="absolute inset-y-0 z-10 flex items-center pointer-events-none px-0.5"
                            style={{
                              display: 'grid',
                              gridTemplateColumns: gridTemplateColsCss,
                              width: `${gridMinWidthPx}px`,
                            }}
                          >
                            <div
                              style={{
                                gridColumn: `${spanInfo.startIndex + 1} / span ${spanInfo.spanCount}`,
                              }}
                              className="w-full flex items-center pointer-events-none"
                            >
                              <ScheduleBar
                                isMobile={true}
                                interactionMode="PASS_THROUGH"
                                title={getTaskDisplayName(tItem)}
                                startDate={tItem.start_date}
                                endDate={tItem.end_date}
                                calendarSpanDays={(tItem as any).calendar_span_days ?? spanInfo.spanCount}
                                plannedWorkingDays={(tItem as any).planned_working_days ?? 0}
                                plannedProgress={plannedProg}
                                actualProgress={actualProg}
                                status={barStatus}
                                hasConflict={(tItem as any).has_conflict}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
