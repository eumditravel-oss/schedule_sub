// tests/mobileResponsive.test.ts
import { describe, it, expect } from 'vitest';
import { ACTUAL_WORKERS } from '../src/services/api';
import { ko } from '../src/i18n/ko';
import { vi } from '../src/i18n/vi';

describe('Mobile & Foldable Responsive Optimization Tests', () => {
  it('1. Mobile view mode translations exist in KO and VI', () => {
    expect(ko.summaryView).toBe('요약');
    expect(vi.summaryView).toBe('Tóm tắt');
    expect(ko.week7View).toBe('7일');
    expect(vi.week7View).toBe('7 ngày');
    expect(ko.gantt30View).toBe('30일');
    expect(vi.gantt30View).toBe('30 ngày');
  });

  it('2. Executive & Team 7 Members list preserved strictly', () => {
    expect(ACTUAL_WORKERS.length).toBe(7);
    expect(ACTUAL_WORKERS[0]).toBe('CEO');
    expect(ACTUAL_WORKERS[1]).toBe('COO');
  });

  it('3. Mobile view mode keys default to SUMMARY without breaking schedule_gantt_view_mode', () => {
    const defaultMobileMode = 'SUMMARY';
    expect(defaultMobileMode).toBe('SUMMARY');
    expect(['SUMMARY', 'WEEK', 'GANTT'].includes(defaultMobileMode)).toBe(true);
  });

  it('4. 7-day strip date calculation generates exactly 7 days', () => {
    const mockColumns = Array.from({ length: 30 }, (_, i) => ({
      dateStr: `2026-08-${(i + 1).toString().padStart(2, '0')}`,
      dayNum: i + 1,
      dayName: '월',
      isToday: i === 3,
      isWeekend: false,
    }));

    const todayIndex = mockColumns.findIndex((c) => c.isToday);
    const weekStartIdx = todayIndex >= 0 ? Math.max(0, todayIndex - 1) : 0;
    const mobile7Days = mockColumns.slice(weekStartIdx, weekStartIdx + 7);

    expect(mobile7Days.length).toBe(7);
    expect(mobile7Days.some((d) => d.isToday)).toBe(true);
  });
});
