// src/components/gantt/WorkerDayCellBackground.tsx
import React from 'react';
import { Worker, WorkDayStatus, CountryHoliday, CalendarOverride } from '../../types';
import { CountryOffState } from '../../utils/workCalendar';
import { resolveCalendarVisualState, CalendarVisualToken } from '../../utils/calendarVisualTokens';

interface WorkerDayCellBackgroundProps {
  dateStr: string;
  worker?: Partial<Worker> | null;
  dayStatus?: WorkDayStatus | null;
  countryOffState?: CountryOffState | { state: CountryOffState } | null;
  countryHolidays?: CountryHoliday[];
  calendarOverrides?: CalendarOverride[];
  isToday?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
}

export const WorkerDayCellBackground: React.FC<WorkerDayCellBackgroundProps> = ({
  dateStr,
  worker,
  dayStatus,
  countryOffState,
  countryHolidays,
  calendarOverrides,
  isToday,
  className = '',
  style,
  onClick,
  children,
}) => {
  const token: CalendarVisualToken = resolveCalendarVisualState(
    dateStr,
    worker,
    dayStatus,
    countryOffState,
    countryHolidays,
    calendarOverrides
  );

  const isWorking = token.visualState === 'WORKDAY' || token.visualState === 'WORK_OVERRIDE';
  const offReason = dayStatus?.label_ko || token.label;

  const todayStyle = isToday ? 'ring-2 ring-blue-500 ring-inset z-30' : '';

  // Strong Color Hatch Pattern Gradient for non-working visual states
  let hatchPatternStyle: React.CSSProperties | undefined;
  if (!isWorking && token.hatchColor) {
    const bgGap = token.hatchBg || 'transparent';
    hatchPatternStyle = {
      backgroundImage: `repeating-linear-gradient(135deg, ${token.hatchColor} 0px, ${token.hatchColor} 5px, ${bgGap} 5px, ${bgGap} 10px)`,
    };
  }

  const ariaLabel = `${dateStr} ${worker?.name || ''} - ${offReason} (${token.label})`;

  return (
    <div
      data-worker-day-type={dayStatus?.day_type || 'WORKDAY'}
      data-worker-visual-state={token.visualState}
      data-worker-is-working={isWorking ? 'true' : 'false'}
      data-worker-off-reason={offReason}
      aria-label={ariaLabel}
      onClick={onClick}
      style={style}
      className={`relative border-r border-slate-200 transition select-none ${token.baseClass} ${todayStyle} ${className}`}
    >
      {/* Layer 0: Base Cell Content / Background */}
      <div className="absolute inset-0 z-0" />

      {/* Layer 10: ScheduleBar & Cell Inner Children */}
      <div className="relative z-10 h-full w-full">{children}</div>

      {/* Layer 20: Strong Hatch Pattern Overlay (Repeats over ScheduleBar Track for visibility) */}
      {hatchPatternStyle && (
        <div
          data-testid="worker-off-hatch-overlay"
          style={hatchPatternStyle}
          className="absolute inset-0 z-20 pointer-events-none"
        />
      )}
    </div>
  );
};
