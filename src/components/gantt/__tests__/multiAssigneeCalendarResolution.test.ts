import { describe, it, expect } from 'vitest';
import { resolveWorkDayStatus } from '../../../utils/workCalendar';
import { resolveCalendarVisualState } from '../../../utils/calendarVisualTokens';
import { Worker, CountryHoliday, CalendarOverride } from '../../../types';

describe('multiAssigneeCalendarResolution', () => {
  const wThanh: Worker = {
    id: 'wrk_03',
    name: 'Thanh Phuong',
    country_code: 'VN',
    workweek_profile: 'MON_SAT',
    is_active: 1,
    sort_order: 1,
    access_role: 'EDITOR',
  };

  const wManh: Worker = {
    id: 'wrk_04',
    name: 'Manh Cuong',
    country_code: 'VN',
    workweek_profile: 'MON_SAT',
    is_active: 1,
    sort_order: 2,
    access_role: 'EDITOR',
  };

  const wKorean: Worker = {
    id: 'wrk_01',
    name: '유종욱 실장',
    country_code: 'KR',
    workweek_profile: 'MON_FRI',
    is_active: 1,
    sort_order: 3,
    access_role: 'EDITOR',
  };

  const holidays: CountryHoliday[] = [
    {
      id: 'hol_KR_2026-05-05',
      country_code: 'KR',
      holiday_date: '2026-05-05',
      name_local: 'Children Day',
      name_ko: '어린이날',
      name_vi: '어린이날',
      source: 'NAGER',
      source_year: 2026,
      is_verified: 1,
    },
  ];

  it('resolves 2/2 WORK for two VN workers on a Saturday (2026-05-09) when no overrides exist', () => {
    const stThanh = resolveWorkDayStatus('2026-05-09', wThanh, holidays, []);
    const stManh = resolveWorkDayStatus('2026-05-09', wManh, holidays, []);

    expect(stThanh.is_working_day).toBe(true);
    expect(stManh.is_working_day).toBe(true);

    const workingCount = [stThanh, stManh].filter((s) => s.is_working_day).length;
    expect(workingCount).toBe(2);
  });

  it('resolves 1/2 OFF when one worker has a WORKER OFF override', () => {
    const overrides: CalendarOverride[] = [
      {
        id: 'ovr_test_off',
        scope_type: 'WORKER',
        scope_key: 'wrk_03',
        work_date: '2026-05-09',
        override_type: 'OFF',
        label_ko: '수동 휴무',
      },
    ];

    const stThanh = resolveWorkDayStatus('2026-05-09', wThanh, holidays, overrides);
    const stManh = resolveWorkDayStatus('2026-05-09', wManh, holidays, overrides);

    expect(stThanh.is_working_day).toBe(false);
    expect(stThanh.day_type).toBe('MANUAL_OFF');
    expect(stManh.is_working_day).toBe(true);

    const workingCount = [stThanh, stManh].filter((s) => s.is_working_day).length;
    const offCount = 2 - workingCount;
    expect(workingCount).toBe(1);
    expect(offCount).toBe(1);
  });

  it('resolves 1/2 LEAVE when one worker has a LEAVE override', () => {
    const overrides: CalendarOverride[] = [
      {
        id: 'ovr_test_leave',
        scope_type: 'WORKER',
        scope_key: 'wrk_03',
        work_date: '2026-05-09',
        override_type: 'LEAVE',
        label_ko: '개인 휴가',
      },
    ];

    const stThanh = resolveWorkDayStatus('2026-05-09', wThanh, holidays, overrides);
    const stManh = resolveWorkDayStatus('2026-05-09', wManh, holidays, overrides);

    expect(stThanh.is_working_day).toBe(false);
    expect(stThanh.day_type).toBe('LEAVE');
    expect(stManh.is_working_day).toBe(true);
  });

  it('resolves KR_ONLY_OFF on 2026-05-05 for KR worker but WORKDAY for VN workers', () => {
    const stKR = resolveWorkDayStatus('2026-05-05', wKorean, holidays, []);
    const stVN1 = resolveWorkDayStatus('2026-05-05', wThanh, holidays, []);
    const stVN2 = resolveWorkDayStatus('2026-05-05', wManh, holidays, []);

    expect(stKR.is_working_day).toBe(false);
    expect(stKR.day_type).toBe('PUBLIC_HOLIDAY');

    expect(stVN1.is_working_day).toBe(true);
    expect(stVN1.day_type).toBe('WORKDAY');
    expect(stVN2.is_working_day).toBe(true);

    const vnWorkingCount = [stVN1, stVN2].filter((s) => s.is_working_day).length;
    expect(vnWorkingCount).toBe(2);
  });

  it('handles missing worker or missing profile without treating as MANUAL_OFF for ratio', () => {
    const incompleteWorker = { id: 'wrk_invalid', name: 'Unknown' } as any;
    const st = resolveWorkDayStatus('2026-05-09', incompleteWorker, holidays, []);

    expect(st.source).toBe('ERROR');
    expect(st.label_ko).toContain('작업자 캘린더 정보 오류');
  });
});
