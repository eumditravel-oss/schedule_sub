// src/components/gantt/TodayColumnOverlay.tsx
import React from 'react';
import { GANTT_DAY_WIDTH_PX } from '../../utils/ganttGeometry';

export interface TodayColumnOverlayProps {
  dateColumns: { dateStr: string; isToday?: boolean }[];
  dayWidthPx?: number;
  className?: string;
}

export const TodayColumnOverlay: React.FC<TodayColumnOverlayProps> = ({
  dateColumns,
  dayWidthPx = GANTT_DAY_WIDTH_PX,
  className = '',
}) => {
  const todayIndex = dateColumns.findIndex((col) => col.isToday);
  const todayCol = dateColumns[todayIndex];
  if (todayIndex === -1 || !todayCol) return null;

  const leftPx = todayIndex * dayWidthPx;

  return (
    <div
      data-testid="gantt-today-column"
      data-date={todayCol.dateStr}
      aria-hidden="true"
      style={{
        left: `${leftPx}px`,
        width: `${dayWidthPx}px`,
        background: 'rgba(59, 130, 246, 0.035)',
      }}
      className={`absolute top-0 bottom-0 z-5 pointer-events-none select-none border-x border-blue-400/20 ${className}`}
    />
  );
};
