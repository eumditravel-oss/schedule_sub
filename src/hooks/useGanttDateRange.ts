// src/hooks/useGanttDateRange.ts
import { useState, useEffect } from 'react';
import {
  GanttViewMode,
  getThirtyDaysRange,
  getMonthRange,
  generateDateColumns,
  groupColumnsByMonth,
  formatDateStr,
} from '../utils/dateUtils';
import { addDays, subDays, addMonths, subMonths, startOfDay, format } from 'date-fns';
import { ko } from 'date-fns/locale';

const VIEW_MODE_STORAGE_KEY = 'schedule_gantt_view_mode';

export function useGanttDateRange(initialAnchorDate: Date = new Date()) {
  const [viewMode, setViewModeState] = useState<GanttViewMode>(() => {
    try {
      const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (saved === 'MONTH' || saved === 'THIRTY_DAYS') return saved;
    } catch {}
    return 'THIRTY_DAYS';
  });

  const [anchorDate, setAnchorDate] = useState<Date>(startOfDay(initialAnchorDate));

  const changeViewMode = (mode: GanttViewMode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {}
  };

  const { startDate, endDate } =
    viewMode === 'THIRTY_DAYS'
      ? getThirtyDaysRange(anchorDate)
      : getMonthRange(anchorDate);

  const dateColumns = generateDateColumns(startDate, endDate);
  const monthGroups = groupColumnsByMonth(dateColumns);

  const goPrevious = () => {
    if (viewMode === 'THIRTY_DAYS') {
      setAnchorDate((prev) => subDays(prev, 30));
    } else {
      setAnchorDate((prev) => subMonths(prev, 1));
    }
  };

  const goNext = () => {
    if (viewMode === 'THIRTY_DAYS') {
      setAnchorDate((prev) => addDays(prev, 30));
    } else {
      setAnchorDate((prev) => addMonths(prev, 1));
    }
  };

  const goToday = () => {
    setAnchorDate(startOfDay(new Date()));
  };

  // Title string formatting
  const rangeTitle =
    viewMode === 'THIRTY_DAYS'
      ? `${format(startDate, 'yyyy.MM.dd')} ~ ${format(endDate, 'yyyy.MM.dd')}`
      : `${format(anchorDate, 'yyyy년 M월', { locale: ko })}`;

  return {
    viewMode,
    anchorDate,
    startDate,
    endDate,
    dateColumns,
    monthGroups,
    rangeTitle,
    changeViewMode,
    goPrevious,
    goNext,
    goToday,
  };
}
