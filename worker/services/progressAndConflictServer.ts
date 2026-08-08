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
  schedule_state: 'UPCOMING' | 'IN_PROGRESS' | 'DELAYED' | 'COMPLETED' | 'COMPLETION_REVIEW';
  actual_progress_source: 'AUTO_TIME' | 'STATUS_BASED';
}

export function calculateTaskProgressServer(
  task: any,
  workers: any[] | any = [],
  holidays: any[] = [],
  overrides: any[] = [],
  projectStatus: 'ACTIVE' | 'COMPLETED' = 'ACTIVE',
  dailyStatuses: Record<string, string> = {},
  referenceTodayStr?: string
): TaskProgressMetricsServer {
  if (task.schedule_status === 'UNSCHEDULED' || !task.start_date || !task.end_date) {
    return {
      planned_working_days: 0,
      completed_working_days: 0,
      planned_progress: 0,
      actual_progress: 0,
      progress_gap: 0,
      schedule_state: 'UPCOMING',
      actual_progress_source: task.progress_mode || 'AUTO_TIME',
    };
  }

  const workerList: any[] = Array.isArray(workers) ? workers : (workers ? [workers] : []);
  
  let taskAssignees: any[] = task.assignees || [];
  if (taskAssignees.length === 0) {
    const primaryId = task.primary_worker_id || task.worker_name;
    const foundWorker = workerList.find((w: any) => w.id === primaryId || w.name === primaryId);
    if (foundWorker) {
      taskAssignees = [{
        worker_id: foundWorker.id,
        name: foundWorker.name,
        country_code: foundWorker.country_code,
        assignment_role: 'PRIMARY',
        allocation_percent: 100
      }];
    }
  }

  const refWorker = workerList.find((w: any) => w.id === task.primary_worker_id || w.name === task.worker_name) || workerList[0];
  const todayStr = referenceTodayStr || getTodayStrForWorkerServer(refWorker);

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

  const policy = task.availability_policy || 'ANY_AVAILABLE';

  for (const dateStr of dates) {
    let isWorking = false;
    if (taskAssignees.length === 0) {
      const dayStatus = resolveWorkDayStatusServer(dateStr, refWorker, holidays, overrides);
      isWorking = dayStatus.is_working_day;
    } else {
      const statuses = taskAssignees.map(a => {
        const wObj = workerList.find((w: any) => w.id === a.worker_id || w.name === a.name);
        return resolveWorkDayStatusServer(dateStr, wObj, holidays, overrides);
      });
      if (policy === 'ALL_REQUIRED') {
        isWorking = statuses.every(s => s.is_working_day);
      } else {
        isWorking = statuses.some(s => s.is_working_day);
      }
    }

    if (isWorking) {
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

  const progressMode: 'AUTO_TIME' | 'STATUS_BASED' = task.progress_mode || 'AUTO_TIME';
  let actual_progress = 0;

  if (progressMode === 'AUTO_TIME') {
    if (todayStr < task.start_date) {
      actual_progress = 0;
    } else if (todayStr > task.end_date) {
      actual_progress = 100;
    } else {
      actual_progress = planned_working_days > 0
        ? Math.min(100, Math.round((elapsed_planned_working_days / planned_working_days) * 100))
        : 0;
    }
  } else {
    actual_progress = planned_working_days > 0
      ? Math.min(100, Math.round((completed_working_days / planned_working_days) * 100))
      : 0;
  }

  const progress_gap = actual_progress - planned_progress;

  let schedule_state: 'UPCOMING' | 'IN_PROGRESS' | 'DELAYED' | 'COMPLETED' | 'COMPLETION_REVIEW' = 'UPCOMING';
  if (projectStatus === 'COMPLETED' || Number(task.completion_confirmed) === 1) {
    schedule_state = 'COMPLETED';
  } else if (progressMode === 'AUTO_TIME' && actual_progress === 100) {
    schedule_state = 'COMPLETION_REVIEW';
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
    actual_progress_source: progressMode,
  };
}

export interface ProjectProgressMetricsServer {
  planned_working_days: number;
  completed_working_days: number;
  planned_progress: number;
  actual_progress: number;
  progress_gap: number;
  schedule_state: string;
  auto_progress_task_count: number;
  status_progress_task_count: number;
  unscheduled_task_count: number;
}

/**
 * Calculates project progress metrics server-side.
 * Note: For COMPLETED projects (status === 'COMPLETED'), performs a Calendar day-matrix calculation bypass
 * returning 100% display progress immediately without day-by-day calendar loops.
 */
export function calculateProjectProgressServer(
  project: any,
  tasks: any[] = [],
  workers: any[] = [],
  holidays: any[] = [],
  overrides: any[] = [],
  allDailyStatuses: Record<string, Record<string, string>> = {},
  referenceTodayStr?: string
): ProjectProgressMetricsServer {
  if (project.status === 'COMPLETED') {
    return {
      planned_working_days: 0,
      completed_working_days: 0,
      planned_progress: 100,
      actual_progress: 100,
      progress_gap: 0,
      schedule_state: 'COMPLETED',
      auto_progress_task_count: 0,
      status_progress_task_count: 0,
      unscheduled_task_count: 0,
    };
  }
  
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
      auto_progress_task_count: 0,
      status_progress_task_count: 0,
      unscheduled_task_count: 0,
    };
  }

  let total_planned_days = 0;
  let total_completed_days = 0;
  let weighted_planned_progress_sum = 0;
  let weighted_actual_progress_sum = 0;
  let auto_progress_task_count = 0;
  let status_progress_task_count = 0;
  let unscheduled_task_count = 0;

  for (const tItem of tasks) {
    if (tItem.schedule_status === 'UNSCHEDULED' || !tItem.start_date || !tItem.end_date) {
      unscheduled_task_count += 1;
      continue;
    }
    const dailyMap = allDailyStatuses[tItem.id] || {};
    const metrics = calculateTaskProgressServer(tItem, workers, holidays, overrides, project.status, dailyMap, referenceTodayStr);

    total_planned_days += metrics.planned_working_days;
    total_completed_days += metrics.completed_working_days;
    weighted_planned_progress_sum += metrics.planned_progress * metrics.planned_working_days;
    weighted_actual_progress_sum += metrics.actual_progress * metrics.planned_working_days;

    if (metrics.actual_progress_source === 'AUTO_TIME') {
      auto_progress_task_count += 1;
    } else {
      status_progress_task_count += 1;
    }
  }

  const planned_progress = total_planned_days > 0
    ? Math.min(100, Math.round(weighted_planned_progress_sum / total_planned_days))
    : 0;

  const actual_progress = total_planned_days > 0
    ? Math.min(100, Math.round(weighted_actual_progress_sum / total_planned_days))
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
    auto_progress_task_count,
    status_progress_task_count,
    unscheduled_task_count,
  };
}

export function detectWorkerTaskConflictsServer(
  target: { id?: string; worker_name: string; start_date: string; end_date: string; project_id?: string; assignees?: any[] },
  allProjects: any[],
  allTasks: any[],
  workers: any[] = [],
  holidays: any[] = [],
  overrides: any[] = []
): any[] {
  if (!target.start_date || !target.end_date) return [];

  let targetAssignees: any[] = target.assignees || [];
  if (targetAssignees.length === 0 && target.worker_name) {
    const wObj = workers.find((w) => w.id === target.worker_name || w.name === target.worker_name);
    if (wObj) {
      targetAssignees = [{ worker_id: wObj.id, name: wObj.name, allocation_percent: 100 }];
    }
  }

  if (targetAssignees.length === 0) return [];

  const activeProjectMap = new Map<string, any>();
  allProjects.forEach((p) => {
    if (p.status === 'ACTIVE') {
      activeProjectMap.set(p.id, p);
    }
  });

  const conflicts: any[] = [];

  for (const a of targetAssignees) {
    const targetWorker = workers.find((w) => w.id === a.worker_id || w.name === a.name);
    if (!targetWorker || !targetWorker.country_code || !targetWorker.workweek_profile) continue;

    for (const otherTask of allTasks) {
      if (otherTask.id && target.id && otherTask.id === target.id) continue;
      if (!activeProjectMap.has(otherTask.project_id)) continue;

      let otherAssignees: any[] = otherTask.assignees || [];
      if (otherAssignees.length === 0 && otherTask.worker_name) {
        const ow = workers.find((w) => w.id === otherTask.worker_name || w.name === otherTask.worker_name);
        if (ow) otherAssignees = [{ worker_id: ow.id, name: ow.name, allocation_percent: 100 }];
      }

      const isAssigned = otherAssignees.some((oa) => oa.worker_id === targetWorker.id || oa.name === targetWorker.name);
      if (!isAssigned) continue;

      const startMax = target.start_date > otherTask.start_date ? target.start_date : otherTask.start_date;
      const endMin = target.end_date < otherTask.end_date ? target.end_date : otherTask.end_date;

      if (startMax > endMin) continue;

      const overlapDates: string[] = [];
      let cur = new Date(`${startMax}T00:00:00Z`);
      const endObj = new Date(`${endMin}T00:00:00Z`);
      while (cur <= endObj) {
        overlapDates.push(cur.toISOString().slice(0, 10));
        cur.setUTCDate(cur.getUTCDate() + 1);
      }

      let workingOverlapDays = 0;
      for (const dStr of overlapDates) {
        const st = resolveWorkDayStatusServer(dStr, targetWorker, holidays, overrides);
        if (st.is_working_day) {
          workingOverlapDays += 1;
        }
      }

      if (workingOverlapDays > 0) {
        const otherProj = activeProjectMap.get(otherTask.project_id);
        conflicts.push({
          worker_id: targetWorker.id,
          worker_name: targetWorker.name,
          conflict_project_id: otherTask.project_id,
          conflict_project_name: otherProj?.name || '기타 프로젝트',
          conflict_task_id: otherTask.id,
          conflict_task_name: otherTask.task_name,
          overlap_start_date: startMax,
          overlap_end_date: endMin,
          overlapping_working_days: workingOverlapDays,
        });
      }
    }
  }

  return conflicts;
}
