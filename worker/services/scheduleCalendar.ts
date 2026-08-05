// worker/services/scheduleCalendar.ts

export interface WorkerProfile {
  id: string;
  name: string;
  country_code?: 'KR' | 'VN';
  workweek_profile?: 'MON_FRI' | 'MON_SAT';
  ui_language?: 'ko' | 'vi';
}

function parseDateParts(dateStr: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { year: y, month: m, day: d };
}

export function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  const p = parseDateParts(dateStr);
  const utc = Date.UTC(p.year, p.month - 1, p.day);
  const next = new Date(utc + days * 86400000);
  return formatUtcDate(next);
}

export function differenceInPureCalendarDays(dateStr2: string, dateStr1: string): number {
  const p2 = parseDateParts(dateStr2);
  const p1 = parseDateParts(dateStr1);
  const utc1 = Date.UTC(p1.year, p1.month - 1, p1.day);
  const utc2 = Date.UTC(p2.year, p2.month - 1, p2.day);
  return Math.round((utc2 - utc1) / 86400000);
}

export function getDayOfWeek(dateStr: string): number {
  const p = parseDateParts(dateStr);
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay(); // 0 = Sun, 1 = Mon, ... 6 = Sat
}

export async function isWorkerWorkingDayServer(
  db: any,
  worker: WorkerProfile,
  dateStr: string,
  excludeLeaveGroupId?: string
): Promise<boolean> {
  const countryCode = worker.country_code || (worker.ui_language === 'vi' ? 'VN' : 'KR');
  const isVn = countryCode === 'VN';

  // 1. Worker / Country Overrides
  let overrideQuery = `SELECT * FROM calendar_overrides WHERE work_date = ? AND ((scope_type = 'WORKER' AND scope_key IN (?, ?)) OR (scope_type = 'COUNTRY' AND scope_key = ?))`;
  let queryParams = [dateStr, worker.id, worker.name, countryCode];

  if (excludeLeaveGroupId) {
    overrideQuery += ` AND (override_group_id IS NULL OR override_group_id != ?)`;
    queryParams.push(excludeLeaveGroupId);
  }

  const overrides = await db.prepare(overrideQuery).bind(...queryParams).all();
  const ovrList: any[] = overrides.results || [];

  const workerOvr = ovrList.find((o) => o.scope_type === 'WORKER');
  const countryOvr = ovrList.find((o) => o.scope_type === 'COUNTRY');
  const effectiveOvr = workerOvr || countryOvr;

  if (effectiveOvr) {
    if (effectiveOvr.override_type === 'WORK') return true;
    if (effectiveOvr.override_type === 'OFF' || effectiveOvr.override_type === 'LEAVE') return false;
  }

  // 2. Public Holidays
  const holiday = await db
    .prepare(`SELECT id FROM country_holidays WHERE country_code = ? AND holiday_date = ?`)
    .bind(countryCode, dateStr)
    .first();
  if (holiday) return false;

  // 3. Regular Weekend Rules
  const dayOfWeek = getDayOfWeek(dateStr);
  if (dayOfWeek === 0) return false; // Sunday is non-working
  if (dayOfWeek === 6 && !isVn) return false; // Saturday is non-working for KR

  return true;
}

export async function countWorkerWorkingDaysServer(
  db: any,
  worker: WorkerProfile,
  startDate: string,
  endDate: string,
  excludeLeaveGroupId?: string
): Promise<number> {
  if (endDate < startDate) return 0;
  let count = 0;
  let curr = startDate;
  while (curr <= endDate) {
    if (await isWorkerWorkingDayServer(db, worker, curr, excludeLeaveGroupId)) {
      count++;
    }
    curr = addDays(curr, 1);
  }
  return count;
}

export async function addWorkerWorkingDaysServer(
  db: any,
  worker: WorkerProfile,
  startDate: string,
  targetWorkingDays: number,
  excludeLeaveGroupId?: string
): Promise<string> {
  if (targetWorkingDays <= 1) {
    let curr = startDate;
    while (!(await isWorkerWorkingDayServer(db, worker, curr, excludeLeaveGroupId))) {
      curr = addDays(curr, 1);
    }
    return curr;
  }

  let count = 0;
  let curr = startDate;
  while (true) {
    if (await isWorkerWorkingDayServer(db, worker, curr, excludeLeaveGroupId)) {
      count++;
      if (count === targetWorkingDays) return curr;
    }
    curr = addDays(curr, 1);
  }
}

export async function calculateLeaveImpactServer(
  db: any,
  worker: WorkerProfile,
  leaveStartDate: string,
  leaveEndDate: string,
  todayStr: string
) {
  // 1. Calculate lost working days during leave period
  let workingLeaveDays = 0;
  let curr = leaveStartDate;
  while (curr <= leaveEndDate) {
    if (await isWorkerWorkingDayServer(db, worker, curr)) {
      workingLeaveDays++;
    }
    curr = addDays(curr, 1);
  }

  // 2. Query active tasks assigned to worker that end on/after leaveStartDate and progress < 100
  const tasksRes = await db
    .prepare(
      `SELECT t.*, p.name as project_name, p.start_date as project_start_date, p.end_date as project_end_date, p.status as project_status
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       WHERE t.worker_name = ? AND p.status = 'ACTIVE' AND t.progress < 100 AND t.end_date >= ?
       ORDER BY t.start_date ASC, t.created_at ASC`
    )
    .bind(worker.name, leaveStartDate)
    .all();

  const activeTasks: any[] = tasksRes.results || [];

  const taskImpacts: Array<{
    task: any;
    old_start_date: string;
    old_end_date: string;
    new_start_date: string;
    new_end_date: string;
    shift_mode: 'EXTEND_END_ONLY' | 'SHIFT_START_AND_END';
    planned_working_days: number;
    range_conflict: boolean;
    exceeded_days: number;
  }> = [];

  const statusImpacts: Array<{
    daily_status_id: string;
    task_id: string;
    old_work_date: string;
    new_work_date: string;
    status: string;
    original_updated_by_name: string | null;
    original_created_at: string | null;
    original_updated_at: string | null;
  }> = [];

  const affectedProjectIds = new Set<string>();
  let hasRangeConflict = false;

  for (const t of activeTasks) {
    const oldStart = t.start_date;
    const oldEnd = t.end_date;
    const plannedWorkingDays = await countWorkerWorkingDaysServer(db, worker, oldStart, oldEnd);

    let newStart = oldStart;
    let newEnd = oldEnd;
    let shiftMode: 'EXTEND_END_ONLY' | 'SHIFT_START_AND_END' = 'SHIFT_START_AND_END';

    if (workingLeaveDays > 0) {
      if (oldStart < leaveStartDate && oldEnd >= leaveStartDate) {
        // In-Progress Task
        shiftMode = 'EXTEND_END_ONLY';
        newStart = oldStart;
        // Extend end date by lost working days taking into account the new LEAVE on calendar
        const newPlannedWorkingDays = plannedWorkingDays;
        // We calculate new end date on the UPDATED calendar (where leave is non-working)
        // so that working days count matches original plannedWorkingDays
        let targetEnd = oldStart;
        let count = 0;
        while (true) {
          // Check working day status EXCLUDING current leave (so leave days are non-working)
          const isWork = (await isWorkerWorkingDayServer(db, worker, targetEnd)) && (targetEnd < leaveStartDate || targetEnd > leaveEndDate);
          if (isWork) {
            count++;
            if (count === newPlannedWorkingDays) break;
          }
          targetEnd = addDays(targetEnd, 1);
        }
        newEnd = targetEnd;
      } else {
        // Future Task (start_date >= leaveStartDate)
        shiftMode = 'SHIFT_START_AND_END';
        // Shift start date forward by workingLeaveDays working days
        let targetStart = oldStart;
        let sAdv = 0;
        while (sAdv < workingLeaveDays) {
          targetStart = addDays(targetStart, 1);
          if (await isWorkerWorkingDayServer(db, worker, targetStart)) {
            sAdv++;
          }
        }
        newStart = targetStart;

        // Calculate new end date to preserve original planned working days count
        let targetEnd = newStart;
        let eCount = 0;
        while (true) {
          const isWork = (await isWorkerWorkingDayServer(db, worker, targetEnd)) && (targetEnd < leaveStartDate || targetEnd > leaveEndDate);
          if (isWork) {
            eCount++;
            if (eCount === plannedWorkingDays) break;
          }
          targetEnd = addDays(targetEnd, 1);
        }
        newEnd = targetEnd;
      }
    }

    const rangeConflict = newEnd > t.project_end_date;
    const exceededDays = rangeConflict ? differenceInPureCalendarDays(newEnd, t.project_end_date) : 0;
    if (rangeConflict) hasRangeConflict = true;

    affectedProjectIds.add(t.project_id);

    taskImpacts.push({
      task: t,
      old_start_date: oldStart,
      old_end_date: oldEnd,
      new_start_date: newStart,
      new_end_date: newEnd,
      shift_mode: shiftMode,
      planned_working_days: plannedWorkingDays,
      range_conflict: rangeConflict,
      exceeded_days: exceededDays,
    });

    // Daily Status Shift Calculation (Only future dates >= todayStr)
    const stRes = await db.prepare(`SELECT * FROM daily_status WHERE task_id = ? AND work_date >= ?`).bind(t.id, todayStr).all();
    const stList: any[] = stRes.results || [];
    for (const st of stList) {
      if (st.work_date >= leaveStartDate) {
        // Shift status date by same working days delta
        let nWorkDate = st.work_date;
        let sAdv = 0;
        while (sAdv < workingLeaveDays) {
          nWorkDate = addDays(nWorkDate, 1);
          if (await isWorkerWorkingDayServer(db, worker, nWorkDate)) {
            sAdv++;
          }
        }
        statusImpacts.push({
          daily_status_id: st.id,
          task_id: t.id,
          old_work_date: st.work_date,
          new_work_date: nWorkDate,
          status: st.status,
          original_updated_by_name: st.updated_by_name || null,
          original_created_at: st.created_at || null,
          original_updated_at: st.updated_at || null,
        });
      }
    }
  }

  return {
    working_leave_days: workingLeaveDays,
    affected_project_count: affectedProjectIds.size,
    affected_task_count: taskImpacts.length,
    shifted_future_status_count: statusImpacts.length,
    has_range_conflict: hasRangeConflict,
    task_impacts: taskImpacts,
    status_impacts: statusImpacts,
  };
}

// ── Vietnam Saturday Calendar Services ──

export function getVietnamSaturdaysInMonth(year: number, month: number): Array<{ week_of_month: number; date: string; day_num: number }> {
  const saturdays: Array<{ week_of_month: number; date: string; day_num: number }> = [];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let weekIndex = 1;

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCDay() === 6) { // Saturday
      const dateStr = formatUtcDate(d);
      saturdays.push({
        week_of_month: weekIndex,
        date: dateStr,
        day_num: day,
      });
      weekIndex++;
    }
  }
  return saturdays;
}

export async function getVietnamSaturdayCalendarServer(db: any, year: number, month: number) {
  const saturdays = getVietnamSaturdaysInMonth(year, month);
  if (saturdays.length === 0) {
    return { year, month, saturdays: [] };
  }

  const startDate = saturdays[0].date;
  const endDate = saturdays[saturdays.length - 1].date;

  // 1. Fetch public holidays for VN
  const holidaysRes = await db
    .prepare(`SELECT holiday_date, name_ko, name_vi FROM country_holidays WHERE country_code = 'VN' AND holiday_date >= ? AND holiday_date <= ?`)
    .bind(startDate, endDate)
    .all();
  const holidays: any[] = holidaysRes.results || [];
  const holidayMap = new Map<string, any>();
  for (const h of holidays) holidayMap.set(h.holiday_date, h);

  // 2. Fetch country overrides for VN
  const overridesRes = await db
    .prepare(`SELECT * FROM calendar_overrides WHERE scope_type = 'COUNTRY' AND scope_key = 'VN' AND work_date >= ? AND work_date <= ?`)
    .bind(startDate, endDate)
    .all();
  const overrides: any[] = overridesRes.results || [];
  const overrideMap = new Map<string, any>();
  for (const o of overrides) overrideMap.set(o.work_date, o);

  const resultSaturdays = saturdays.map((sat) => {
    const hol = holidayMap.get(sat.date);
    const ovr = overrideMap.get(sat.date);

    let status: 'WORK' | 'OFF' = 'WORK';
    let source: 'MON_SAT_DEFAULT' | 'COUNTRY_OVERRIDE' | 'PUBLIC_HOLIDAY' = 'MON_SAT_DEFAULT';
    let label_ko: string | null = null;
    let label_vi: string | null = null;
    let is_public_holiday = false;

    if (hol) {
      status = 'OFF';
      source = 'PUBLIC_HOLIDAY';
      label_ko = hol.name_ko || '베트남 공휴일';
      label_vi = hol.name_vi || 'Ngày lễ VN';
      is_public_holiday = true;
    } else if (ovr) {
      status = ovr.override_type === 'WORK' ? 'WORK' : 'OFF';
      source = 'COUNTRY_OVERRIDE';
      label_ko = ovr.label_ko || (status === 'OFF' ? '베트남 토요일 정기 휴무' : '베트남 토요일 근무');
      label_vi = ovr.label_vi || (status === 'OFF' ? 'Nghỉ thứ Bảy định kỳ VN' : 'Làm việc thứ Bảy VN');
    }

    return {
      week_of_month: sat.week_of_month,
      date: sat.date,
      day_num: sat.day_num,
      status,
      source,
      label_ko,
      label_vi,
      is_public_holiday,
    };
  });

  return {
    year,
    month,
    saturdays: resultSaturdays,
  };
}

export async function calculateVietnamSaturdayImpactServer(
  db: any,
  year: number,
  month: number,
  targetScope: string,
  saturdays: Array<{ date: string; status: 'WORK' | 'OFF' }>,
  targetWorkerIds?: string[]
) {
  const currentCalendar = await getVietnamSaturdayCalendarServer(db, year, month);

  // Find all saturdays set to OFF (excluding public holidays)
  const newOffDates: string[] = saturdays
    .filter((s) => s.status === 'OFF' && !currentCalendar.saturdays.find((item: any) => item.date === s.date)?.is_public_holiday)
    .map((s) => s.date);

  // Find target VN workers
  let workerQuery = `SELECT * FROM workers WHERE country_code = 'VN' AND is_active = 1`;
  const workersRes = await db.prepare(workerQuery).all();
  let vnWorkers: WorkerProfile[] = workersRes.results || [];
  if (targetWorkerIds && targetWorkerIds.length > 0) {
    vnWorkers = vnWorkers.filter((w) => targetWorkerIds.includes(w.id));
  }

  if (newOffDates.length === 0 || vnWorkers.length === 0) {
    return {
      affected_saturday_off_count: 0,
      affected_worker_count: vnWorkers.length,
      affected_project_count: 0,
      affected_task_count: 0,
      has_range_conflict: false,
      worker_impacts: [],
    };
  }

  const earliestOffDate = newOffDates[0];
  const latestOffDate = newOffDates[newOffDates.length - 1];
  const todayStr = formatUtcDate(new Date());

  const workerImpacts: any[] = [];
  const affectedProjectIds = new Set<string>();
  const affectedTaskIds = new Set<string>();
  let hasRangeConflict = false;

  for (const worker of vnWorkers) {
    // Calculate leave-style impact for the OFF period
    const impact = await calculateLeaveImpactServer(db, worker, earliestOffDate, latestOffDate, todayStr);
    if (impact.affected_task_count > 0) {
      for (const t of impact.task_impacts) {
        affectedProjectIds.add(t.task.project_id);
        affectedTaskIds.add(t.task.id);
      }
      if (impact.has_range_conflict) {
        hasRangeConflict = true;
      }
    }
    workerImpacts.push({
      worker_id: worker.id,
      worker_name: worker.name,
      affected_task_count: impact.affected_task_count,
      has_range_conflict: impact.has_range_conflict,
      task_impacts: impact.task_impacts,
    });
  }

  return {
    affected_saturday_off_count: newOffDates.length,
    affected_worker_count: vnWorkers.length,
    affected_project_count: affectedProjectIds.size,
    affected_task_count: affectedTaskIds.size,
    has_range_conflict: hasRangeConflict,
    worker_impacts: workerImpacts,
  };
}

