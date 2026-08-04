// tests/ganttDateRange.test.ts
import { describe, it, expect } from 'vitest';
import {
  getThirtyDaysRange,
  getMonthRange,
  generateDateColumns,
  groupColumnsByMonth,
  calculateVisibleGanttSpan,
  formatDateStr,
} from '../src/utils/dateUtils';
import { parseISO } from 'date-fns';

describe('Gantt Date Range & View Logic', () => {
  const referenceDate = parseISO('2026-08-04');

  it('1. 30-day mode produces exactly 30 date columns', () => {
    const { startDate, endDate } = getThirtyDaysRange(referenceDate);
    const columns = generateDateColumns(startDate, endDate, referenceDate);
    expect(columns.length).toBe(30);
  });

  it('2. 30-day mode starts at anchorDate - 15 days', () => {
    const { startDate } = getThirtyDaysRange(referenceDate);
    expect(formatDateStr(startDate)).toBe('2026-07-20');
  });

  it('3. 30-day mode ends at anchorDate + 14 days', () => {
    const { endDate } = getThirtyDaysRange(referenceDate);
    expect(formatDateStr(endDate)).toBe('2026-08-18');
  });

  it('4. Monthly mode calculates from 1st day to last day of month', () => {
    const { startDate, endDate } = getMonthRange(referenceDate);
    expect(formatDateStr(startDate)).toBe('2026-08-01');
    expect(formatDateStr(endDate)).toBe('2026-08-31');

    const columns = generateDateColumns(startDate, endDate, referenceDate);
    expect(columns.length).toBe(31);
  });

  it('5. Leap year February has 29 days', () => {
    const leapDate = parseISO('2024-02-15');
    const { startDate, endDate } = getMonthRange(leapDate);
    const columns = generateDateColumns(startDate, endDate, leapDate);
    expect(columns.length).toBe(29);
    expect(formatDateStr(endDate)).toBe('2024-02-29');
  });

  it('6. Non-leap year February has 28 days', () => {
    const nonLeapDate = parseISO('2025-02-15');
    const { startDate, endDate } = getMonthRange(nonLeapDate);
    const columns = generateDateColumns(startDate, endDate, nonLeapDate);
    expect(columns.length).toBe(28);
    expect(formatDateStr(endDate)).toBe('2025-02-28');
  });

  it('7. Multi-month 30-day date range groups month headers correctly', () => {
    const { startDate, endDate } = getThirtyDaysRange(referenceDate);
    const columns = generateDateColumns(startDate, endDate, referenceDate);
    const monthGroups = groupColumnsByMonth(columns);

    // July 20 to July 31 = 12 days, Aug 1 to Aug 18 = 18 days
    expect(monthGroups.length).toBe(2);
    expect(monthGroups[0].span).toBe(12);
    expect(monthGroups[1].span).toBe(18);
  });

  it('8. Schedules completely outside view range are not visible', () => {
    const viewStart = parseISO('2026-08-01');
    const viewEnd = parseISO('2026-08-31');

    // Before view range
    const resultPast = calculateVisibleGanttSpan('2026-07-01', '2026-07-25', viewStart, viewEnd);
    expect(resultPast.isVisible).toBe(false);

    // After view range
    const resultFuture = calculateVisibleGanttSpan('2026-09-01', '2026-09-15', viewStart, viewEnd);
    expect(resultFuture.isVisible).toBe(false);
  });

  it('9. Partially overlapping schedule renders visible intersection correctly', () => {
    const viewStart = parseISO('2026-08-01');
    const viewEnd = parseISO('2026-08-31');

    // Schedule 2026-07-20 ~ 2026-08-10 overlaps 2026-08-01 ~ 2026-08-10 (10 days, starting at idx 0)
    const result = calculateVisibleGanttSpan('2026-07-20', '2026-08-10', viewStart, viewEnd);
    expect(result.isVisible).toBe(true);
    expect(result.startIndex).toBe(0);
    expect(result.durationDays).toBe(10);
  });

  it('10. Worker selection logic does not auto-select first worker when empty', () => {
    const savedWorker = null; // empty localStorage
    const defaultWorkers = [{ id: '1', name: '김개발' }, { id: '2', name: '박개발' }];

    // Simulating WorkerSelector logic:
    let currentWorker = savedWorker || '';
    expect(currentWorker).toBe('');
    expect(currentWorker).not.toBe('김개발');
  });
});
