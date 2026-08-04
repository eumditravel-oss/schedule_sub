// src/utils/progressCalculator.ts
import { Task, Worker, CountryHoliday, CalendarOverride } from '../types';
import { resolveWorkDayStatus } from './workCalendar';

export interface TaskProgressResult {
  planned_progress: number;
  actual_progress: number;
  planned_working_days: number;
  completed_working_days: number;
  passed_working_days: number;
  schedule_state: 'UPCOMING' | 'IN_PROGRESS' | 'OVERDUE' | 'COMPLETED';
}

export interface ProjectProgressResult {
  planned_progress: number;
  actual_progress: number;
  planned_working_days: number;
  completed_working_days: number;
  schedule_state: 'UPCOMING' | 'IN_PROGRESS' | 'OVERDUE' | 'COMPLETED';
}

/**
 * Get current date string (YYYY-MM-DD) in the worker's timezone
 */
export function getTodayString(countryCode?: string): string {
  const timeZone = countryCode === 'VN' ? 'Asia/Ho_Chi_Minh' : 'Asia/Seoul';
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now);
}

/**
 * Calculates planned and actual progress for a single task.
 */
export function calculateTaskProgress(
  task: {
    start_date: string;
    end_date: string;
    worker_name?: string;
    daily_statuses?: Record<string, string>;
  },
  workerObj: { id: string; name: string; country_code?: string; workweek_profile?: string },
  countryHolidays: CountryHoliday[],
  calendarOverrides: CalendarOverride[],
  todayStr?: string
): TaskProgressResult {
  const today = todayStr || getTodayString(workerObj.country_code);

  let plannedWorkingDays = 0;
  let passedWorkingDays = 0;
  let completedWorkingDays = 0;

  const start = new Date(`${task.start_date}T00:00:00`);
  const end = new Date(`${task.end_date}T00:00:00`);

  for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
    const dStr = cur.toISOString().slice(0, 10);
    const dayStatus = resolveWorkDayStatus(dStr, workerObj as any, countryHolidays, calendarOverrides);

    if (dayStatus.is_working_day) {
      plannedWorkingDays++;
      if (dStr < today) {
        passedWorkingDays++;
      }
      if (task.daily_statuses && task.daily_statuses[dStr] === 'COMPLETED') {
        completedWorkingDays++;
      }
    }
  }

  let plannedProgress = 0;
  if (today < task.start_date) {
    plannedProgress = 0;
  } else if (today > task.end_date) {
    plannedProgress = 100;
  } else {
    plannedProgress = plannedWorkingDays === 0 ? 100 : Math.min(100, Math.round((passedWorkingDays / plannedWorkingDays) * 100));
  }

  const actualProgress = plannedWorkingDays === 0 ? 100 : Math.min(100, Math.round((completedWorkingDays / plannedWorkingDays) * 100));

  let scheduleState: 'UPCOMING' | 'IN_PROGRESS' | 'OVERDUE' | 'COMPLETED' = 'IN_PROGRESS';
  if (actualProgress === 100) {
    scheduleState = 'COMPLETED';
  } else if (today < task.start_date) {
    scheduleState = 'UPCOMING';
  } else if (today > task.end_date && actualProgress < 100) {
    scheduleState = 'OVERDUE';
  } else {
    scheduleState = 'IN_PROGRESS';
  }

  return {
    planned_progress: plannedProgress,
    actual_progress: actualProgress,
    planned_working_days: plannedWorkingDays,
    completed_working_days: completedWorkingDays,
    passed_working_days: passedWorkingDays,
    schedule_state: scheduleState,
  };
}

/**
 * Calculates weighted planned and actual progress for a project.
 */
export function calculateProjectProgress(
  tasks: Task[],
  workers: Worker[],
  countryHolidays: CountryHoliday[],
  calendarOverrides: CalendarOverride[],
  todayStr?: string
): ProjectProgressResult {
  let totalPlannedWorkingDays = 0;
  let totalWeightedPlannedProgress = 0;
  let totalCompletedWorkingDays = 0;

  if (!tasks || tasks.length === 0) {
    return {
      planned_progress: 0,
      actual_progress: 0,
      planned_working_days: 0,
      completed_working_days: 0,
      schedule_state: 'UPCOMING',
    };
  }

  for (const task of tasks) {
    const workerObj = workers.find((w) => w.name === task.worker_name) || {
      id: task.worker_name,
      name: task.worker_name,
      country_code: (task.worker_name.includes('탄') || task.worker_name.includes('끄엉') || task.worker_name.includes('꾸옥') || task.worker_name.includes('Thanh') || task.worker_name.includes('Manh') || task.worker_name.includes('Quoc')) ? 'VN' : 'KR',
      workweek_profile: (task.worker_name.includes('탄') || task.worker_name.includes('끄엉') || task.worker_name.includes('꾸옥') || task.worker_name.includes('Thanh') || task.worker_name.includes('Manh') || task.worker_name.includes('Quoc')) ? 'MON_SAT' : 'MON_FRI',
    };

    const taskRes = calculateTaskProgress(task, workerObj, countryHolidays, calendarOverrides, todayStr);
    totalPlannedWorkingDays += taskRes.planned_working_days;
    totalWeightedPlannedProgress += taskRes.planned_progress * taskRes.planned_working_days;
    totalCompletedWorkingDays += taskRes.completed_working_days;
  }

  const plannedProgress = totalPlannedWorkingDays === 0 ? 0 : Math.min(100, Math.round(totalWeightedPlannedProgress / totalPlannedWorkingDays));
  const actualProgress = totalPlannedWorkingDays === 0 ? 0 : Math.min(100, Math.round((totalCompletedWorkingDays / totalPlannedWorkingDays) * 100));

  const today = todayStr || getTodayString();
  const maxEndDate = tasks.reduce((max, t) => (t.end_date > max ? t.end_date : max), '');

  let scheduleState: 'UPCOMING' | 'IN_PROGRESS' | 'OVERDUE' | 'COMPLETED' = 'IN_PROGRESS';
  if (actualProgress === 100) {
    scheduleState = 'COMPLETED';
  } else if (maxEndDate && today > maxEndDate && actualProgress < 100) {
    scheduleState = 'OVERDUE';
  } else {
    scheduleState = 'IN_PROGRESS';
  }

  return {
    planned_progress: plannedProgress,
    actual_progress: actualProgress,
    planned_working_days: totalPlannedWorkingDays,
    completed_working_days: totalCompletedWorkingDays,
    schedule_state: scheduleState,
  };
}
