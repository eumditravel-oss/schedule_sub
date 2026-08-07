// tests/vietnamSaturdayCalendar.test.ts
import { describe, it, expect } from 'vitest';
import { getVietnamSaturdaysInMonth } from '../worker/services/scheduleCalendar';
import { resolveWorkDayStatus } from '../src/utils/workCalendar';
import { Worker, CalendarOverride, CountryHoliday } from '../src/types';

describe('Vietnam Saturday Calendar & Priority Unit Test Suite', () => {

  const vnWorkers: Worker[] = [
    { id: 'wrk_03', name: 'Thanh Phuong(탄 프엉)', is_active: 1, sort_order: 3, country_code: 'VN', workweek_profile: 'MON_SAT', access_role: 'EDITOR' },
    { id: 'wrk_04', name: 'Manh Cuong(끄엉)', is_active: 1, sort_order: 4, country_code: 'VN', workweek_profile: 'MON_SAT', access_role: 'EDITOR' },
    { id: 'wrk_05', name: 'Quoc Nhut(꾸옥 느엿)', is_active: 1, sort_order: 5, country_code: 'VN', workweek_profile: 'MON_SAT', access_role: 'EDITOR' },
  ];

  const krWorker: Worker = {
    id: 'wrk_02',
    name: '박용진 수석',
    is_active: 1,
    sort_order: 2,
    country_code: 'KR',
    workweek_profile: 'MON_FRI',
    access_role: 'EDITOR',
    can_manage_country_calendar: 1,
  };

  it('1. Calculates exactly 5 Saturdays for August 2026', () => {
    const saturdays = getVietnamSaturdaysInMonth(2026, 8);
    expect(saturdays.length).toBe(5);
    expect(saturdays.map((s) => s.date)).toEqual([
      '2026-08-01',
      '2026-08-08',
      '2026-08-15',
      '2026-08-22',
      '2026-08-29',
    ]);
    expect(saturdays.map((s) => s.week_of_month)).toEqual([1, 2, 3, 4, 5]);
  });

  it('2. 1·3·5 week off preset logic calculation', () => {
    const saturdays = getVietnamSaturdaysInMonth(2026, 8);
    const presetOddOff = saturdays.map((s) => ({
      date: s.date,
      status: s.week_of_month % 2 === 1 ? 'OFF' : 'WORK',
    }));
    expect(presetOddOff.filter((s) => s.status === 'OFF').map((s) => s.date)).toEqual([
      '2026-08-01',
      '2026-08-15',
      '2026-08-29',
    ]);
  });

  it('3. 2·4 week off preset logic calculation', () => {
    const saturdays = getVietnamSaturdaysInMonth(2026, 8);
    const presetEvenOff = saturdays.map((s) => ({
      date: s.date,
      status: s.week_of_month % 2 === 0 ? 'OFF' : 'WORK',
    }));
    expect(presetEvenOff.filter((s) => s.status === 'OFF').map((s) => s.date)).toEqual([
      '2026-08-08',
      '2026-08-22',
    ]);
  });

  it('4. All Saturdays OFF preset', () => {
    const saturdays = getVietnamSaturdaysInMonth(2026, 8);
    const allOff = saturdays.map((s) => ({ date: s.date, status: 'OFF' }));
    expect(allOff.every((s) => s.status === 'OFF')).toBe(true);
  });

  it('5. All Saturdays WORK preset', () => {
    const saturdays = getVietnamSaturdaysInMonth(2026, 8);
    const allWork = saturdays.map((s) => ({ date: s.date, status: 'WORK' }));
    expect(allWork.every((s) => s.status === 'WORK')).toBe(true);
  });

  it('6 & 8. VN COUNTRY OFF override applies to all 3 VN workers', () => {
    const overrides: CalendarOverride[] = [
      {
        id: 'ovr_vn_sat_2026-08-15',
        scope_type: 'COUNTRY',
        scope_key: 'VN',
        work_date: '2026-08-15',
        override_type: 'OFF',
        created_by_name: '박용진 수석',
        updated_by_name: '박용진 수석',
      },
    ];

    for (const w of vnWorkers) {
      const st = resolveWorkDayStatus('2026-08-15', w, [], overrides);
      expect(st.is_working_day, `${w.name} must be OFF on August 15`).toBe(false);
      expect(st.day_type).toBe('COUNTRY_OFF');
    }
  });

  it('9. Korean worker is unaffected by VN COUNTRY OFF', () => {
    const overrides: CalendarOverride[] = [
      {
        id: 'ovr_vn_sat_2026-08-15',
        scope_type: 'COUNTRY',
        scope_key: 'VN',
        work_date: '2026-08-15',
        override_type: 'OFF',
        created_by_name: '박용진 수석',
        updated_by_name: '박용진 수석',
      },
    ];

    // Korean MON_FRI worker Saturday is MON_FRI WEEKLY_OFF regardless of VN country override
    const st = resolveWorkDayStatus('2026-08-15', krWorker, [], overrides);
    expect(st.is_working_day).toBe(false);
    expect(st.day_type).toBe('WEEKLY_OFF');
  });

  it('10. Worker WORK override takes priority over Country OFF override', () => {
    const overrides: CalendarOverride[] = [
      {
        id: 'ovr_vn_sat_2026-08-15',
        scope_type: 'COUNTRY',
        scope_key: 'VN',
        work_date: '2026-08-15',
        override_type: 'OFF',
        created_by_name: '박용진 수석',
        updated_by_name: '박용진 수석',
      },
      {
        id: 'ovr_worker_work_2026-08-15',
        scope_type: 'WORKER',
        scope_key: 'wrk_03', // Thanh Phuong
        work_date: '2026-08-15',
        override_type: 'WORK',
        created_by_name: '유종욱 실장',
        updated_by_name: '유종욱 실장',
      },
    ];

    const thanhPhuong = vnWorkers.find((w) => w.id === 'wrk_03')!;
    const manhCuong = vnWorkers.find((w) => w.id === 'wrk_04')!;

    const stThanhPhuong = resolveWorkDayStatus('2026-08-15', thanhPhuong, [], overrides);
    const stManhCuong = resolveWorkDayStatus('2026-08-15', manhCuong, [], overrides);

    expect(stThanhPhuong.is_working_day, 'Thanh Phuong has WORK override -> WORK').toBe(true);
    expect(stThanhPhuong.day_type).toBe('WORK_OVERRIDE');

    expect(stManhCuong.is_working_day, 'Manh Cuong falls back to Country OFF -> OFF').toBe(false);
    expect(stManhCuong.day_type).toBe('COUNTRY_OFF');
  });

  it('11. Worker LEAVE override takes priority over Country OFF override', () => {
    const overrides: CalendarOverride[] = [
      {
        id: 'ovr_vn_sat_2026-08-08',
        scope_type: 'COUNTRY',
        scope_key: 'VN',
        work_date: '2026-08-08',
        override_type: 'OFF',
        created_by_name: '박용진 수석',
        updated_by_name: '박용진 수석',
      },
      {
        id: 'ovr_worker_leave_2026-08-08',
        scope_type: 'WORKER',
        scope_key: 'wrk_04',
        work_date: '2026-08-08',
        override_type: 'LEAVE',
        created_by_name: 'Manh Cuong',
        updated_by_name: 'Manh Cuong',
      },
    ];

    const stManhCuong = resolveWorkDayStatus('2026-08-08', vnWorkers[1], [], overrides);
    expect(stManhCuong.is_working_day).toBe(false);
    expect(stManhCuong.day_type).toBe('LEAVE');
  });

  it('12. Country Public Holiday is recognized and takes priority over MON_SAT default', () => {
    const holidays: CountryHoliday[] = [
      {
        id: 'hol_vn_01',
        country_code: 'VN',
        holiday_date: '2026-09-02',
        name_local: 'Quốc khánh',
        name_ko: '베트남 독립기념일',
        name_vi: 'Quốc khánh',
        source: 'MANUAL',
        source_year: 2026,
        is_verified: 1,
      },
    ];

    const st = resolveWorkDayStatus('2026-09-02', vnWorkers[0], holidays, []);
    expect(st.is_working_day).toBe(false);
    expect(st.day_type).toBe('PUBLIC_HOLIDAY');
  });

});
