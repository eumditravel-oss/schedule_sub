import { describe, it, expect } from 'vitest';
import { getCountryOffState } from '../src/utils/workCalendar';

describe('Manual Country Holidays & Off State Calculation', () => {
  it('should correctly classify Sunday as BOTH_OFF', () => {
    // 2026-08-09 is Sunday
    const res = getCountryOffState('2026-08-09', [], []);
    expect(res.state).toBe('BOTH_OFF');
    expect(res.krIsOff).toBe(true);
    expect(res.vnIsOff).toBe(true);
  });

  it('should classify Saturday as KR_ONLY_OFF when Vietnam works', () => {
    // 2026-08-08 is Saturday
    const res = getCountryOffState('2026-08-08', [], []);
    expect(res.state).toBe('KR_ONLY_OFF');
    expect(res.krIsOff).toBe(true);
    expect(res.vnIsOff).toBe(false);
  });

  it('should classify Saturday as BOTH_OFF when Vietnam has Saturday OFF override', () => {
    // 2026-08-08 is Saturday
    const overrides = [
      {
        worker_id: 'VN_ALL',
        override_type: 'OFF',
        start_date: '2026-08-08',
        end_date: '2026-08-08',
      },
    ];
    const res = getCountryOffState('2026-08-08', overrides as any, []);
    expect(res.state).toBe('BOTH_OFF');
    expect(res.krIsOff).toBe(true);
    expect(res.vnIsOff).toBe(true);
  });

  it('should classify weekday with Korea public holiday as KR_ONLY_OFF', () => {
    // 2026-08-14 is Friday
    const countryHolidays = [
      { country_code: 'KR', holiday_date: '2026-08-14', name_ko: '광복절 대체휴무' },
    ];
    const res = getCountryOffState('2026-08-14', [], countryHolidays as any);
    expect(res.state).toBe('KR_ONLY_OFF');
    expect(res.krHolidayName).toBe('광복절 대체휴무');
    expect(res.vnHolidayName).toBeNull();
  });

  it('should classify weekday with both KR and VN public holidays as BOTH_OFF', () => {
    // 2026-09-02 is Wednesday
    const countryHolidays = [
      { country_code: 'KR', holiday_date: '2026-09-02', name_ko: '임시공휴일' },
      { country_code: 'VN', holiday_date: '2026-09-02', name_vi: 'Ngày Quốc Khánh' },
    ];
    const res = getCountryOffState('2026-09-02', [], countryHolidays as any);
    expect(res.state).toBe('BOTH_OFF');
    expect(res.krHolidayName).toBe('임시공휴일');
    expect(res.vnHolidayName).toBe('Ngày Quốc Khánh');
  });

  it('should classify normal weekday as BOTH_WORK', () => {
    // 2026-08-10 is Monday
    const res = getCountryOffState('2026-08-10', [], []);
    expect(res.state).toBe('BOTH_WORK');
    expect(res.krIsOff).toBe(false);
    expect(res.vnIsOff).toBe(false);
  });
});
