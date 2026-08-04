// src/utils/conflictDetector.ts
import { Task, Project } from '../types';

export interface ScheduleConflictDetail {
  worker_name: string;
  project_id: string;
  project_name: string;
  task_id: string;
  task_name: string;
  start_date: string;
  end_date: string;
  overlap_start: string;
  overlap_end: string;
  overlap_days: number;
}

/**
 * Checks for date overlap between two date ranges [start1, end1] and [start2, end2] (inclusive).
 */
export function getOverlappingDateRange(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): { hasOverlap: boolean; overlapStart?: string; overlapEnd?: string; overlapDays?: number } {
  const s1 = new Date(`${start1}T00:00:00`).getTime();
  const e1 = new Date(`${end1}T00:00:00`).getTime();
  const s2 = new Date(`${start2}T00:00:00`).getTime();
  const e2 = new Date(`${end2}T00:00:00`).getTime();

  const maxStart = Math.max(s1, s2);
  const minEnd = Math.min(e1, e2);

  if (maxStart <= minEnd) {
    const overlapStartStr = new Date(maxStart).toISOString().slice(0, 10);
    const overlapEndStr = new Date(minEnd).toISOString().slice(0, 10);
    const overlapDays = Math.round((minEnd - maxStart) / (1000 * 60 * 60 * 24)) + 1;
    return {
      hasOverlap: true,
      overlapStart: overlapStartStr,
      overlapEnd: overlapEndStr,
      overlapDays,
    };
  }

  return { hasOverlap: false };
}

/**
 * Detects schedule conflicts for a worker against active tasks across projects.
 */
export function detectWorkerScheduleConflicts(
  targetTask: {
    id?: string;
    worker_name: string;
    start_date: string;
    end_date: string;
    project_id?: string;
  },
  allTasks: Task[],
  projects: Project[]
): ScheduleConflictDetail[] {
  const conflicts: ScheduleConflictDetail[] = [];

  const activeProjectIds = new Set(
    projects.filter((p) => p.status === 'ACTIVE').map((p) => p.id)
  );

  for (const existingTask of allTasks) {
    // Exclude self if updating
    if (targetTask.id && existingTask.id === targetTask.id) continue;

    // Check same worker
    if (existingTask.worker_name !== targetTask.worker_name) continue;

    // Check active project
    if (!activeProjectIds.has(existingTask.project_id)) continue;

    const overlap = getOverlappingDateRange(
      targetTask.start_date,
      targetTask.end_date,
      existingTask.start_date,
      existingTask.end_date
    );

    if (overlap.hasOverlap) {
      const proj = projects.find((p) => p.id === existingTask.project_id);
      conflicts.push({
        worker_name: targetTask.worker_name,
        project_id: existingTask.project_id,
        project_name: proj?.name || existingTask.project_id,
        task_id: existingTask.id,
        task_name: existingTask.task_name,
        start_date: existingTask.start_date,
        end_date: existingTask.end_date,
        overlap_start: overlap.overlapStart!,
        overlap_end: overlap.overlapEnd!,
        overlap_days: overlap.overlapDays!,
      });
    }
  }

  return conflicts;
}
