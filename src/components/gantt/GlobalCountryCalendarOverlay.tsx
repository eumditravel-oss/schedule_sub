// src/components/gantt/GlobalCountryCalendarOverlay.tsx
import React from 'react';
import { CalendarOverride, CountryHoliday } from '../../types';
import { getCountryOffState } from '../../utils/workCalendar';
import { GANTT_DAY_WIDTH_PX } from '../../utils/ganttGeometry';
import { CALENDAR_VISUAL_TOKENS, buildCalendarHatchPattern } from '../../utils/calendarVisualTokens';

export interface GlobalCountryCalendarOverlayProps {
  projectId: string;
  startDate: string;
  endDate: string;
  dateColumns: { dateStr: string; isToday?: boolean }[];
  calendarOverrides?: CalendarOverride[];
  countryHolidays?: CountryHoliday[];
  dayWidthPx?: number;
  className?: string;
}

export const GlobalCountryCalendarOverlay: React.FC<GlobalCountryCalendarOverlayProps> = ({
  projectId,
  startDate,
  endDate,
  dateColumns,
  calendarOverrides = [],
  countryHolidays = [],
  dayWidthPx = GANTT_DAY_WIDTH_PX,
  className = '',
}) => {
  return (
    <div
      data-testid={`global-country-calendar-overlay-${projectId}`}
      className={`absolute inset-0 z-0 grid pointer-events-none select-none ${className}`}
      style={{ gridTemplateColumns: `repeat(${dateColumns.length}, ${dayWidthPx}px)` }}
    >
      {dateColumns.map((col, cIdx) => {
        const isInRange = col.dateStr >= startDate && col.dateStr <= endDate;
        if (!isInRange) {
          return <div key={cIdx} className="w-full h-full" />;
        }

        const offInfo = getCountryOffState(col.dateStr, calendarOverrides, countryHolidays);
        const state = offInfo.state;

        if (state === 'BOTH_WORK') {
          return (
            <div
              key={cIdx}
              className="w-full h-full border-r border-slate-100"
              data-calendar-surface="GLOBAL_BACKGROUND"
              data-calendar-visual-state="BOTH_WORK"
            />
          );
        }

        const token = CALENDAR_VISUAL_TOKENS[state as keyof typeof CALENDAR_VISUAL_TOKENS] || CALENDAR_VISUAL_TOKENS.WORKDAY;
        // Soft alpha overlay for background columns (0.35 opacity pattern)
        const pattern = buildCalendarHatchPattern(token, 0.35);
        const hatchStyle: React.CSSProperties = pattern ? { backgroundImage: pattern } : {};

        return (
          <div
            key={cIdx}
            data-testid={`global-country-hatch-${col.dateStr}`}
            data-calendar-surface="GLOBAL_BACKGROUND"
            data-calendar-visual-state={state}
            data-calendar-hatch-type={token.hatch.type}
            data-calendar-hatch-angle={token.hatch.angle}
            className="w-full h-full border-r border-slate-100/60 bg-transparent transition-opacity"
            style={hatchStyle}
          />
        );
      })}
    </div>
  );
};
