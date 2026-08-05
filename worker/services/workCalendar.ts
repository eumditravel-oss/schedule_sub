// worker/services/workCalendar.ts

export type CountryCode = 'KR' | 'VN';
export type WorkweekProfile = 'MON_FRI' | 'MON_SAT';
export type DayType = 'WORKDAY' | 'WEEKLY_OFF' | 'PUBLIC_HOLIDAY' | 'MANUAL_OFF' | 'LEAVE' | 'WORK_OVERRIDE';

export interface WorkDayStatus {
  date: string;
  worker_id?: string;
  worker_name?: string;
  country_code?: CountryCode;
  day_type: DayType;
  is_working_day: boolean;
  label_ko: string;
  label_vi: string;
  source: string;
}

export function resolveWorkDayStatusServer(
  dateStr: string,
  worker: { id: string; name: string; country_code?: string; workweek_profile?: string } | null | undefined,
  countryHolidays: any[],
  overrides: any[]
): WorkDayStatus {
  if (!worker || !worker.country_code || !worker.workweek_profile) {
    return {
      date: dateStr,
      worker_id: worker?.id || '',
      worker_name: worker?.name || '',
      country_code: worker?.country_code as CountryCode,
      day_type: 'MANUAL_OFF',
      is_working_day: false,
      label_ko: '작업자 캘린더 정보 오류',
      label_vi: 'Lỗi thông tin lịch làm việc của nhân viên',
      source: 'ERROR',
    };
  }

  const countryCode = worker.country_code as CountryCode;
  const profile = worker.workweek_profile as WorkweekProfile;

  const d = new Date(`${dateStr}T00:00:00`);
  const dayOfWeek = d.getDay();

  const workerOverride = overrides.find(
    (o) => o.scope_type === 'WORKER' && o.scope_key === worker.id && o.work_date === dateStr
  );

  // 1. Worker WORK
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

  // 2. Worker LEAVE
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

  // 3. Worker OFF
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

  const countryOverride = overrides.find(
    (o) => o.scope_type === 'COUNTRY' && o.scope_key === countryCode && o.work_date === dateStr
  );

  // 4. Country WORK
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

  // 5. Country OFF
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
