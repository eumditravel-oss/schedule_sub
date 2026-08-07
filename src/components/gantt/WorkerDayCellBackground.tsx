// src/components/gantt/WorkerDayCellBackground.tsx
import React from 'react';
import { Worker, WorkDayStatus, CountryHoliday, CalendarOverride, TaskAssignee, AvailabilityPolicy } from '../../types';
import { CountryOffState, resolveWorkDayStatus } from '../../utils/workCalendar';
import { resolveCalendarVisualState, CalendarVisualToken } from '../../utils/calendarVisualTokens';

interface WorkerDayCellBackgroundProps {
  dateStr: string;
  taskId?: string;
  taskStartDate?: string | null;
  taskEndDate?: string | null;
  isTaskDateInRange?: boolean;
  worker?: Partial<Worker> | null;
  assignees?: TaskAssignee[];
  availabilityPolicy?: AvailabilityPolicy;
  dayStatus?: WorkDayStatus | null;
  countryOffState?: CountryOffState | { state: CountryOffState } | null;
  countryHolidays?: CountryHoliday[];
  calendarOverrides?: CalendarOverride[];
  workers?: Worker[];
  isToday?: boolean;
  isOverlayOnly?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
}

export const WorkerDayCellBackground: React.FC<WorkerDayCellBackgroundProps> = ({
  dateStr,
  taskId,
  taskStartDate,
  taskEndDate,
  isTaskDateInRange,
  worker,
  assignees = [],
  availabilityPolicy = 'ANY_AVAILABLE',
  dayStatus,
  countryOffState,
  countryHolidays = [],
  calendarOverrides = [],
  workers = [],
  isToday,
  isOverlayOnly = false,
  className = '',
  style,
  onClick,
  children,
}) => {
  const hasMultiAssignees = assignees && assignees.length > 1;

  // Determine if this cell date is within the task's schedule range
  const inRange =
    isTaskDateInRange !== undefined
      ? isTaskDateInRange
      : taskStartDate && taskEndDate
      ? dateStr >= taskStartDate && dateStr <= taskEndDate
      : true;

  let overallToken: CalendarVisualToken;
  let partialState: 'ALL_WORKING' | 'ALL_OFF' | 'PARTIAL_OFF' = 'ALL_WORKING';
  let workingCount = 1;
  let totalAssignees = 1;
  let hasVacation = false;
  let hasManualOff = false;
  let offCount = 0;
  let hasProfileError = false;

  if (hasMultiAssignees) {
    const resolvedAssignees = assignees.map((a) => {
      const wObj = workers.find((w) => w.id === a.worker_id);
      if (!wObj || !wObj.country_code || !wObj.workweek_profile) {
        console.error(`ASSIGNEE_WORKER_NOT_FOUND_OR_PROFILE_MISSING:${a.worker_id}`);
        return { assignee: a, worker: null, status: null, token: null, isError: true };
      }
      const st = resolveWorkDayStatus(dateStr, wObj, countryHolidays, calendarOverrides);
      const tok = resolveCalendarVisualState(dateStr, wObj, st, countryOffState, countryHolidays, calendarOverrides);
      return { assignee: a, worker: wObj, status: st, token: tok, isError: false };
    });

    const validResolutions = resolvedAssignees.filter((r) => !r.isError && r.status && r.token);

    if (validResolutions.length === 0) {
      hasProfileError = true;
      totalAssignees = assignees.length;
      workingCount = totalAssignees;
      offCount = 0;
      partialState = 'ALL_WORKING'; // Profile error is NOT treated as MANUAL_OFF
      overallToken = resolveCalendarVisualState(dateStr, null, dayStatus, countryOffState, countryHolidays, calendarOverrides);
    } else {
      totalAssignees = validResolutions.length;
      // Single Source of Truth: resolveWorkDayStatus(...).is_working_day
      workingCount = validResolutions.filter((r) => r.status!.is_working_day).length;
      offCount = totalAssignees - workingCount;

      const offResolutions = validResolutions.filter((r) => !r.status!.is_working_day);
      if (offResolutions.some((r) => r.status!.day_type === 'LEAVE')) {
        hasVacation = true;
      }
      if (offResolutions.some((r) => r.status!.day_type === 'MANUAL_OFF')) {
        hasManualOff = true;
      }

      if (workingCount === totalAssignees) {
        partialState = 'ALL_WORKING';
      } else if (workingCount === 0) {
        partialState = 'ALL_OFF';
      } else {
        partialState = 'PARTIAL_OFF';
      }

      // Explicit visual reason priority: LEAVE > MANUAL_OFF > PUBLIC_HOLIDAY > WEEKLY_OFF
      if (offResolutions.length > 0) {
        const priorityOrder: WorkDayStatus['day_type'][] = ['LEAVE', 'MANUAL_OFF', 'PUBLIC_HOLIDAY', 'WEEKLY_OFF'];
        let picked = offResolutions[0];
        for (const type of priorityOrder) {
          const found = offResolutions.find((r) => r.status!.day_type === type);
          if (found) {
            picked = found;
            break;
          }
        }
        overallToken = picked.token!;
      } else {
        overallToken = validResolutions[0].token!;
      }
    }
  } else {
    // Single assignee logic
    let singleWorkerObj = worker;
    if ((!singleWorkerObj || !singleWorkerObj.country_code || !singleWorkerObj.workweek_profile) && assignees.length === 1) {
      singleWorkerObj = workers.find((w) => w.id === assignees[0].worker_id) || null;
    }
    const hasProfile = singleWorkerObj && singleWorkerObj.country_code && singleWorkerObj.workweek_profile;

    if (!hasProfile) {
      if (assignees.length === 1 && assignees[0].worker_id) {
        console.error(`ASSIGNEE_WORKER_NOT_FOUND_OR_PROFILE_MISSING:${assignees[0].worker_id}`);
      }
      hasProfileError = true;
      overallToken = resolveCalendarVisualState(dateStr, null, dayStatus, countryOffState, countryHolidays, calendarOverrides);
      partialState = 'ALL_WORKING';
      workingCount = 1;
      offCount = 0;
      totalAssignees = 1;
    } else {
      const st = resolveWorkDayStatus(dateStr, singleWorkerObj as Worker, countryHolidays, calendarOverrides);
      if (st?.day_type === 'LEAVE') {
        hasVacation = true;
      }
      if (st?.day_type === 'MANUAL_OFF') {
        hasManualOff = true;
      }
      overallToken = resolveCalendarVisualState(
        dateStr,
        singleWorkerObj,
        st || dayStatus,
        countryOffState,
        countryHolidays,
        calendarOverrides
      );

      // Single Source of Truth: st.is_working_day
      const isW = st ? st.is_working_day : (overallToken.visualState === 'WORKDAY' || overallToken.visualState === 'WORK_OVERRIDE');
      partialState = isW ? 'ALL_WORKING' : 'ALL_OFF';
      workingCount = isW ? 1 : 0;
      offCount = isW ? 0 : 1;
      totalAssignees = 1;
    }
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

  // Width percentage for partial off hatch based on actual off ratio
  const offWidthPercent = partialState === 'PARTIAL_OFF' ? Math.round((offCount / totalAssignees) * 100) : 100;

  const bgClass = isOverlayOnly ? 'bg-transparent border-transparent pointer-events-none' : `${overallToken.baseClass} border-slate-200`;

  return (
    <div
      data-worker-day-type={dayStatus?.day_type || 'WORKDAY'}
      data-worker-visual-state={overallToken.visualState}
      data-worker-availability-state={partialState}
      data-assignee-availability={partialState}
      data-worker-is-working={isWorking ? 'true' : 'false'}
      data-worker-off-reason={offReason}
      data-working-count={workingCount}
      data-off-count={offCount}
      data-has-profile-error={hasProfileError ? 'true' : 'false'}
      aria-label={ariaLabel}
      onClick={onClick}
      style={style}
      className={`relative transition select-none h-full w-full ${bgClass} ${className}`}
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

      {/* Partial Off / Vacation Badge Indicator (Shown ONLY within task schedule range) */}
      {partialState === 'PARTIAL_OFF' && inRange && (
        <div
          data-testid="worker-partial-off-badge"
          title={`일부 작업자 휴무 (${offCount}/${totalAssignees}명 휴무)`}
          className={`absolute top-0.5 right-0.5 z-25 text-[9px] font-extrabold px-1 rounded shadow-xs pointer-events-none ${
            hasVacation ? 'bg-purple-600 text-white' : 'bg-amber-500 text-white'
          }`}
        >
          {offCount}/{totalAssignees}{hasVacation ? ' 휴가' : hasManualOff ? ' 수동휴무' : ' 휴무'}
        </div>
      )}

      {/* Single Assignee Full Vacation Badge (Shown ONLY within task schedule range) */}
      {partialState === 'ALL_OFF' && hasVacation && inRange && (
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
