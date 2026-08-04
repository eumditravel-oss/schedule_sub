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
import { ko as koLocale } from 'date-fns/locale/ko';
import { vi as viLocale } from 'date-fns/locale/vi';
import { GanttDateColumn } from '../types';
import { Language } from '../i18n';

export type GanttViewMode = 'THIRTY_DAYS' | 'MONTH';

/**
 * Returns current date in Korea Standard Time (Asia/Seoul) as YYYY-MM-DD
 */
export function getKoreaDateString(): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function formatDateStr(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function formatKoreanDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = parseISO(dateStr);
    return format(d, 'yyyy.MM.dd(EEE)', { locale: koLocale });
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
 * Generate columns for date range localized by Language
 */
export function generateDateColumns(
  startDate: Date,
  endDate: Date,
  referenceToday: Date = new Date(),
  lang: Language = 'ko'
): GanttDateColumn[] {
  const columns: GanttDateColumn[] = [];
  let current = startOfDay(startDate);
  const end = startOfDay(endDate);

  const todayStr = format(startOfDay(referenceToday), 'yyyy-MM-dd');
  const dayNamesKo = ['일', '월', '화', '수', '목', '금', '토'];
  const dayNamesVi = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const dayNames = lang === 'vi' ? dayNamesVi : dayNamesKo;

  const currentLocale = lang === 'vi' ? viLocale : koLocale;

  while (current <= end) {
    const dateStr = format(current, 'yyyy-MM-dd');
    const dayOfWeek = current.getDay();
    const isWknd = isWeekend(current);

    let monthStr = '';
    if (lang === 'vi') {
      monthStr = `Tháng ${format(current, 'MM')} năm ${format(current, 'yyyy')}`;
    } else {
      monthStr = format(current, 'yyyy년 MM월', { locale: currentLocale });
    }

    columns.push({
      date: new Date(current),
      dateStr,
      dayNum: current.getDate(),
      dayName: dayNames[dayOfWeek],
      isWeekend: isWknd,
      isToday: dateStr === todayStr,
      monthStr,
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
