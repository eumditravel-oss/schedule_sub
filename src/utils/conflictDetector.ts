// src/utils/conflictDetector.ts
import { Task, Project, Worker, CountryHoliday, CalendarOverride, ScheduleConflictDetail } from '../types';
import { resolveWorkDayStatus } from './workCalendar';

export interface TargetTaskScheduleInput {
  id?: string;
  worker_name: string;
  start_date: string;
  end_date: string;
  project_id?: string;
}

export function detectWorkerTaskConflicts(
  target: TargetTaskScheduleInput,
  allProjects: Project[],
  allTasks: Task[],
  workers: Worker[] = [],
  holidays: CountryHoliday[] = [],
  overrides: CalendarOverride[] = []
): ScheduleConflictDetail[] {
  if (!target.worker_name || !target.start_date || !target.end_date) return [];

  const targetWorker = workers.find(
    (w) => w.id === target.worker_name || w.name === target.worker_name
  );

  if (!targetWorker || !targetWorker.country_code || !targetWorker.workweek_profile) {
    return [];
  }

  const activeProjectMap = new Map<string, Project>();
  allProjects.forEach((p) => {
    if (p.status === 'ACTIVE') {
      activeProjectMap.set(p.id, p);
    }
  });

  const conflicts: ScheduleConflictDetail[] = [];

  for (const otherTask of allTasks) {
    if (target.id && otherTask.id === target.id) continue;

    // Same worker check
    const isSameWorker =
      otherTask.worker_name === target.worker_name ||
      otherTask.worker_name === targetWorker.id ||
      otherTask.worker_name === targetWorker.name;

    if (!isSameWorker) continue;

    // Active project check
    const otherProject = activeProjectMap.get(otherTask.project_id);
    if (!otherProject) continue;

    // Date range overlap check
    if (otherTask.start_date <= target.end_date && otherTask.end_date >= target.start_date) {
      const overlapStart = otherTask.start_date > target.start_date ? otherTask.start_date : target.start_date;
      const overlapEnd = otherTask.end_date < target.end_date ? otherTask.end_date : target.end_date;

      // Count overlapping working days
      let overlappingWorkingDays = 0;
      let curDate = new Date(`${overlapStart}T00:00:00Z`);
      const endDateObj = new Date(`${overlapEnd}T00:00:00Z`);

      while (curDate <= endDateObj) {
        const dateStr = curDate.toISOString().slice(0, 10);
        const dayStatus = resolveWorkDayStatus(dateStr, targetWorker, holidays, overrides);
        if (dayStatus.is_working_day) {
          overlappingWorkingDays += 1;
        }
        curDate.setUTCDate(curDate.getUTCDate() + 1);
      }

      if (overlappingWorkingDays > 0) {
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
  }

  return conflicts;
}
