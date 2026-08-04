// src/hooks/useGanttDateRange.ts
import { useState } from 'react';
import {
  GanttViewMode,
  getThirtyDaysRange,
  getMonthRange,
  generateDateColumns,
  groupColumnsByMonth,
} from '../utils/dateUtils';
import { useI18n } from './useI18n';
import { subDays, addDays, subMonths, addMonths, startOfDay, format } from 'date-fns';

const VIEW_MODE_STORAGE_KEY = 'schedule_gantt_view_mode';

export function useGanttDateRange(initialAnchorDate: Date = new Date()) {
  const { lang } = useI18n();

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

  const dateColumns = generateDateColumns(startDate, endDate, new Date(), lang);
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

  let rangeTitle = '';
  if (viewMode === 'THIRTY_DAYS') {
    rangeTitle = `${format(startDate, 'yyyy.MM.dd')} ~ ${format(endDate, 'yyyy.MM.dd')}`;
  } else {
    if (lang === 'vi') {
      rangeTitle = `Tháng ${format(anchorDate, 'MM')} năm ${format(anchorDate, 'yyyy')}`;
    } else {
      rangeTitle = `${format(anchorDate, 'yyyy년 M월')}`;
    }
  }

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
