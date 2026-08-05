// src/utils/ganttGeometry.ts

export const GANTT_DAY_WIDTH_PX = 36;
export const DESKTOP_GANTT_DAY_WIDTH = 36;
export const MOBILE_GANTT_DAY_WIDTH = 30;
export const DESKTOP_DAY_WIDTH_PX = 36;
export const MOBILE_DAY_WIDTH_PX = 30;

export function getTimelineWidth(dateCount: number, dayWidth: number = DESKTOP_GANTT_DAY_WIDTH): number {
  return dateCount * dayWidth;
}

export function getDateLeft(index: number, dayWidth: number = DESKTOP_GANTT_DAY_WIDTH): number {
  return index * dayWidth;
}

export function getSpanWidth(spanCount: number, dayWidth: number = DESKTOP_GANTT_DAY_WIDTH): number {
  return spanCount * dayWidth;
}

export function getDateSpanWidth(spanCount: number, dayWidth: number = DESKTOP_GANTT_DAY_WIDTH): number {
  return spanCount * dayWidth;
}

export function getTimelineGridTemplate(dateCount: number, dayWidth: number = DESKTOP_GANTT_DAY_WIDTH): string {
  return `repeat(${dateCount}, ${dayWidth}px)`;
}

export interface GanttBarGeometry {
  startIndex: number;
  spanCount: number;
  leftPx: number;
  widthPx: number;
}

export function getGanttBarGeometry(
  startDateStr: string,
  endDateStr: string,
  dateColumns: { dateStr: string }[],
  dayWidth: number = DESKTOP_GANTT_DAY_WIDTH
): GanttBarGeometry | null {
  if (!dateColumns || dateColumns.length === 0) return null;
  const firstColDate = dateColumns[0].dateStr;
  const lastColDate = dateColumns[dateColumns.length - 1].dateStr;

  if (endDateStr < firstColDate || startDateStr > lastColDate) return null;

  const startIndex = Math.max(0, dateColumns.findIndex((c) => c.dateStr >= startDateStr));
  let endIndex = dateColumns.findIndex((c) => c.dateStr > endDateStr);
  if (endIndex === -1) endIndex = dateColumns.length;

  const spanCount = Math.max(1, endIndex - startIndex);
  return {
    startIndex,
    spanCount,
    leftPx: startIndex * dayWidth,
    widthPx: spanCount * dayWidth,
  };
}

export interface MonthSegment {
  yearMonth: string; // "2026-08"
  label: string;     // "2026.08"
  startIndex: number;
  spanCount: number;
}

export function getMonthSegments(dateColumns: { dateStr: string }[]): MonthSegment[] {
  if (!dateColumns || dateColumns.length === 0) return [];

  const segments: MonthSegment[] = [];
  let currentYm = '';
  let currentStart = 0;
  let currentSpan = 0;

  dateColumns.forEach((col, idx) => {
    const ym = col.dateStr.substring(0, 7);
    if (ym !== currentYm) {
      if (currentSpan > 0) {
        const [year, month] = currentYm.split('-');
        segments.push({
          yearMonth: currentYm,
          label: `${year}.${month}`,
          startIndex: currentStart,
          spanCount: currentSpan,
        });
      }
      currentYm = ym;
      currentStart = idx;
      currentSpan = 1;
    } else {
      currentSpan++;
    }
  });

  if (currentSpan > 0 && currentYm) {
    const [year, month] = currentYm.split('-');
    segments.push({
      yearMonth: currentYm,
      label: `${year}.${month}`,
      startIndex: currentStart,
      spanCount: currentSpan,
    });
  }

  return segments;
}
