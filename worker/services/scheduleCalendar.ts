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

// ── Manual Country Holidays Services (Cascade Shift, Project Conflict Check & Atomic Batch Save) ──

function getHolidayNamesFallback(countryCode: 'KR' | 'VN', nameKo?: string, nameVi?: string) {
  const fallbackKo = countryCode === 'KR' ? '한국 공휴일' : '베트남 공휴일';
  const fallbackVi = countryCode === 'VN' ? 'Ngày lễ Việt Nam' : 'Ngày lễ Hàn Quốc';
  const finalKo = nameKo && nameKo.trim() ? nameKo.trim() : fallbackKo;
  const finalVi = nameVi && nameVi.trim() ? nameVi.trim() : fallbackVi;
  const nameLocal = countryCode === 'KR' ? finalKo : finalVi;
  return { finalKo, finalVi, nameLocal };
}

export async function getManualHolidaysServer(
  db: any,
  countryCode: 'KR' | 'VN',
  year: number,
  month: number
) {
  const monthStr = String(month).padStart(2, '0');
  const startDate = `${year}-${monthStr}-01`;
  const endDate = `${year}-${monthStr}-31`;

  const res = await db
    .prepare(
      `SELECT * FROM country_holidays
       WHERE country_code = ? AND holiday_date >= ? AND holiday_date <= ? AND source = 'MANUAL'
       ORDER BY holiday_date ASC`
    )
    .bind(countryCode, startDate, endDate)
    .all();

  return res.results || [];
}

export async function calculateManualHolidayImpactServer(
  db: any,
  countryCode: 'KR' | 'VN',
  year: number,
  month: number,
  holidays: Array<{ date: string; name_ko?: string; name_vi?: string }>
) {
  const monthStr = String(month).padStart(2, '0');
  const startDate = `${year}-${monthStr}-01`;
  const endDate = `${year}-${monthStr}-31`;
  const todayStr = formatUtcDate(new Date());

  // 1. Get existing manual holidays for the month
  const existingRes = await db
    .prepare(
      `SELECT holiday_date FROM country_holidays WHERE country_code = ? AND holiday_date >= ? AND holiday_date <= ? AND source = 'MANUAL'`
    )
    .bind(countryCode, startDate, endDate)
    .all();
  const existingSet = new Set((existingRes.results || []).map((r: any) => r.holiday_date));

  // 2. Filter weekday holidays only
  const validHolidays = holidays.filter((h) => {
    const dow = getDayOfWeek(h.date);
    return dow !== 0 && dow !== 6;
  });
  const newSet = new Set(validHolidays.map((h) => h.date));

  const addedDates: string[] = (Array.from(newSet) as string[]).filter((d: string) => !existingSet.has(d)).sort();
  const removedDates: string[] = (Array.from(existingSet) as string[]).filter((d: string) => !newSet.has(d)).sort();

  // 3. Get target workers in country
  const workersRes = await db
    .prepare(`SELECT id, name, country_code, workweek_profile FROM workers WHERE is_active = 1 AND country_code = ?`)
    .bind(countryCode)
    .all();
  const targetWorkers: any[] = workersRes.results || [];

  if (targetWorkers.length === 0 || addedDates.length === 0) {
    return {
      country_code: countryCode,
      year,
      month,
      added_holidays: addedDates,
      removed_holidays: removedDates,
      affected_worker_count: targetWorkers.length,
      affected_project_count: 0,
      affected_task_count: 0,
      shifted_future_status_count: 0,
      has_range_conflict: false,
      task_impacts: [],
      status_impacts: [],
    };
  }

  // 4. Fetch ACTIVE projects & incomplete tasks (progress < 100) with project JOIN
  const tasksRes = await db
    .prepare(
      `SELECT
         t.id,
         t.project_id,
         t.worker_name,
         t.task_name,
         t.start_date,
         t.end_date,
         t.progress,
         t.schedule_revision,
         p.name AS project_name,
         p.start_date AS project_start_date,
         p.end_date AS project_end_date,
         p.status AS project_status
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       WHERE p.status = 'ACTIVE' AND (t.progress IS NULL OR t.progress < 100)
       ORDER BY t.worker_name ASC, t.start_date ASC, t.id ASC`
    )
    .all();

  const allActiveTasks: any[] = tasksRes.results || [];

  const taskImpacts: any[] = [];
  const statusImpacts: any[] = [];
  const affectedProjectIds = new Set<string>();
  let hasRangeConflict = false;

  // Group tasks by worker
  for (const worker of targetWorkers) {
    const workerTasks = allActiveTasks.filter(
      (t: any) => t.worker_name === worker.id || t.worker_name === worker.name
    );

    if (workerTasks.length === 0) continue;

    // Track cumulative shift for this worker
    let accumulatedDays = 0;

    for (const t of workerTasks) {
      if (!t.start_date || !t.end_date) continue;

      const oldStart = t.start_date;
      const oldEnd = t.end_date;

      // Count how many added holidays fall within or before this task
      let addedHolidaysForTask = 0;
      for (const ad of addedDates) {
        if (ad >= oldStart && ad <= oldEnd) {
          addedHolidaysForTask++;
        }
      }

      // Check if task needs shifting
      const isTaskInProgress = oldStart < addedDates[0] && oldEnd >= addedDates[0];
      const isTaskFuture = oldStart >= addedDates[0];
      const isAffected = addedHolidaysForTask > 0 || isTaskFuture || accumulatedDays > 0;

      if (!isAffected) continue;

      let newStart = oldStart;
      let newEnd = oldEnd;
      let shiftMode: 'EXTEND_END' | 'SHIFT_START_AND_END' = 'SHIFT_START_AND_END';

      // Original planned working days count
      let plannedWorkingDays = 0;
      let curr = oldStart;
      while (curr <= oldEnd) {
        if (await isWorkerWorkingDayServer(db, worker, curr)) {
          plannedWorkingDays++;
        }
        curr = addDays(curr, 1);
      }
      if (plannedWorkingDays === 0) plannedWorkingDays = 1;

      if (isTaskInProgress) {
        shiftMode = 'EXTEND_END';
        newStart = oldStart;
        // Extend end date by added holidays count taking new holiday into account
        let targetEnd = oldEnd;
        let added = 0;
        const totalExtend = addedHolidaysForTask + accumulatedDays;
        while (added < totalExtend) {
          targetEnd = addDays(targetEnd, 1);
          if ((await isWorkerWorkingDayServer(db, worker, targetEnd)) && !addedDates.includes(targetEnd)) {
            added++;
          }
        }
        newEnd = targetEnd;
        accumulatedDays += addedHolidaysForTask;
      } else {
        shiftMode = 'SHIFT_START_AND_END';
        const totalShiftDays = addedHolidaysForTask + accumulatedDays;
        let sAdv = 0;
        let targetStart = oldStart;
        while (sAdv < totalShiftDays) {
          targetStart = addDays(targetStart, 1);
          if ((await isWorkerWorkingDayServer(db, worker, targetStart)) && !addedDates.includes(targetStart)) {
            sAdv++;
          }
        }
        newStart = targetStart;

        let targetEnd = newStart;
        let eCount = 0;
        while (true) {
          if ((await isWorkerWorkingDayServer(db, worker, targetEnd)) && !addedDates.includes(targetEnd)) {
            eCount++;
            if (eCount === plannedWorkingDays) break;
          }
          targetEnd = addDays(targetEnd, 1);
        }
        newEnd = targetEnd;
        accumulatedDays += addedHolidaysForTask;
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
      const stRes = await db
        .prepare(`SELECT * FROM daily_status WHERE task_id = ? AND work_date >= ?`)
        .bind(t.id, todayStr)
        .all();
      const stList: any[] = stRes.results || [];

      for (const st of stList) {
        if (st.work_date >= oldStart) {
          const calendarOffset = differenceInPureCalendarDays(newStart, oldStart);
          const nWorkDate = addDays(st.work_date, calendarOffset);

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
  }

  return {
    country_code: countryCode,
    year,
    month,
    added_holidays: addedDates,
    removed_holidays: removedDates,
    affected_worker_count: targetWorkers.length,
    affected_project_count: affectedProjectIds.size,
    affected_task_count: taskImpacts.length,
    shifted_future_status_count: statusImpacts.length,
    has_range_conflict: hasRangeConflict,
    task_impacts: taskImpacts,
    status_impacts: statusImpacts,
  };
}

export async function saveManualHolidaysMonthServer(
  db: any,
  countryCode: 'KR' | 'VN',
  year: number,
  month: number,
  holidays: Array<{ date: string; name_ko?: string; name_vi?: string }>,
  editorId?: string,
  editorName: string = 'System',
  restoreShiftedTasks: boolean = false
) {
  const monthStr = String(month).padStart(2, '0');
  const startDate = `${year}-${monthStr}-01`;
  const endDate = `${year}-${monthStr}-31`;

  // 1. Calculate impact
  const impact = await calculateManualHolidayImpactServer(db, countryCode, year, month, holidays);

  // 2. Check project range conflict -> HTTP 409
  if (impact.has_range_conflict) {
    const conflictingTasks = impact.task_impacts.filter((ti: any) => ti.range_conflict);
    const err = new Error(
      `공휴일 적용 후 작업 종료일이 프로젝트 종료일을 초과합니다. (${conflictingTasks.length}개 작업 충돌)`
    ) as any;
    err.code = 'PUBLIC_HOLIDAY_PROJECT_RANGE_CONFLICT';
    err.status = 409;
    err.details = {
      country_code: countryCode,
      year,
      month,
      conflicting_tasks: conflictingTasks.map((ct: any) => ({
        country: countryCode,
        holiday_dates: impact.added_holidays,
        project_name: ct.task.project_name,
        task_name: ct.task.task_name,
        old_start_date: ct.old_start_date,
        old_end_date: ct.old_end_date,
        new_start_date: ct.new_start_date,
        new_end_date: ct.new_end_date,
        project_end_date: ct.task.project_end_date,
        exceeded_days: ct.exceeded_days,
      })),
    };
    throw err;
  }

  const batchQueries: any[] = [];
  const nowIso = new Date().toISOString();
  const eventId = `evt_hol_${countryCode}_${year}_${month}_${Date.now()}`;
  const restoreToken = `tok_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // 3. Clear existing manual holidays for the month & Insert new (UPSERT to avoid D1 UNIQUE constraint failure)
  batchQueries.push(
    db
      .prepare(`DELETE FROM country_holidays WHERE country_code = ? AND holiday_date >= ? AND holiday_date <= ? AND source = 'MANUAL'`)
      .bind(countryCode, startDate, endDate)
  );

  const validHolidays = holidays.filter((h) => {
    const dow = getDayOfWeek(h.date);
    return dow !== 0 && dow !== 6;
  });

  for (const h of validHolidays) {
    const id = `hol_manual_${countryCode}_${h.date}`;
    const { finalKo, finalVi, nameLocal } = getHolidayNamesFallback(countryCode, h.name_ko, h.name_vi);

    batchQueries.push(
      db
        .prepare(
          `INSERT INTO country_holidays
           (id, country_code, holiday_date, name_local, name_ko, name_vi, source, source_year, is_verified, created_by_name, updated_by_name)
           VALUES (?, ?, ?, ?, ?, ?, 'MANUAL', ?, 1, ?, ?)
           ON CONFLICT(country_code, holiday_date) DO UPDATE SET
             name_local = excluded.name_local,
             name_ko = excluded.name_ko,
             name_vi = excluded.name_vi,
             source = 'MANUAL',
             is_verified = 1,
             updated_by_name = excluded.updated_by_name,
             updated_at = CURRENT_TIMESTAMP`
        )
        .bind(id, countryCode, h.date, nameLocal, finalKo, finalVi, year, editorName, editorName)
    );
  }

  // 3.5 Insert Event Log Parent Record BEFORE child logs
  batchQueries.push(
    db
      .prepare(
        `INSERT INTO country_holiday_shift_events
         (id, country_code, year, month, holiday_date, action_type, event_status, affected_project_count, affected_task_count, shifted_status_count, changed_by_id, changed_by_name, created_at, restore_token)
         VALUES (?, ?, ?, ?, ?, 'HOLIDAY_ADDED', 'ACTIVE', ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        eventId,
        countryCode,
        year,
        month,
        startDate,
        impact.affected_project_count,
        impact.affected_task_count,
        impact.shifted_future_status_count,
        editorId || null,
        editorName,
        nowIso,
        restoreToken
      )
  );

  // 4. Update task schedules atomically
  for (const ti of impact.task_impacts) {
    const nextRev = (ti.task.schedule_revision || 1) + 1;
    batchQueries.push(
      db
        .prepare(
          `UPDATE tasks
           SET start_date = ?, end_date = ?, schedule_revision = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`
        )
        .bind(ti.new_start_date, ti.new_end_date, nextRev, ti.task.id)
    );

    // Log task shift
    const tLogId = `log_task_${eventId}_${ti.task.id}`;
    batchQueries.push(
      db
        .prepare(
          `INSERT INTO country_holiday_task_logs
           (id, event_id, task_id, project_id, old_start_date, old_end_date, new_start_date, new_end_date, task_revision_after_shift, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          tLogId,
          eventId,
          ti.task.id,
          ti.task.project_id,
          ti.old_start_date,
          ti.old_end_date,
          ti.new_start_date,
          ti.new_end_date,
          nextRev,
          nowIso
        )
    );
  }

  // 5. Shift daily_status records atomically
  for (const si of impact.status_impacts) {
    batchQueries.push(
      db.prepare(`DELETE FROM daily_status WHERE id = ?`).bind(si.daily_status_id)
    );
    batchQueries.push(
      db
        .prepare(
          `INSERT INTO daily_status
           (id, task_id, work_date, status, updated_by_name, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          si.daily_status_id,
          si.task_id,
          si.new_work_date,
          si.status,
          si.original_updated_by_name || editorName,
          si.original_created_at || nowIso,
          si.original_updated_at || nowIso
        )
    );

    // Log status shift
    const sLogId = `log_stat_${eventId}_${si.daily_status_id}`;
    batchQueries.push(
      db
        .prepare(
          `INSERT INTO country_holiday_status_logs
           (id, event_id, task_id, daily_status_id, old_work_date, new_work_date, status, original_updated_by_name, original_updated_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          sLogId,
          eventId,
          si.task_id,
          si.daily_status_id,
          si.old_work_date,
          si.new_work_date,
          si.status,
          si.original_updated_by_name,
          si.original_updated_at,
          nowIso
        )
    );
  }

  // 6. Handle restoration if removedHolidays and restoreShiftedTasks = true
  if (impact.removed_holidays.length > 0 && restoreShiftedTasks) {
    const recentEvtRes = await db
      .prepare(
        `SELECT * FROM country_holiday_shift_events
         WHERE country_code = ? AND year = ? AND month = ? AND action_type = 'HOLIDAY_ADDED' AND event_status = 'ACTIVE'
         ORDER BY created_at DESC LIMIT 1`
      )
      .bind(countryCode, year, month)
      .first();

    if (recentEvtRes) {
      const prevTaskLogsRes = await db
        .prepare(`SELECT * FROM country_holiday_task_logs WHERE event_id = ?`)
        .bind(recentEvtRes.id)
        .all();
      const prevTaskLogs: any[] = prevTaskLogsRes.results || [];

      for (const ptl of prevTaskLogs) {
        // Restore task start_date and end_date to old_start_date & old_end_date
        batchQueries.push(
          db
            .prepare(
              `UPDATE tasks
               SET start_date = ?, end_date = ?, schedule_revision = schedule_revision + 1, updated_at = CURRENT_TIMESTAMP
               WHERE id = ? AND start_date = ? AND end_date = ?`
            )
            .bind(ptl.old_start_date, ptl.old_end_date, ptl.task_id, ptl.new_start_date, ptl.new_end_date)
        );
      }

      batchQueries.push(
        db
          .prepare(
            `UPDATE country_holiday_shift_events
             SET event_status = 'RESTORED', restored_at = ?
             WHERE id = ?`
          )
          .bind(nowIso, recentEvtRes.id)
      );
    }
  }

  // 8. Execute atomic batch
  await db.batch(batchQueries);

  return {
    success: true,
    country_code: countryCode,
    year,
    month,
    saved_holidays_count: validHolidays.length,
    shifted_tasks_count: impact.affected_task_count,
    shifted_status_count: impact.shifted_future_status_count,
    restore_token: restoreToken,
  };
}

export async function fetchTaskAssigneesMapServer(db: any, taskIds: string[]): Promise<Record<string, any[]>> {
  const result: Record<string, any[]> = {};
  if (!taskIds || taskIds.length === 0) return result;

  const CHUNK_SIZE = 50;
  for (let i = 0; i < taskIds.length; i += CHUNK_SIZE) {
    const chunk = taskIds.slice(i, i + CHUNK_SIZE);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = await db
      .prepare(
        `SELECT ta.task_id, ta.worker_id, ta.assignment_role, ta.allocation_percent, ta.sort_order, w.name, w.country_code
         FROM task_assignees ta
         JOIN workers w ON ta.worker_id = w.id
         WHERE ta.task_id IN (${placeholders}) AND ta.deleted_at IS NULL
         ORDER BY ta.sort_order ASC, ta.assignment_role DESC`
      )
      .bind(...chunk)
      .all();

    const list: any[] = rows.results || [];
    for (const row of list) {
      if (!result[row.task_id]) {
        result[row.task_id] = [];
      }
      result[row.task_id].push({
        worker_id: row.worker_id,
        name: row.name,
        country_code: row.country_code,
        assignment_role: row.assignment_role,
        allocation_percent: Number(row.allocation_percent) || 100,
        sort_order: Number(row.sort_order) || 0,
      });
    }
  }

  return result;
}

export async function backfillTaskAssigneesAndProgressModeServer(db: any): Promise<any> {
  const tasksRes = await db.prepare(`SELECT id, worker_name, primary_worker_id, progress_mode FROM tasks`).all();
  const tasks: any[] = tasksRes.results || [];

  const workersRes = await db.prepare(`SELECT id, name, is_active, access_role FROM workers`).all();
  const workers: any[] = workersRes.results || [];

  const dailyStatusesRes = await db.prepare(`SELECT DISTINCT task_id FROM task_daily_statuses`).all();
  const tasksWithDailyStatus = new Set((dailyStatusesRes.results || []).map((r: any) => r.task_id));

  let matchedAssignees = 0;
  let unmatchedCount = 0;
  const unmatchedList: any[] = [];
  let autoTimeCount = 0;
  let statusBasedCount = 0;

  const nowIso = new Date().toISOString();
  const batchQueries: any[] = [];

  for (const t of tasks) {
    const foundWorker = workers.find((w: any) => w.id === t.worker_name || w.name === t.worker_name);
    
    if (foundWorker) {
      matchedAssignees += 1;
      const primaryId = foundWorker.id;
      const assignId = `ta_${t.id}_${primaryId}`;

      batchQueries.push(
        db
          .prepare(
            `INSERT INTO task_assignees (id, task_id, worker_id, assignment_role, allocation_percent, sort_order, created_at)
             VALUES (?, ?, ?, 'PRIMARY', 100, 0, ?)
             ON CONFLICT(task_id, worker_id) DO UPDATE SET
               assignment_role = 'PRIMARY',
               allocation_percent = 100,
               updated_at = CURRENT_TIMESTAMP`
          )
          .bind(assignId, t.id, primaryId, nowIso)
      );

      batchQueries.push(
        db
          .prepare(`UPDATE tasks SET primary_worker_id = ? WHERE id = ?`)
          .bind(primaryId, t.id)
      );
    } else {
      unmatchedCount += 1;
      unmatchedList.push({
        task_id: t.id,
        worker_name: t.worker_name,
        reason: 'WORKER_PROFILE_NOT_FOUND',
      });
    }

    const hasDaily = tasksWithDailyStatus.has(t.id);
    const targetMode = hasDaily ? 'STATUS_BASED' : 'AUTO_TIME';
    if (targetMode === 'AUTO_TIME') autoTimeCount += 1;
    else statusBasedCount += 1;

    batchQueries.push(
      db
        .prepare(`UPDATE tasks SET progress_mode = ? WHERE id = ?`)
        .bind(targetMode, t.id)
    );
  }

  if (batchQueries.length > 0) {
    const CHUNK_SIZE = 50;
    for (let i = 0; i < batchQueries.length; i += CHUNK_SIZE) {
      await db.batch(batchQueries.slice(i, i + CHUNK_SIZE));
    }
  }

  return {
    total_tasks: tasks.length,
    matched_assignees: matchedAssignees,
    unmatched_count: unmatchedCount,
    unmatched_list: unmatchedList,
    auto_time_count: autoTimeCount,
    status_based_count: statusBasedCount,
  };
}
