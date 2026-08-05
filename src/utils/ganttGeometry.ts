// src/utils/ganttGeometry.ts

export const GANTT_DAY_WIDTH_PX = 36;
export const DESKTOP_DAY_WIDTH_PX = 36;
export const MOBILE_DAY_WIDTH_PX = 30;

export function getTimelineWidth(dateCount: number, dayWidthPx: number = GANTT_DAY_WIDTH_PX): number {
  return dateCount * dayWidthPx;
}

export function getDateLeft(index: number, dayWidthPx: number = GANTT_DAY_WIDTH_PX): number {
  return index * dayWidthPx;
}

export function getDateSpanWidth(spanCount: number, dayWidthPx: number = GANTT_DAY_WIDTH_PX): number {
  return spanCount * dayWidthPx;
}

export function getTimelineGridTemplate(dateCount: number, dayWidthPx: number = GANTT_DAY_WIDTH_PX): string {
  return `repeat(${dateCount}, ${dayWidthPx}px)`;
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
