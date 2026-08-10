// src/utils/__tests__/printVisualTokens.test.ts
import { describe, it, expect } from 'vitest';
import {
  getPrintCalendarVisualStyle,
  getPrintGanttBarStyle,
  getPrintStatusBadgeStyle,
  resolvePrintCalendarVisualState,
} from '../printVisualTokens';
import { WorkDayStatus, CountryHoliday } from '../../types';

describe('printVisualTokens Suite', () => {
  it('should return standard color visual token in color mode', () => {
    const krOff = getPrintCalendarVisualStyle('KR_ONLY_OFF', 'color');
    expect(krOff.visualState).toBe('KR_ONLY_OFF');
    expect(krOff.baseColor).toBe('#FFF7ED');
    expect(krOff.hatch.enabled).toBe(true);
  });

  it('should return grayscale low opacity visual token in mono mode', () => {
    const bothOffMono = getPrintCalendarVisualStyle('BOTH_OFF', 'mono');
    expect(bothOffMono.visualState).toBe('BOTH_OFF');
    expect(bothOffMono.baseColor).toBe('#F1F5F9');
    expect(bothOffMono.hatch.alpha).toBeLessThanOrEqual(0.2);
    expect(bothOffMono.textClass).toContain('slate-900');
  });

  it('should return correct Gantt bar styles for color and mono modes', () => {
    const completedColor = getPrintGanttBarStyle('COMPLETED', 'color');
    expect(completedColor.backgroundColor).toBe('#10B981'); // Emerald green requirement

    const completedMono = getPrintGanttBarStyle('COMPLETED', 'mono');
    expect(completedMono.backgroundColor).toBe('#1E293B');

    const blockedMono = getPrintGanttBarStyle('BLOCKED', 'mono');
    expect(blockedMono.borderStyle).toBe('dashed');
  });

  it('should return appropriate status badges for KO and VI languages', () => {
    const badgeKo = getPrintStatusBadgeStyle('COMPLETED', 'color', 'ko');
    expect(badgeKo.label).toBe('완료');

    const badgeVi = getPrintStatusBadgeStyle('COMPLETED', 'color', 'vi');
    expect(badgeVi.label).toBe('Hoàn thành');
  });

  it('should resolve Task Row PERSONAL_LEAVE and WORK_OVERRIDE 5/5 semantic match', () => {
    const leaveDayStatus: WorkDayStatus = {
      date: '2026-08-15',
      worker_id: 'wrk_1',
      worker_name: 'Minh',
      day_type: 'LEAVE',
      is_working_day: false,
      label_ko: '개인 휴가',
      label_vi: 'Nghỉ phép',
      source: 'MANUAL',
    };

    const leaveToken = resolvePrintCalendarVisualState('2026-08-15', [], [], [], 'color', leaveDayStatus, 'VN');
    expect(leaveToken.visualState).toBe('PERSONAL_LEAVE');

    const workOverrideStatus: WorkDayStatus = {
      date: '2026-08-16',
      worker_id: 'wrk_1',
      worker_name: 'Minh',
      day_type: 'WORK_OVERRIDE',
      is_working_day: true,
      label_ko: '근무일 지정',
      label_vi: 'Chỉ định ngày làm việc',
      source: 'MANUAL',
    };

    const workOverrideToken = resolvePrintCalendarVisualState('2026-08-16', [], [], [], 'color', workOverrideStatus, 'VN');
    expect(workOverrideToken.visualState).toBe('WORK_OVERRIDE');
  });

  it('should correctly resolve VN_ONLY_OFF for Vietnam National Day 2026-09-02', () => {
    const vnHolidays: CountryHoliday[] = [
      {
        id: 'hol_VN_2026-09-02',
        country_code: 'VN',
        holiday_date: '2026-09-02',
        name_local: 'Quốc khánh',
        name_ko: 'National Day',
        name_vi: 'Quốc khánh',
        source: 'NAGER',
        source_year: 2026,
        is_verified: 1,
      },
    ];

    const token = resolvePrintCalendarVisualState('2026-09-02', [], vnHolidays, [], 'color');
    expect(token.visualState).toBe('VN_ONLY_OFF');
  });
});
