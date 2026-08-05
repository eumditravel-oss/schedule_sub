// worker/services/progressAndConflictServer.ts
import { resolveWorkDayStatusServer } from './workCalendar';

export function getTodayStrForWorkerServer(worker?: any): string {
  const timeZone = worker?.country_code === 'VN' ? 'Asia/Ho_Chi_Minh' : 'Asia/Seoul';
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return formatter.format(now);
}

export interface TaskProgressMetricsServer {
  planned_working_days: number;
  completed_working_days: number;
  planned_progress: number;
  actual_progress: number;
  progress_gap: number;
  schedule_state: 'UPCOMING' | 'IN_PROGRESS' | 'DELAYED' | 'COMPLETED';
}

export function calculateTaskProgressServer(
  task: any,
  worker?: any,
  holidays: any[] = [],
  overrides: any[] = [],
  projectStatus: 'ACTIVE' | 'COMPLETED' = 'ACTIVE',
  dailyStatuses: Record<string, string> = {},
  referenceTodayStr?: string
): TaskProgressMetricsServer {
  const todayStr = referenceTodayStr || getTodayStrForWorkerServer(worker);
  const workerObj = worker || {
    id: task.worker_name,
    name: task.worker_name,
    country_code: 'KR',
    workweek_profile: 'MON_FRI',
  };

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
    const dayStatus = resolveWorkDayStatusServer(dateStr, workerObj, holidays, overrides);

    if (dayStatus.is_working_day) {
      planned_working_days += 1;

      if (dateStr < todayStr) {
        elapsed_planned_working_days += 1;
      }

      const statusVal = dailyStatuses[dateStr] || task.daily_statuses?.[dateStr];
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
  }

  const progress_gap = actual_progress - planned_progress;

  let schedule_state: 'UPCOMING' | 'IN_PROGRESS' | 'DELAYED' | 'COMPLETED' = 'UPCOMING';
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

export function calculateProjectProgressServer(
  project: any,
  tasks: any[],
  workers: any[] = [],
  holidays: any[] = [],
  overrides: any[] = [],
  allDailyStatuses: Record<string, Record<string, string>> = {},
  referenceTodayStr?: string
): any {
  if (!tasks || tasks.length === 0) {
    const todayStr = referenceTodayStr || getTodayStrForWorkerServer(null);
    let state = 'UPCOMING';
    if (project.status === 'COMPLETED') {
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
    const dailyMap = allDailyStatuses[tItem.id] || {};
    const metrics = calculateTaskProgressServer(tItem, workerObj, holidays, overrides, project.status, dailyMap, referenceTodayStr);

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
  const todayStr = referenceTodayStr || getTodayStrForWorkerServer(null);

  let schedule_state = 'UPCOMING';
  if (project.status === 'COMPLETED' || actual_progress === 100) {
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

export function detectWorkerTaskConflictsServer(
  target: { id?: string; worker_name: string; start_date: string; end_date: string; project_id?: string },
  allProjects: any[],
  allTasks: any[],
  workers: any[] = [],
  holidays: any[] = [],
  overrides: any[] = []
): any[] {
  if (!target.worker_name || !target.start_date || !target.end_date) return [];

  const targetWorker = workers.find(
    (w) => w.id === target.worker_name || w.name === target.worker_name
  ) || {
    id: target.worker_name,
    name: target.worker_name,
    country_code: 'KR',
    workweek_profile: 'MON_FRI',
  };

  const activeProjectMap = new Map<string, any>();
  allProjects.forEach((p) => {
    if (p.status === 'ACTIVE') {
      activeProjectMap.set(p.id, p);
    }
  });

  const conflicts: any[] = [];

  for (const otherTask of allTasks) {
    if (!otherTask || !otherTask.start_date || !otherTask.end_date || !otherTask.worker_name) continue;
    if (target.id && otherTask.id === target.id) continue;
    if (target.project_id && otherTask.project_id === target.project_id) continue;

    const isSameWorker =
      otherTask.worker_name === target.worker_name ||
      otherTask.worker_name === targetWorker.id ||
      otherTask.worker_name === targetWorker.name;

    if (!isSameWorker) continue;

    const otherProject = activeProjectMap.get(otherTask.project_id);
    if (!otherProject) continue;

    if (otherTask.start_date <= target.end_date && otherTask.end_date >= target.start_date) {
      const overlapStart = otherTask.start_date > target.start_date ? otherTask.start_date : target.start_date;
      const overlapEnd = otherTask.end_date < target.end_date ? otherTask.end_date : target.end_date;

      let overlappingWorkingDays = 0;
      let curDate = new Date(`${overlapStart}T00:00:00Z`);
      const endDateObj = new Date(`${overlapEnd}T00:00:00Z`);

      while (curDate <= endDateObj) {
        const dateStr = curDate.toISOString().slice(0, 10);
        const dayStatus = resolveWorkDayStatusServer(dateStr, targetWorker, holidays, overrides);
        if (dayStatus.is_working_day) {
          overlappingWorkingDays += 1;
        }
        curDate.setUTCDate(curDate.getUTCDate() + 1);
      }

      conflicts.push({
        worker_id: targetWorker.id,
        worker_name: targetWorker.name,
        current_project_id: target.project_id,
        conflict_project_id: otherProject.id,
        conflict_project_name: otherProject.name_ko || otherProject.name,
        current_task_id: target.id,
        conflict_task_id: otherTask.id,
        conflict_task_name: otherTask.task_name_ko || otherTask.task_name,
        overlap_start_date: overlapStart,
        overlap_end_date: overlapEnd,
        overlapping_working_days: overlappingWorkingDays,
      });
    }
  }

  return conflicts;
}
