import React from 'react';
import { GANTT_Z } from '../../constants/ganttLayers';
import { isMonthStartColumn } from '../../utils/GanttMonthBoundary';

export interface GanttMonthBoundaryOverlayProps {
  dateColumns: Array<{ dateStr: string }>;
  dayWidthPx: number;
  leftOffsetPx: number;
  timelineWidthPx: number;
  surface: 'overview' | 'detail';
}

/** Draw month separators once across the complete Gantt body. */
export const GanttMonthBoundaryOverlay: React.FC<GanttMonthBoundaryOverlayProps> = ({
  dateColumns,
  dayWidthPx,
  leftOffsetPx,
  timelineWidthPx,
  surface,
}) => (
  <div
    data-testid={`gantt-month-boundary-grid-${surface}`}
    aria-hidden="true"
    className="absolute top-0 bottom-0 pointer-events-none select-none"
    style={{
      left: `${leftOffsetPx}px`,
      width: `${timelineWidthPx}px`,
      zIndex: GANTT_Z.MONTH_BOUNDARY,
      borderTopWidth: 0,
    }}
  >
    {dateColumns.map((col, idx) => {
      if (!isMonthStartColumn(dateColumns, idx)) return null;

      return (
        <div
          key={col.dateStr}
          data-testid={`gantt-month-boundary-line-${surface}-${col.dateStr}`}
          data-date={col.dateStr}
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{
            left: `${idx * dayWidthPx}px`,
            width: '2px',
            backgroundColor: 'rgba(100,116,139,0.32)',
          }}
        />
      );
    })}
  </div>
);
