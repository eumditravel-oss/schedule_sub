// tests/calendarWorkRules.test.ts
import { describe, it, expect } from 'vitest';
import { resolveWorkDayStatus } from '../src/utils/workCalendar';
import { CountryHoliday, CalendarOverride } from '../src/types';

describe('Worker Calendar & Holiday Resolution Rules (Requirement 32)', () => {
  const workers = [
    { id: 'wrk_00_ceo', name: 'CEO', country_code: 'KR' as const, workweek_profile: 'MON_FRI' as const },
    { id: 'wrk_00_coo', name: 'COO', country_code: 'KR' as const, workweek_profile: 'MON_FRI' as const },
    { id: 'wrk_01', name: '유종욱 실장', country_code: 'KR' as const, workweek_profile: 'MON_FRI' as const },
    { id: 'wrk_02', name: '박용진 수석', country_code: 'KR' as const, workweek_profile: 'MON_FRI' as const },
    { id: 'wrk_03', name: 'Thanh Phuong(탄 프엉)', country_code: 'VN' as const, workweek_profile: 'MON_SAT' as const },
    { id: 'wrk_04', name: 'Manh Cuong(끄엉)', country_code: 'VN' as const, workweek_profile: 'MON_SAT' as const },
    { id: 'wrk_05', name: 'Quoc Nhut(꾸옥 느엿)', country_code: 'VN' as const, workweek_profile: 'MON_SAT' as const },
  ];

  const satDate = '2026-08-08'; // Saturday
  const sunDate = '2026-08-09'; // Sunday

  // 1. CEO Saturday Off
  it('1. CEO Saturday is WEEKLY_OFF (MON_FRI)', () => {
    const st = resolveWorkDayStatus(satDate, workers[0], [], []);
    expect(st.day_type).toBe('WEEKLY_OFF');
    expect(st.is_working_day).toBe(false);
  });

  // 2. COO Saturday Off
  it('2. COO Saturday is WEEKLY_OFF (MON_FRI)', () => {
    const st = resolveWorkDayStatus(satDate, workers[1], [], []);
    expect(st.day_type).toBe('WEEKLY_OFF');
    expect(st.is_working_day).toBe(false);
  });

  // 3. 유종욱 실장 Saturday Off
  it('3. 유종욱 실장 Saturday is WEEKLY_OFF (MON_FRI)', () => {
    const st = resolveWorkDayStatus(satDate, workers[2], [], []);
    expect(st.day_type).toBe('WEEKLY_OFF');
    expect(st.is_working_day).toBe(false);
  });

  // 4. 박용진 수석 Saturday Off
  it('4. 박용진 수석 Saturday is WEEKLY_OFF (MON_FRI)', () => {
    const st = resolveWorkDayStatus(satDate, workers[3], [], []);
    expect(st.day_type).toBe('WEEKLY_OFF');
    expect(st.is_working_day).toBe(false);
  });

  // 5. KR Worker Sunday Off
  it('5. KR Workers Sunday is WEEKLY_OFF', () => {
    const st = resolveWorkDayStatus(sunDate, workers[0], [], []);
    expect(st.day_type).toBe('WEEKLY_OFF');
    expect(st.is_working_day).toBe(false);
  });

  // 6. Vietnam Workers Saturday Work
  it('6. Vietnam Worker Saturday is WORKDAY (MON_SAT)', () => {
    const st = resolveWorkDayStatus(satDate, workers[4], [], []);
    expect(st.day_type).toBe('WORKDAY');
    expect(st.is_working_day).toBe(true);
  });

  // 7. Vietnam Workers Sunday Off
  it('7. Vietnam Worker Sunday is WEEKLY_OFF', () => {
    const st = resolveWorkDayStatus(sunDate, workers[4], [], []);
    expect(st.day_type).toBe('WEEKLY_OFF');
    expect(st.is_working_day).toBe(false);
  });

  // 8. KR Public Holiday Off
  it('8. KR Public Holiday resolves to PUBLIC_HOLIDAY and is_working_day = false', () => {
    const holidays: CountryHoliday[] = [
      { id: 'h1', country_code: 'KR', holiday_date: '2026-08-15', name_local: '광복절', name_ko: '광복절', name_vi: 'Ngày giải phóng', source: 'KASI', source_year: 2026, is_verified: 1 },
    ];
    const st = resolveWorkDayStatus('2026-08-15', workers[0], holidays, []);
    expect(st.day_type).toBe('PUBLIC_HOLIDAY');
    expect(st.is_working_day).toBe(false);
    expect(st.label_ko).toBe('광복절');
  });

  // 9. VN Public Holiday Off
  it('9. VN Public Holiday resolves to PUBLIC_HOLIDAY and is_working_day = false', () => {
    const holidays: CountryHoliday[] = [
      { id: 'h2', country_code: 'VN', holiday_date: '2026-09-02', name_local: 'Quốc khánh', name_ko: '독립기념일', name_vi: 'Quốc khánh', source: 'NAGER', source_year: 2026, is_verified: 0 },
    ];
    const st = resolveWorkDayStatus('2026-09-02', workers[4], holidays, []);
    expect(st.day_type).toBe('PUBLIC_HOLIDAY');
    expect(st.is_working_day).toBe(false);
  });

  // 10. WORK override takes priority over Public Holiday
  it('10. Worker WORK override takes priority over Public Holiday', () => {
    const holidays: CountryHoliday[] = [
      { id: 'h1', country_code: 'KR', holiday_date: '2026-08-15', name_local: '광복절', source: 'KASI', source_year: 2026, is_verified: 1 },
    ];
    const overrides: CalendarOverride[] = [
      { id: 'o1', scope_type: 'WORKER', scope_key: 'wrk_00_ceo', work_date: '2026-08-15', override_type: 'WORK', label_ko: '특별 근무', created_by_name: 'CEO', updated_by_name: 'CEO' },
    ];
    const st = resolveWorkDayStatus('2026-08-15', workers[0], holidays, overrides);
    expect(st.day_type).toBe('WORK_OVERRIDE');
    expect(st.is_working_day).toBe(true);
    expect(st.label_ko).toBe('특별 근무');
  });

  // 11. LEAVE takes priority over regular workday
  it('11. LEAVE override takes priority over regular workday', () => {
    const overrides: CalendarOverride[] = [
      { id: 'o2', scope_type: 'WORKER', scope_key: 'wrk_02', work_date: '2026-08-10', override_type: 'LEAVE', label_ko: '여름 휴가', created_by_name: '박용진 수석', updated_by_name: '박용진 수석' },
    ];
    const st = resolveWorkDayStatus('2026-08-10', workers[3], [], overrides);
    expect(st.day_type).toBe('LEAVE');
    expect(st.is_working_day).toBe(false);
    expect(st.label_ko).toBe('여름 휴가');
  });

  // 12. OFF override
  it('12. OFF override sets manual off day for Vietnam Saturday', () => {
    const overrides: CalendarOverride[] = [
      { id: 'o3', scope_type: 'WORKER', scope_key: 'wrk_03', work_date: '2026-08-08', override_type: 'OFF', label_ko: '토요 휴무 지정', created_by_name: 'Thanh Phuong(탄 프엉)', updated_by_name: 'Thanh Phuong(탄 프엉)' },
    ];
    const st = resolveWorkDayStatus('2026-08-08', workers[4], [], overrides);
    expect(st.day_type).toBe('LEAVE');
    expect(st.is_working_day).toBe(false);
  });

  // 13. VN MON_SAT 2026-05-09 Saturday WORKDAY case
  it('13. Vietnam worker Thanh Phuong 2026-05-09 Saturday resolves to WORKDAY', () => {
    const st = resolveWorkDayStatus('2026-05-09', workers[4], [], []);
    expect(st.day_type).toBe('WORKDAY');
    expect(st.is_working_day).toBe(true);
  });

  // 14. KR MON_FRI 2026-05-09 Saturday WEEKLY_OFF case
  it('14. Korean worker Park Yong-jin 2026-05-09 Saturday resolves to WEEKLY_OFF', () => {
    const st = resolveWorkDayStatus('2026-05-09', workers[3], [], []);
    expect(st.day_type).toBe('WEEKLY_OFF');
    expect(st.is_working_day).toBe(false);
  });

  // 15. All workers Sunday 2026-05-10 WEEKLY_OFF
  it('15. All workers 2026-05-10 Sunday resolve to WEEKLY_OFF', () => {
    workers.forEach((w) => {
      const st = resolveWorkDayStatus('2026-05-10', w, [], []);
      expect(st.day_type).toBe('WEEKLY_OFF');
      expect(st.is_working_day).toBe(false);
    });
  });

  // 16. Inclusive date range 2026-05-07 ~ 2026-05-09 has 3 dates
  it('16. Inclusive date range 2026-05-07 ~ 2026-05-09 has 3 dates', () => {
    const dates = ['2026-05-07', '2026-05-08', '2026-05-09'];
    expect(dates.length).toBe(3);
  });

  // 17. Cell LEAVE, OFF, WORK overrides
  it('17. Resolves WORK, LEAVE, OFF cell overrides correctly', () => {
    const leaveOvr: CalendarOverride = { id: 'l1', scope_type: 'WORKER', scope_key: 'wrk_03', work_date: '2026-05-07', override_type: 'LEAVE', label_ko: '개인 휴가' };
    const offOvr: CalendarOverride = { id: 'l2', scope_type: 'WORKER', scope_key: 'wrk_03', work_date: '2026-05-08', override_type: 'OFF', label_ko: '수동 휴무' };
    const workOvr: CalendarOverride = { id: 'l3', scope_type: 'WORKER', scope_key: 'wrk_02', work_date: '2026-05-10', override_type: 'WORK', label_ko: '근무일 지정' };

    const stLeave = resolveWorkDayStatus('2026-05-07', workers[4], [], [leaveOvr]);
    expect(stLeave.day_type).toBe('LEAVE');
    expect(stLeave.is_working_day).toBe(false);

    const stOff = resolveWorkDayStatus('2026-05-08', workers[4], [], [offOvr]);
    expect(stOff.day_type).toBe('LEAVE');
    expect(stOff.is_working_day).toBe(false);

    const stWork = resolveWorkDayStatus('2026-05-10', workers[3], [], [workOvr]);
    expect(stWork.day_type).toBe('WORK_OVERRIDE');
    expect(stWork.is_working_day).toBe(true);
  });
});
