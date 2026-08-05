// src/components/gantt/WorkerDayCellBackground.tsx
import React from 'react';
import { Worker, WorkDayStatus, CountryHoliday, CalendarOverride } from '../../types';
import { CountryOffState } from '../../utils/workCalendar';
import { resolveCalendarVisualState, CalendarVisualToken, TODAY_OUTLINE_STYLE } from '../../utils/calendarVisualTokens';

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

  // Subtle Color Hatch Pattern Gradient (3px color, 7px transparent gap)
  let hatchPatternStyle: React.CSSProperties | undefined;
  if (!isWorking && token.hatchColor) {
    hatchPatternStyle = {
      backgroundImage: `repeating-linear-gradient(135deg, ${token.hatchColor} 0px, ${token.hatchColor} 3px, transparent 3px, transparent 10px)`,
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
      className={`relative border-r border-slate-200 transition select-none ${token.baseClass} ${className}`}
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
          className="absolute inset-0 z-20 pointer-events-none opacity-100"
        />
      )}

      {/* Layer 30: Today Pure Inset Blue Outline Overlay (Transparent inside, pointer-events-none, never covers ScheduleBar) */}
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
