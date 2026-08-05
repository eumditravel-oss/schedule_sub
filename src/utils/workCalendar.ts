// src/utils/workCalendar.ts
import { Worker, CountryHoliday, CalendarOverride, WorkDayStatus, CountryCode, WorkweekProfile } from '../types';

/**
 * Resolves the work status of a specific date for a specific worker.
 * Follows the 8-level priority rule:
 * 1. Worker WORK override
 * 2. Worker LEAVE override
 * 3. Worker OFF override
 * 4. Country WORK override
 * 5. Country OFF override
 * 6. Country Public Holiday
 * 7. Worker Weekly Off
 * 8. Regular Workday
 */
export function resolveWorkDayStatus(
  dateStr: string,
  worker: { id: string; name: string; country_code?: CountryCode; workweek_profile?: WorkweekProfile } | null | undefined,
  countryHolidays: CountryHoliday[],
  overrides: CalendarOverride[]
): WorkDayStatus {
  if (!worker || !worker.country_code || !worker.workweek_profile) {
    return {
      date: dateStr,
      worker_id: worker?.id || '',
      worker_name: worker?.name || '',
      country_code: worker?.country_code,
      day_type: 'MANUAL_OFF',
      is_working_day: false,
      label_ko: '작업자 캘린더 정보 오류',
      label_vi: 'Lỗi thông tin lịch làm việc của nhân viên',
      source: 'ERROR',
    };
  }

  const countryCode = worker.country_code;
  const profile = worker.workweek_profile;

  // Parse Day of Week (0 = Sun, 1 = Mon, ..., 6 = Sat)
  const d = new Date(`${dateStr}T00:00:00`);
  const dayOfWeek = d.getDay();

  // Find worker-specific overrides for this date
  const workerOverride = overrides.find(
    (o) => o.scope_type === 'WORKER' && o.scope_key === worker.id && o.work_date === dateStr
  );

  // 1. Worker WORK override
  if (workerOverride && workerOverride.override_type === 'WORK') {
    return {
      date: dateStr,
      worker_id: worker.id,
      worker_name: worker.name,
      country_code: countryCode,
      day_type: 'WORK_OVERRIDE',
      is_working_day: true,
      label_ko: workerOverride.label_ko || '근무일 지정',
      label_vi: workerOverride.label_vi || 'Chỉ định ngày làm việc',
      source: 'MANUAL',
    };
  }

  // 2. Worker LEAVE override
  if (workerOverride && workerOverride.override_type === 'LEAVE') {
    return {
      date: dateStr,
      worker_id: worker.id,
      worker_name: worker.name,
      country_code: countryCode,
      day_type: 'LEAVE',
      is_working_day: false,
      label_ko: workerOverride.label_ko || '개인 휴가',
      label_vi: workerOverride.label_vi || 'Nghỉ phép',
      source: 'MANUAL',
    };
  }

  // 3. Worker OFF override
  if (workerOverride && workerOverride.override_type === 'OFF') {
    return {
      date: dateStr,
      worker_id: worker.id,
      worker_name: worker.name,
      country_code: countryCode,
      day_type: 'MANUAL_OFF',
      is_working_day: false,
      label_ko: workerOverride.label_ko || '수동 휴무',
      label_vi: workerOverride.label_vi || 'Ngày nghỉ thủ công',
      source: 'MANUAL',
    };
  }

  // Find country-wide overrides for this date
  const countryOverride = overrides.find(
    (o) => o.scope_type === 'COUNTRY' && o.scope_key === countryCode && o.work_date === dateStr
  );

  // 4. Country WORK override
  if (countryOverride && countryOverride.override_type === 'WORK') {
    return {
      date: dateStr,
      worker_id: worker.id,
      worker_name: worker.name,
      country_code: countryCode,
      day_type: 'WORK_OVERRIDE',
      is_working_day: true,
      label_ko: countryOverride.label_ko || '대체 근무일',
      label_vi: countryOverride.label_vi || 'Ngày làm việc bù',
      source: 'MANUAL',
    };
  }

  // 5. Country OFF override
  if (countryOverride && countryOverride.override_type === 'OFF') {
    return {
      date: dateStr,
      worker_id: worker.id,
      worker_name: worker.name,
      country_code: countryCode,
      day_type: 'MANUAL_OFF',
      is_working_day: false,
      label_ko: countryOverride.label_ko || '공식 임시 휴무',
      label_vi: countryOverride.label_vi || 'Nghỉ lễ bổ sung',
      source: 'MANUAL',
    };
  }

  // 6. Country Public Holiday
  const holiday = countryHolidays.find(
    (h) => h.country_code === countryCode && h.holiday_date === dateStr
  );
  if (holiday) {
    return {
      date: dateStr,
      worker_id: worker.id,
      worker_name: worker.name,
      country_code: countryCode,
      day_type: 'PUBLIC_HOLIDAY',
      is_working_day: false,
      label_ko: holiday.name_ko || holiday.name_local,
      label_vi: holiday.name_vi || holiday.name_local,
      source: holiday.source,
    };
  }

  // 7. Worker Weekly Off
  const isWeeklyOff = profile === 'MON_SAT' ? dayOfWeek === 0 : dayOfWeek === 0 || dayOfWeek === 6;
  if (isWeeklyOff) {
    const isSat = dayOfWeek === 6;
    return {
      date: dateStr,
      worker_id: worker.id,
      worker_name: worker.name,
      country_code: countryCode,
      day_type: 'WEEKLY_OFF',
      is_working_day: false,
      label_ko: isSat ? '토요 휴무' : '일요 휴무',
      label_vi: isSat ? 'Nghỉ Thứ Bảy' : 'Nghỉ Chủ Nhật',
      source: 'WEEKLY',
    };
  }

  // 8. Regular Workday
  return {
    date: dateStr,
    worker_id: worker.id,
    worker_name: worker.name,
    country_code: countryCode,
    day_type: 'WORKDAY',
    is_working_day: true,
    label_ko: '근무일',
    label_vi: 'Ngày làm việc',
    source: 'WEEKLY',
  };
}

export function calculateTaskWorkdayBreakdown(
  worker: { id: string; name: string; country_code?: CountryCode; workweek_profile?: WorkweekProfile } | null | undefined,
  startDate: string,
  endDate: string,
  countryHolidays: CountryHoliday[],
  overrides: CalendarOverride[]
) {
  if (!worker || !worker.country_code || !worker.workweek_profile || !startDate || !endDate) {
    return {
      calendar_span_days: 0,
      planned_working_days: 0,
      excluded_non_working_days: 0,
      excluded_weekly_off_days: 0,
      excluded_public_holiday_days: 0,
      excluded_leave_days: 0,
      excluded_manual_off_days: 0,
      included_work_override_days: 0,
      excluded_dates_detail: [],
      has_profile_error: true,
    };
  }

  let curr = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  if (isNaN(curr.getTime()) || isNaN(end.getTime()) || curr > end) {
    return {
      calendar_span_days: 0,
      planned_working_days: 0,
      excluded_non_working_days: 0,
      excluded_weekly_off_days: 0,
      excluded_public_holiday_days: 0,
      excluded_leave_days: 0,
      excluded_manual_off_days: 0,
      included_work_override_days: 0,
      excluded_dates_detail: [],
      has_profile_error: false,
    };
  }

  let calendar_span_days = 0;
  let planned_working_days = 0;
  let excluded_weekly_off_days = 0;
  let excluded_public_holiday_days = 0;
  let excluded_leave_days = 0;
  let excluded_manual_off_days = 0;
  let included_work_override_days = 0;

  const excluded_dates_detail: Array<{ date: string; type: string; label_ko: string; label_vi: string }> = [];

  while (curr <= end) {
    const yyyy = curr.getFullYear();
    const mm = String(curr.getMonth() + 1).padStart(2, '0');
    const dd = String(curr.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    calendar_span_days++;

    const status = resolveWorkDayStatus(dateStr, worker, countryHolidays, overrides);

    if (status.is_working_day) {
      planned_working_days++;
      if (status.day_type === 'WORK_OVERRIDE') {
        included_work_override_days++;
      }
    } else {
      if (status.day_type === 'WEEKLY_OFF') {
        excluded_weekly_off_days++;
      } else if (status.day_type === 'PUBLIC_HOLIDAY') {
        excluded_public_holiday_days++;
      } else if (status.day_type === 'LEAVE') {
        excluded_leave_days++;
      } else if (status.day_type === 'MANUAL_OFF') {
        excluded_manual_off_days++;
      }

      excluded_dates_detail.push({
        date: dateStr,
        type: status.day_type,
        label_ko: status.label_ko,
        label_vi: status.label_vi,
      });
    }

    curr.setDate(curr.getDate() + 1);
  }

  const excluded_non_working_days = calendar_span_days - planned_working_days;

  return {
    calendar_span_days,
    planned_working_days,
    excluded_non_working_days,
    excluded_weekly_off_days,
    excluded_public_holiday_days,
    excluded_leave_days,
    excluded_manual_off_days,
    included_work_override_days,
    excluded_dates_detail,
    has_profile_error: false,
  };
}
