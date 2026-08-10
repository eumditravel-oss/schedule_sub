// src/utils/progressCalculator.ts
import { Task, Project, Worker, CountryHoliday, CalendarOverride, ScheduleState, DailyStatusType } from '../types';
import { resolveWorkDayStatus } from './workCalendar';

export function getTodayStrForWorker(worker?: Worker | null): string {
  const timeZone = worker?.country_code === 'VN' ? 'Asia/Ho_Chi_Minh' : 'Asia/Seoul';
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return formatter.format(now); // YYYY-MM-DD format
}

export interface TaskProgressMetrics {
  planned_working_days: number;
  completed_working_days: number;
  planned_progress: number;
  actual_progress: number;
  progress_gap: number;
  schedule_state: ScheduleState;
}

export function calculateTaskProgress(
  task: Task,
  worker?: Worker | null,
  holidays: CountryHoliday[] = [],
  overrides: CalendarOverride[] = [],
  projectStatus: 'ACTIVE' | 'COMPLETED' = 'ACTIVE',
  referenceTodayStr?: string
): TaskProgressMetrics {
  if (task.schedule_status === 'UNSCHEDULED' || !task.start_date || !task.end_date) {
    return {
      planned_working_days: 0,
      completed_working_days: 0,
      planned_progress: 0,
      actual_progress: 0,
      progress_gap: 0,
      schedule_state: 'UPCOMING',
    };
  }
  const todayStr = referenceTodayStr || getTodayStrForWorker(worker);
  const workerObj = worker;

  const dates: string[] = [];
  let curDate = new Date(`${task.start_date}T00:00:00Z`);
  const endDateObj = new Date(`${task.end_date}T00:00:00Z`);

  while (curDate <= endDateObj) {
    dates.push(curDate.toISOString().slice(0, 10));
    curDate.setUTCDate(curDate.getUTCDate() + 1);
  }

  let planned_working_days = 0;
  let elapsed_planned_working_days = 0;
  let completed_working_days = 0;

  for (const dateStr of dates) {
    const dayStatus = resolveWorkDayStatus(dateStr, workerObj as any, holidays, overrides);

    if (dayStatus.is_working_day) {
      planned_working_days += 1;

      if (dateStr < todayStr) {
        elapsed_planned_working_days += 1;
      }

      const statusVal = task.daily_statuses?.[dateStr];
      if (statusVal === 'COMPLETED') {
        completed_working_days += 1;
      }
    }
  }

  let planned_progress = 0;
  if (todayStr < task.start_date) {
    planned_progress = 0;
  } else if (todayStr > task.end_date) {
    planned_progress = 100;
  } else {
    planned_progress = planned_working_days > 0
      ? Math.min(100, Math.round((elapsed_planned_working_days / planned_working_days) * 100))
      : 0;
  }

  let actual_progress = 0;
  if (planned_working_days > 0) {
    actual_progress = Math.min(100, Math.round((completed_working_days / planned_working_days) * 100));
  } else if (dates.length > 0) {
    actual_progress = 0;
  }

  const progress_gap = actual_progress - planned_progress;

  let schedule_state: ScheduleState = 'UPCOMING';
  if (actual_progress === 100 || projectStatus === 'COMPLETED') {
    schedule_state = 'COMPLETED';
  } else if (todayStr > task.end_date && actual_progress < 100 && projectStatus === 'ACTIVE') {
    schedule_state = 'DELAYED';
  } else if (todayStr < task.start_date) {
    schedule_state = 'UPCOMING';
  } else {
    schedule_state = 'IN_PROGRESS';
  }

  return {
    planned_working_days,
    completed_working_days,
    planned_progress,
    actual_progress,
    progress_gap,
    schedule_state,
  };
}

export interface ProjectProgressMetrics {
  planned_working_days: number;
  completed_working_days: number;
  planned_progress: number;
  actual_progress: number;
  progress_gap: number;
  schedule_state: ScheduleState;
}

export function calculateProjectProgress(
  project: Project,
  tasks: Task[],
  workers: Worker[] = [],
  holidays: CountryHoliday[] = [],
  overrides: CalendarOverride[] = [],
  referenceTodayStr?: string
): ProjectProgressMetrics {
  if (project.status === 'COMPLETED') {
    return {
      planned_working_days: 0,
      completed_working_days: 0,
      planned_progress: 100,
      actual_progress: 100,
      progress_gap: 0,
      schedule_state: 'COMPLETED',
    };
  }

  if (!tasks || tasks.length === 0) {
    const todayStr = referenceTodayStr || getTodayStrForWorker(null);
    let state: ScheduleState = 'UPCOMING';
    if ((project.status as string) === 'COMPLETED') {
      state = 'COMPLETED';
    } else if (todayStr > project.end_date) {
      state = 'DELAYED';
    } else if (todayStr >= project.start_date) {
      state = 'IN_PROGRESS';
    }
    return {
      planned_working_days: 0,
      completed_working_days: 0,
      planned_progress: 0,
      actual_progress: 0,
      progress_gap: 0,
      schedule_state: state,
    };
  }

  let total_planned_days = 0;
  let total_completed_days = 0;
  let weighted_planned_progress_sum = 0;

  for (const tItem of tasks) {
    const workerObj = workers.find((w) => w.id === tItem.worker_name || w.name === tItem.worker_name);
    const metrics = calculateTaskProgress(tItem, workerObj, holidays, overrides, project.status, referenceTodayStr);

    total_planned_days += metrics.planned_working_days;
    total_completed_days += metrics.completed_working_days;
    weighted_planned_progress_sum += metrics.planned_progress * metrics.planned_working_days;
  }

  const planned_progress = total_planned_days > 0
    ? Math.min(100, Math.round(weighted_planned_progress_sum / total_planned_days))
    : 0;

  const actual_progress = total_planned_days > 0
    ? Math.min(100, Math.round((total_completed_days / total_planned_days) * 100))
    : 0;

  const progress_gap = actual_progress - planned_progress;
  const todayStr = referenceTodayStr || getTodayStrForWorker(null);

  let schedule_state: ScheduleState = 'UPCOMING';
  if ((project.status as string) === 'COMPLETED' || actual_progress === 100) {
    schedule_state = 'COMPLETED';
  } else if (todayStr > project.end_date && actual_progress < 100) {
    schedule_state = 'DELAYED';
  } else if (todayStr < project.start_date) {
    schedule_state = 'UPCOMING';
  } else {
    schedule_state = 'IN_PROGRESS';
  }

  return {
    planned_working_days: total_planned_days,
    completed_working_days: total_completed_days,
    planned_progress,
    actual_progress,
    progress_gap,
    schedule_state,
  };
}
