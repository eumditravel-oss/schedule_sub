// src/utils/dateUtils.ts
import {
  addDays,
  subDays,
  addMonths,
  subMonths,
  format,
  isWeekend,
  startOfDay,
  startOfMonth,
  endOfMonth,
  differenceInCalendarDays,
  parseISO,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { GanttDateColumn } from '../types';

export type GanttViewMode = 'THIRTY_DAYS' | 'MONTH';

export function formatDateStr(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function formatKoreanDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = parseISO(dateStr);
    return format(d, 'yyyy.MM.dd(EEE)', { locale: ko });
  } catch {
    return dateStr;
  }
}

/**
 * 30-Day Range: anchorDate - 15 days ~ anchorDate + 14 days (Exact 30 days)
 */
export function getThirtyDaysRange(anchorDate: Date = new Date()): { startDate: Date; endDate: Date } {
  const anchor = startOfDay(anchorDate);
  const startDate = subDays(anchor, 15);
  const endDate = addDays(anchor, 14);
  return { startDate, endDate };
}

/**
 * Monthly Range: 1st of month ~ Last day of month
 */
export function getMonthRange(anchorDate: Date = new Date()): { startDate: Date; endDate: Date } {
  const anchor = startOfDay(anchorDate);
  const startDate = startOfMonth(anchor);
  const endDate = endOfMonth(anchor);
  return { startDate, endDate };
}

/**
 * Generate columns for date range
 */
export function generateDateColumns(
  startDate: Date,
  endDate: Date,
  referenceToday: Date = new Date()
): GanttDateColumn[] {
  const columns: GanttDateColumn[] = [];
  let current = startOfDay(startDate);
  const end = startOfDay(endDate);

  const todayStr = format(startOfDay(referenceToday), 'yyyy-MM-dd');
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  while (current <= end) {
    const dateStr = format(current, 'yyyy-MM-dd');
    const dayOfWeek = current.getDay();
    const isWknd = isWeekend(current);

    columns.push({
      date: new Date(current),
      dateStr,
      dayNum: current.getDate(),
      dayName: dayNames[dayOfWeek],
      isWeekend: isWknd,
      isToday: dateStr === todayStr,
      monthStr: format(current, 'yyyy년 MM월', { locale: ko }),
    });

    current = addDays(current, 1);
  }

  return columns;
}

export function groupColumnsByMonth(columns: GanttDateColumn[]): Array<{ monthStr: string; span: number }> {
  const groups: Array<{ monthStr: string; span: number }> = [];

  for (const col of columns) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.monthStr === col.monthStr) {
      lastGroup.span += 1;
    } else {
      groups.push({ monthStr: col.monthStr, span: 1 });
    }
  }

  return groups;
}

/**
 * Calculates visible Gantt bar span safely within current view range
 * visibleStart = max(scheduleStart, viewStart)
 * visibleEnd = min(scheduleEnd, viewEnd)
 */
export function calculateVisibleGanttSpan(
  scheduleStartStr: string,
  scheduleEndStr: string,
  viewStart: Date,
  viewEnd: Date
): { isVisible: boolean; startIndex: number; durationDays: number } {
  try {
    const schedStart = startOfDay(parseISO(scheduleStartStr));
    const schedEnd = startOfDay(parseISO(scheduleEndStr));
    const vStart = startOfDay(viewStart);
    const vEnd = startOfDay(viewEnd);

    if (schedStart > vEnd || schedEnd < vStart) {
      return { isVisible: false, startIndex: 0, durationDays: 0 };
    }

    const visibleStart = schedStart > vStart ? schedStart : vStart;
    const visibleEnd = schedEnd < vEnd ? schedEnd : vEnd;

    if (visibleStart > visibleEnd) {
      return { isVisible: false, startIndex: 0, durationDays: 0 };
    }

    const startIndex = differenceInCalendarDays(visibleStart, vStart);
    const durationDays = differenceInCalendarDays(visibleEnd, visibleStart) + 1;

    return {
      isVisible: true,
      startIndex,
      durationDays,
    };
  } catch {
    return { isVisible: false, startIndex: 0, durationDays: 0 };
  }
}
