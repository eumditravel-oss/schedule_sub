import React from 'react';
import { CalendarOverride, CountryHoliday } from '../../types';
import { getCountryOffState } from '../../utils/workCalendar';
import { GANTT_DAY_WIDTH_PX } from '../../utils/ganttGeometry';
import { CALENDAR_VISUAL_TOKENS, buildCalendarHatchPattern } from '../../utils/calendarVisualTokens';

export interface ProjectCalendarHatchOverlayProps {
  projectId: string;
  startDate: string;
  endDate: string;
  dateColumns: { dateStr: string; isToday?: boolean }[];
  calendarOverrides?: CalendarOverride[];
  countryHolidays?: CountryHoliday[];
  dayWidthPx?: number;
  className?: string;
}

export const ProjectCalendarHatchOverlay: React.FC<ProjectCalendarHatchOverlayProps> = ({
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
      data-testid={`project-calendar-hatch-grid-${projectId}`}
      className={`absolute inset-0 z-10 grid pointer-events-none select-none ${className}`}
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
          return <div key={cIdx} className="w-full h-full" data-project-calendar-state="BOTH_WORK" />;
        }

        const token = CALENDAR_VISUAL_TOKENS[state as keyof typeof CALENDAR_VISUAL_TOKENS] || CALENDAR_VISUAL_TOKENS.WORKDAY;
        
        const pattern = buildCalendarHatchPattern(token, 0.60);
        const hatchStyle: React.CSSProperties = pattern
          ? { backgroundImage: pattern }
          : {};

        return (
          <div
            key={cIdx}
            data-testid={`project-calendar-hatch-${projectId}-${col.dateStr}`}
            data-project-calendar-state={state}
            data-calendar-surface="PROJECT_OVERVIEW"
            data-calendar-visual-state={state}
            data-calendar-hatch-type={token.hatch.type}
            data-calendar-hatch-angle={token.hatch.angle}
            className="w-full h-full bg-transparent transition-opacity"
            style={hatchStyle}
          />
        );
      })}
    </div>
  );
};
