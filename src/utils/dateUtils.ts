// src/utils/dateUtils.ts
import { addDays, format, isWeekend, startOfDay, differenceInDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import { GanttDateColumn } from '../types';

export function formatDateStr(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function formatKoreanDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return format(d, 'yyyy.MM.dd(EEE)', { locale: ko });
  } catch {
    return dateStr;
  }
}

export function generateDateColumns(
  startDate: Date,
  endDate: Date
): GanttDateColumn[] {
  const columns: GanttDateColumn[] = [];
  let current = startOfDay(startDate);
  const end = startOfDay(endDate);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
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

export function getDaysDifference(startDateStr: string, endDateStr: string): number {
  try {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    return Math.max(1, differenceInDays(end, start) + 1);
  } catch {
    return 1;
  }
}
