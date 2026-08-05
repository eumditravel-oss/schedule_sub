// src/components/gantt/WorkerDayCellBackground.tsx
import React from 'react';
import { Worker, WorkDayStatus, CountryHoliday, CalendarOverride, TaskAssignee, AvailabilityPolicy } from '../../types';
import { CountryOffState, resolveWorkDayStatus } from '../../utils/workCalendar';
import { resolveCalendarVisualState, CalendarVisualToken, TODAY_OUTLINE_STYLE } from '../../utils/calendarVisualTokens';

interface WorkerDayCellBackgroundProps {
  dateStr: string;
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
  // If multi-assignees provided
  const hasMultiAssignees = assignees && assignees.length > 1;

  let overallToken: CalendarVisualToken;
  let partialState: 'ALL_WORKING' | 'ALL_OFF' | 'PARTIAL_OFF' = 'ALL_WORKING';
  let workingCount = 1;
  let totalAssignees = 1;

  if (hasMultiAssignees) {
    totalAssignees = assignees.length;
    const tokens = assignees.map((a) => {
      const wObj = workers.find((w) => w.id === a.worker_id) || { name: a.name, country_code: a.country_code };
      const st = resolveWorkDayStatus(dateStr, wObj as any, countryHolidays, calendarOverrides);
      return resolveCalendarVisualState(dateStr, wObj, st, countryOffState, countryHolidays, calendarOverrides);
    });

    workingCount = tokens.filter((t) => t.visualState === 'WORKDAY' || t.visualState === 'WORK_OVERRIDE').length;

    if (workingCount === totalAssignees) {
      partialState = 'ALL_WORKING';
    } else if (workingCount === 0) {
      partialState = 'ALL_OFF';
    } else {
      partialState = 'PARTIAL_OFF';
    }

    overallToken = tokens.find((t) => t.visualState !== 'WORKDAY') || tokens[0];
  } else {
    overallToken = resolveCalendarVisualState(
      dateStr,
      worker,
      dayStatus,
      countryOffState,
      countryHolidays,
      calendarOverrides
    );
    const isW = overallToken.visualState === 'WORKDAY' || overallToken.visualState === 'WORK_OVERRIDE';
    partialState = isW ? 'ALL_WORKING' : 'ALL_OFF';
  }

  const isWorking = availabilityPolicy === 'ALL_REQUIRED'
    ? partialState === 'ALL_WORKING'
    : partialState !== 'ALL_OFF';

  const offReason = dayStatus?.label_ko || overallToken.label;

  let hatchPatternStyle: React.CSSProperties | undefined;
  if (partialState !== 'ALL_WORKING' && overallToken.hatchColor) {
    hatchPatternStyle = {
      backgroundImage: `repeating-linear-gradient(135deg, ${overallToken.hatchColor} 0px, ${overallToken.hatchColor} 3px, transparent 3px, transparent 10px)`,
      opacity: partialState === 'PARTIAL_OFF' ? 0.4 : 1.0,
    };
  }

  const ariaLabel = `${dateStr} - ${offReason} (${overallToken.label})`;

  return (
    <div
      data-worker-day-type={dayStatus?.day_type || 'WORKDAY'}
      data-worker-visual-state={overallToken.visualState}
      data-worker-availability-state={partialState}
      data-worker-is-working={isWorking ? 'true' : 'false'}
      data-worker-off-reason={offReason}
      aria-label={ariaLabel}
      onClick={onClick}
      style={style}
      className={`relative border-r border-slate-200 transition select-none ${overallToken.baseClass} ${className}`}
    >
      {/* Layer 0: Base Cell Content / Background */}
      <div className="absolute inset-0 z-0" />

      {/* Layer 10: ScheduleBar & Cell Inner Children */}
      <div className="relative z-10 h-full w-full">{children}</div>

      {/* Layer 20: Subtle Hatch Pattern Overlay (pointer-events-none) */}
      {hatchPatternStyle && (
        <div
          data-testid="worker-off-hatch-overlay"
          style={hatchPatternStyle}
          className="absolute inset-0 z-20 pointer-events-none"
        />
      )}

      {/* Partial Off Badge Indicator */}
      {partialState === 'PARTIAL_OFF' && (
        <div
          data-testid="worker-partial-off-badge"
          title={`일부 작업자 휴무 (${workingCount}/${totalAssignees}명 근무)`}
          className="absolute top-0.5 right-0.5 z-25 text-[9px] font-extrabold px-1 rounded bg-amber-500 text-white shadow-xs pointer-events-none"
        >
          {workingCount}/{totalAssignees}
        </div>
      )}

      {/* Layer 30: Today Pure Inset Blue Outline Overlay */}
      {isToday && (
        <div
          data-testid="worker-today-outline"
          style={TODAY_OUTLINE_STYLE}
          className="absolute inset-0 z-30 pointer-events-none rounded-none"
        />
      )}
    </div>
  );
};
