// src/components/gantt/WorkerDayCellBackground.tsx
import React from 'react';
import { Worker, WorkDayStatus, CountryHoliday, CalendarOverride, TaskAssignee, AvailabilityPolicy } from '../../types';
import { CountryOffState, resolveWorkDayStatus } from '../../utils/workCalendar';
import { resolveCalendarVisualState, CalendarVisualToken, TODAY_OUTLINE_STYLE } from '../../utils/calendarVisualTokens';

interface WorkerDayCellBackgroundProps {
  dateStr: string;
  taskId?: string;
  worker?: Partial<Worker> | null;
  assignees?: TaskAssignee[];
  availabilityPolicy?: AvailabilityPolicy;
  dayStatus?: WorkDayStatus | null;
  countryOffState?: CountryOffState | { state: CountryOffState } | null;
  countryHolidays?: CountryHoliday[];
  calendarOverrides?: CalendarOverride[];
  workers?: Worker[];
  isToday?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
}

export const WorkerDayCellBackground: React.FC<WorkerDayCellBackgroundProps> = ({
  dateStr,
  taskId,
  worker,
  assignees = [],
  availabilityPolicy = 'ANY_AVAILABLE',
  dayStatus,
  countryOffState,
  countryHolidays = [],
  calendarOverrides = [],
  workers = [],
  isToday,
  className = '',
  style,
  onClick,
  children,
}) => {
  const hasMultiAssignees = assignees && assignees.length > 1;

  let overallToken: CalendarVisualToken;
  let partialState: 'ALL_WORKING' | 'ALL_OFF' | 'PARTIAL_OFF' = 'ALL_WORKING';
  let workingCount = 1;
  let totalAssignees = 1;
  let hasVacation = false;
  let offCount = 0;

  if (hasMultiAssignees) {
    totalAssignees = assignees.length;
    const tokens = assignees.map((a) => {
      const wObj = workers.find((w) => w.id === a.worker_id) || { name: a.name, country_code: a.country_code };
      const st = resolveWorkDayStatus(dateStr, wObj as any, countryHolidays, calendarOverrides);
      const tok = resolveCalendarVisualState(dateStr, wObj, st, countryOffState, countryHolidays, calendarOverrides);
      if (st?.day_type === 'LEAVE') {
        hasVacation = true;
      }
      return tok;
    });

    workingCount = tokens.filter((t) => t.visualState === 'WORKDAY' || t.visualState === 'WORK_OVERRIDE').length;
    offCount = totalAssignees - workingCount;

    if (workingCount === totalAssignees) {
      partialState = 'ALL_WORKING';
    } else if (workingCount === 0) {
      partialState = 'ALL_OFF';
    } else {
      partialState = 'PARTIAL_OFF';
    }

    overallToken = tokens.find((t) => t.visualState !== 'WORKDAY' && t.visualState !== 'WORK_OVERRIDE') || tokens[0];
  } else {
    // Single assignee
    let singleWorkerObj = worker;
    if (!singleWorkerObj && assignees.length === 1) {
      singleWorkerObj = workers.find((w) => w.id === assignees[0].worker_id) || { name: assignees[0].name, country_code: assignees[0].country_code };
    }
    const st = resolveWorkDayStatus(dateStr, singleWorkerObj as any, countryHolidays, calendarOverrides);
    if (st?.day_type === 'LEAVE') {
      hasVacation = true;
    }
    overallToken = resolveCalendarVisualState(
      dateStr,
      singleWorkerObj,
      st || dayStatus,
      countryOffState,
      countryHolidays,
      calendarOverrides
    );
    const isW = overallToken.visualState === 'WORKDAY' || overallToken.visualState === 'WORK_OVERRIDE';
    partialState = isW ? 'ALL_WORKING' : 'ALL_OFF';
    workingCount = isW ? 1 : 0;
    offCount = isW ? 0 : 1;
    totalAssignees = 1;
  }

  const isWorking = availabilityPolicy === 'ALL_REQUIRED'
    ? partialState === 'ALL_WORKING'
    : partialState !== 'ALL_OFF';

  const offReason = dayStatus?.label_ko || overallToken.label;

  let hatchPatternStyle: React.CSSProperties | undefined;
  if (partialState !== 'ALL_WORKING' && overallToken.hatchColor) {
    const hatchColor = overallToken.hatchColor;
    hatchPatternStyle = {
      backgroundImage: `repeating-linear-gradient(135deg, ${hatchColor} 0px, ${hatchColor} 3px, transparent 3px, transparent 10px)`,
      opacity: 1.0,
    };
  }

  const ariaLabel = `${dateStr} - ${offReason} (${overallToken.label})`;
  const hatchTestId = taskId ? `task-worker-hatch-${taskId}-${dateStr}` : `worker-off-hatch-${dateStr}`;

  // Width percentage for partial off hatch
  const offWidthPercent = partialState === 'PARTIAL_OFF' ? Math.round((offCount / totalAssignees) * 100) : 100;

  return (
    <div
      data-worker-day-type={dayStatus?.day_type || 'WORKDAY'}
      data-worker-visual-state={overallToken.visualState}
      data-worker-availability-state={partialState}
      data-assignee-availability={partialState}
      data-worker-is-working={isWorking ? 'true' : 'false'}
      data-worker-off-reason={offReason}
      aria-label={ariaLabel}
      onClick={onClick}
      style={style}
      className={`relative border-r border-slate-200 transition select-none h-full w-full ${overallToken.baseClass} ${className}`}
    >
      {/* Layer 0: Base Cell Content / Background */}
      <div className="absolute inset-0 z-0 h-full w-full" />

      {/* Layer 10: ScheduleBar & Cell Inner Children */}
      <div className="relative z-10 h-full w-full">{children}</div>

      {/* Layer 20: Subtle Hatch Pattern Overlay (pointer-events-none, z-20) */}
      {hatchPatternStyle && (
        <div
          data-testid={hatchTestId}
          data-assignee-availability={partialState}
          style={{ ...hatchPatternStyle, width: `${offWidthPercent}%` }}
          className="absolute top-0 bottom-0 left-0 z-20 pointer-events-none"
        />
      )}

      {/* Partial Off / Vacation Badge Indicator */}
      {partialState === 'PARTIAL_OFF' && (
        <div
          data-testid="worker-partial-off-badge"
          title={`일부 작업자 휴무 (${offCount}/${totalAssignees}명 휴무)`}
          className={`absolute top-0.5 right-0.5 z-25 text-[9px] font-extrabold px-1 rounded shadow-xs pointer-events-none ${
            hasVacation ? 'bg-purple-600 text-white' : 'bg-amber-500 text-white'
          }`}
        >
          {offCount}/{totalAssignees}{hasVacation ? ' 휴가' : ''}
        </div>
      )}

      {/* Single Assignee Full Vacation Badge */}
      {partialState === 'ALL_OFF' && hasVacation && (
        <div
          data-testid="worker-full-vacation-badge"
          className="absolute top-0.5 right-0.5 z-25 text-[9px] font-extrabold px-1 rounded bg-purple-600 text-white shadow-xs pointer-events-none"
        >
          휴가
        </div>
      )}

    </div>
  );
};
