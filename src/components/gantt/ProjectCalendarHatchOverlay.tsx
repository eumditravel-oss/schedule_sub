import React from 'react';
import { CalendarOverride, CountryHoliday } from '../../types';
import { getCountryOffState } from '../../utils/workCalendar';
import { GANTT_DAY_WIDTH_PX } from '../../utils/ganttGeometry';

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
      className={`absolute inset-0 z-20 grid pointer-events-none select-none ${className}`}
      style={{ gridTemplateColumns: `repeat(${dateColumns.length}, ${dayWidthPx}px)` }}
    >
      {dateColumns.map((col, cIdx) => {
        const isInRange = col.dateStr >= startDate && col.dateStr <= endDate;
        if (!isInRange) {
          return <div key={cIdx} className="w-full h-full" />;
        }

        const offInfo = getCountryOffState(col.dateStr, calendarOverrides, countryHolidays);
        const state = offInfo.state;

        let hatchStyle: React.CSSProperties = {};
        let bgClass = '';

        if (state === 'BOTH_OFF') {
          bgClass = 'bg-rose-500/20';
          hatchStyle = {
            backgroundImage: `repeating-linear-gradient(45deg, rgba(244,63,94,0.22), rgba(244,63,94,0.22) 4px, transparent 4px, transparent 8px)`,
          };
        } else if (state === 'KR_ONLY_OFF') {
          bgClass = 'bg-orange-500/18';
          hatchStyle = {
            backgroundImage: `repeating-linear-gradient(45deg, rgba(249,115,22,0.20), rgba(249,115,22,0.20) 4px, transparent 4px, transparent 8px)`,
          };
        } else if (state === 'VN_ONLY_OFF') {
          bgClass = 'bg-amber-500/18';
          hatchStyle = {
            backgroundImage: `repeating-linear-gradient(45deg, rgba(245,158,11,0.20), rgba(245,158,11,0.20) 4px, transparent 4px, transparent 8px)`,
          };
        }

        if (state === 'BOTH_WORK') {
          return <div key={cIdx} className="w-full h-full" data-project-calendar-state="BOTH_WORK" />;
        }

        return (
          <div
            key={cIdx}
            data-testid={`project-calendar-hatch-${projectId}-${col.dateStr}`}
            data-project-calendar-state={state}
            className={`w-full h-full transition-opacity ${bgClass}`}
            style={hatchStyle}
          />
        );
      })}
    </div>
  );
};
