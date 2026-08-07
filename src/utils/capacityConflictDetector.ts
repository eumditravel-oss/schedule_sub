// src/utils/capacityConflictDetector.ts
import { Worker, CountryHoliday, CalendarOverride, Task, Project } from '../types';
import { resolveWorkDayStatus } from './workCalendar';

export interface CapacityConflictTaskEntry {
  project_id: string;
  project_name: string;
  task_id: string;
  task_name: string;
  allocation_percent: number;
}

export interface CapacityConflictGroup {
  id: string;
  scope: 'WITHIN_PROJECT' | 'CROSS_PROJECT';
  worker_id: string;
  worker_name: string;
  overlap_start_date: string;
  overlap_end_date: string;
  max_total_allocation: number;
  excess_percent: number;
  tasks: CapacityConflictTaskEntry[];
}

export function detectWorkerCapacityConflicts(
  allProjects: Project[],
  allTasks: Task[],
  workers: Worker[] = [],
  holidays: CountryHoliday[] = [],
  overrides: CalendarOverride[] = [],
  filterProjectId?: string
): {
  project_id?: string;
  conflict_count: number;
  raw_entry_count: number;
  groups: CapacityConflictGroup[];
} {
  const activeProjects = allProjects.filter((p) => p.status === 'ACTIVE');
  const activeProjectMap = new Map<string, Project>();
  activeProjects.forEach((p) => activeProjectMap.set(p.id, p));

  const scheduledTasks = allTasks.filter(
    (t) => t.schedule_status === 'SCHEDULED' && t.start_date && t.end_date && activeProjectMap.has(t.project_id)
  );

  const workerDailyAlloc = new Map<string, { worker: Worker; dateStr: string; entries: CapacityConflictTaskEntry[] }>();

  for (const t of scheduledTasks) {
    const prj = activeProjectMap.get(t.project_id);
    if (!prj) continue;

    let assignees: any[] = t.assignees || [];
    if (assignees.length === 0 && t.worker_name) {
      const ow = workers.find((w) => w.id === t.worker_name || w.name === t.worker_name);
      if (ow) assignees = [{ worker_id: ow.id, name: ow.name, allocation_percent: 100 }];
    }

    for (const a of assignees) {
      const w = workers.find((w) => w.id === a.worker_id || w.name === a.name);
      if (!w || !w.country_code || !w.workweek_profile) continue;

      let cur = new Date(`${t.start_date}T00:00:00Z`);
      const endObj = new Date(`${t.end_date}T00:00:00Z`);
      while (cur <= endObj) {
        const dStr = cur.toISOString().slice(0, 10);
        const st = resolveWorkDayStatus(dStr, w, holidays, overrides);

        if (st.is_working_day) {
          const key = `${w.id}:${dStr}`;
          if (!workerDailyAlloc.has(key)) {
            workerDailyAlloc.set(key, { worker: w, dateStr: dStr, entries: [] });
          }
          const daily = workerDailyAlloc.get(key)!;
          if (!daily.entries.some((e) => e.task_id === t.id)) {
            daily.entries.push({
              project_id: prj.id,
              project_name: prj.name_ko || prj.name,
              task_id: t.id,
              task_name: t.task_name_ko || t.task_name,
              allocation_percent: a.allocation_percent || 0,
            });
          }
        }
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }
  }

  interface ExcessDay {
    worker: Worker;
    dateStr: string;
    totalAlloc: number;
    tasks: CapacityConflictTaskEntry[];
    taskSetKey: string;
  }

  const excessDays: ExcessDay[] = [];
  workerDailyAlloc.forEach((val) => {
    const totalAlloc = val.entries.reduce((sum, e) => sum + e.allocation_percent, 0);
    if (totalAlloc > 100) {
      const sortedTaskIds = val.entries.map((e) => e.task_id).sort().join(',');
      excessDays.push({
        worker: val.worker,
        dateStr: val.dateStr,
        totalAlloc,
        tasks: val.entries,
        taskSetKey: sortedTaskIds,
      });
    }
  });

  excessDays.sort((a, b) => {
    if (a.worker.id !== b.worker.id) return a.worker.id.localeCompare(b.worker.id);
    if (a.taskSetKey !== b.taskSetKey) return a.taskSetKey.localeCompare(b.taskSetKey);
    return a.dateStr.localeCompare(b.dateStr);
  });

  const rawGroups: CapacityConflictGroup[] = [];

  let curGroup: {
    worker: Worker;
    taskSetKey: string;
    startDate: string;
    endDate: string;
    maxTotalAlloc: number;
    tasks: CapacityConflictTaskEntry[];
  } | null = null;

  for (const ed of excessDays) {
    if (
      curGroup &&
      curGroup.worker.id === ed.worker.id &&
      curGroup.taskSetKey === ed.taskSetKey &&
      isContiguousDay(curGroup.endDate, ed.dateStr)
    ) {
      curGroup.endDate = ed.dateStr;
      if (ed.totalAlloc > curGroup.maxTotalAlloc) {
        curGroup.maxTotalAlloc = ed.totalAlloc;
      }
    } else {
      if (curGroup) {
        pushGroup(curGroup, rawGroups);
      }
      curGroup = {
        worker: ed.worker,
        taskSetKey: ed.taskSetKey,
        startDate: ed.dateStr,
        endDate: ed.dateStr,
        maxTotalAlloc: ed.totalAlloc,
        tasks: ed.tasks,
      };
    }
  }
  if (curGroup) {
    pushGroup(curGroup, rawGroups);
  }

  const finalGroups = filterProjectId
    ? rawGroups.filter((g) => g.tasks.some((t) => t.project_id === filterProjectId))
    : rawGroups;

  return {
    project_id: filterProjectId,
    conflict_count: finalGroups.length,
    raw_entry_count: excessDays.length,
    groups: finalGroups,
  };
}

function pushGroup(
  g: {
    worker: Worker;
    taskSetKey: string;
    startDate: string;
    endDate: string;
    maxTotalAlloc: number;
    tasks: CapacityConflictTaskEntry[];
  },
  out: CapacityConflictGroup[]
) {
  const projectIds = new Set(g.tasks.map((t) => t.project_id));
  const scope: 'WITHIN_PROJECT' | 'CROSS_PROJECT' = projectIds.size > 1 ? 'CROSS_PROJECT' : 'WITHIN_PROJECT';

  out.push({
    id: `cgrp_${g.worker.id}_${g.startDate.replace(/-/g, '')}_${g.endDate.replace(/-/g, '')}`,
    scope,
    worker_id: g.worker.id,
    worker_name: g.worker.name,
    overlap_start_date: g.startDate,
    overlap_end_date: g.endDate,
    max_total_allocation: g.maxTotalAlloc,
    excess_percent: g.maxTotalAlloc - 100,
    tasks: g.tasks,
  });
}

function isContiguousDay(d1: string, d2: string): boolean {
  const dt1 = new Date(`${d1}T00:00:00Z`);
  const dt2 = new Date(`${d2}T00:00:00Z`);
  const diffDays = Math.round((dt2.getTime() - dt1.getTime()) / (1000 * 3600 * 24));
  return diffDays === 1;
}
