// src/utils/GanttMonthBoundary.ts
import React from 'react';
import { GanttDateColumn } from '../types';

export const GANTT_MONTH_BOUNDARY_STYLE: React.CSSProperties = {
  boxSizing: 'border-box',
  borderLeft: '2px solid rgba(100,116,139,0.32)',
};

export function isMonthStartColumn(dateColumns: Array<{ dateStr: string }> | GanttDateColumn[] | undefined, idx: number): boolean {
  if (idx <= 0 || !dateColumns || idx >= dateColumns.length) return false;
  return dateColumns[idx].dateStr.slice(0, 7) !== dateColumns[idx - 1].dateStr.slice(0, 7);
}
