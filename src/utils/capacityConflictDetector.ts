// src/utils/capacityConflictDetector.ts
// Worker Over-allocation & Capacity Detector Engine V2
import { Worker, CountryHoliday, CalendarOverride, Task, Project, ProjectWorkerAllocation } from '../types';
import { resolveWorkDayStatus } from './workCalendar';

export interface ProjectAllocationEntry {
  project_id: string;
  project_name: string;
  allocation_percent: number;
  is_known: boolean;
}

export interface WorkerCapacityOverloadGroup {
  id: string;
  policy_version: 'project_capacity_v1';
  worker_id: string;
  worker_name: string;
  overlap_start_date: string;
  overlap_end_date: string;
  total_allocation_percent: number;
  excess_percent: number;
  projects: ProjectAllocationEntry[];
  missing_project_count: number;
  fingerprint: string;
}

export function generateCapacityFingerprint(
  workerId: string,
  projectAllocations: ProjectAllocationEntry[],
  startDate: string,
  endDate: string
): string {
  const sortedProjStr = projectAllocations
    .slice()
    .sort((a, b) => a.project_id.localeCompare(b.project_id))
    .map((p) => `${p.project_id}:${p.allocation_percent}`)
    .join('|');
  return `project_capacity_v1::${workerId}::${sortedProjStr}::${startDate}::${endDate}`;
}

export function detectWorkerCapacityOverloads(
  allProjects: Project[],
  allTasks: Task[],
  allocations: ProjectWorkerAllocation[] = [],
  workers: Worker[] = [],
  holidays: CountryHoliday[] = [],
  overrides: CalendarOverride[] = [],
  filterProjectId?: string
): {
  overload_count: number;
  groups: WorkerCapacityOverloadGroup[];
} {
  const activeProjects = allProjects.filter((p) => p.status === 'ACTIVE');
  const activeProjectMap = new Map<string, Project>();
  activeProjects.forEach((p) => activeProjectMap.set(p.id, p));

  // Map allocations by project_id -> worker_id -> allocation_percent
  const projWorkerAllocMap = new Map<string, Map<string, ProjectWorkerAllocation>>();
  for (const alloc of allocations) {
    if (!projWorkerAllocMap.has(alloc.project_id)) {
      projWorkerAllocMap.set(alloc.project_id, new Map());
    }
    projWorkerAllocMap.get(alloc.project_id)!.set(alloc.worker_id, alloc);
  }

  // Determine worker project participation
  // A worker participates in project P if:
  // A. Has an allocation row in P OR B. Is PIC/Support on a task in P
  const workerProjectParticipants = new Map<string, Set<string>>();

  // From allocations:
  for (const alloc of allocations) {
    if (activeProjectMap.has(alloc.project_id)) {
      if (!workerProjectParticipants.has(alloc.worker_id)) {
        workerProjectParticipants.set(alloc.worker_id, new Set());
      }
      workerProjectParticipants.get(alloc.worker_id)!.add(alloc.project_id);
    }
  }

  // From tasks:
  for (const t of allTasks) {
    if (!activeProjectMap.has(t.project_id)) continue;
    const assignees = t.assignees || [];
    for (const a of assignees) {
      if (a.worker_id) {
        if (!workerProjectParticipants.has(a.worker_id)) {
          workerProjectParticipants.set(a.worker_id, new Set());
        }
        workerProjectParticipants.get(a.worker_id)!.add(t.project_id);
      }
    }
    if (t.primary_worker_id) {
      if (!workerProjectParticipants.has(t.primary_worker_id)) {
        workerProjectParticipants.set(t.primary_worker_id, new Set());
      }
      workerProjectParticipants.get(t.primary_worker_id)!.add(t.project_id);
    }
  }

  interface OverloadDay {
    worker: Worker;
    dateStr: string;
    totalAlloc: number;
    excessAlloc: number;
    projects: ProjectAllocationEntry[];
    missingCount: number;
    projSetKey: string;
  }

  const overloadDays: OverloadDay[] = [];

  for (const w of workers) {
    if (!w.is_active || w.name === 'CEO' || w.name === 'COO') continue;
    const participatedProjIds = workerProjectParticipants.get(w.id);
    if (!participatedProjIds || participatedProjIds.size === 0) continue;

    const workerProjects = Array.from(participatedProjIds)
      .map((pId) => activeProjectMap.get(pId))
      .filter((p): p is Project => Boolean(p));

    if (workerProjects.length === 0) continue;

    // Find date range spanning all participant projects
    let minDate = '9999-12-31';
    let maxDate = '0000-01-01';
    workerProjects.forEach((p) => {
      if (p.start_date && p.start_date < minDate) minDate = p.start_date;
      if (p.end_date && p.end_date > maxDate) maxDate = p.end_date;
    });

    if (minDate > maxDate) continue;

    let cur = new Date(`${minDate}T00:00:00Z`);
    const endObj = new Date(`${maxDate}T00:00:00Z`);

    while (cur <= endObj) {
      const dStr = cur.toISOString().slice(0, 10);
      const st = resolveWorkDayStatus(dStr, w, holidays, overrides);

      // Capacity alerts are generated ONLY on active working days for Worker W
      if (st.is_working_day) {
        let totalAlloc = 0;
        let missingCount = 0;
        const projEntries: ProjectAllocationEntry[] = [];

        for (const prj of workerProjects) {
          if (prj.start_date && prj.end_date && dStr >= prj.start_date && dStr <= prj.end_date) {
            const alloc = projWorkerAllocMap.get(prj.id)?.get(w.id);
            if (alloc !== undefined) {
              const pct = Number(alloc.allocation_percent || 0);
              totalAlloc += pct;
              projEntries.push({
                project_id: prj.id,
                project_name: prj.name_ko || prj.name,
                allocation_percent: pct,
                is_known: true,
              });
            } else {
              missingCount++;
              projEntries.push({
                project_id: prj.id,
                project_name: prj.name_ko || prj.name,
                allocation_percent: 0,
                is_known: false,
              });
            }
          }
        }

        // Over-allocation happens when total known allocation > 100%
        if (totalAlloc > 100) {
          if (!filterProjectId || projEntries.some((pe) => pe.project_id === filterProjectId)) {
            const sortedProjKey = projEntries
              .slice()
              .sort((a, b) => a.project_id.localeCompare(b.project_id))
              .map((p) => `${p.project_id}:${p.allocation_percent}`)
              .join('|');

            overloadDays.push({
              worker: w,
              dateStr: dStr,
              totalAlloc,
              excessAlloc: totalAlloc - 100,
              projects: projEntries,
              missingCount,
              projSetKey: `${w.id}::${sortedProjKey}`,
            });
          }
        }
      }

      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  // Group consecutive dates with matching overload keys
  overloadDays.sort((a, b) => {
    if (a.worker.id !== b.worker.id) return a.worker.id.localeCompare(b.worker.id);
    if (a.projSetKey !== b.projSetKey) return a.projSetKey.localeCompare(b.projSetKey);
    return a.dateStr.localeCompare(b.dateStr);
  });

  const groups: WorkerCapacityOverloadGroup[] = [];

  for (const day of overloadDays) {
    const lastGroup = groups[groups.length - 1];

    if (
      lastGroup &&
      lastGroup.worker_id === day.worker.id &&
      lastGroup.fingerprint.includes(day.projSetKey)
    ) {
      // Check if day is consecutive (within 4 calendar days due to weekends/holidays)
      const prevEnd = new Date(`${lastGroup.overlap_end_date}T00:00:00Z`);
      const currDay = new Date(`${day.dateStr}T00:00:00Z`);
      const diffDays = Math.round((currDay.getTime() - prevEnd.getTime()) / 86400000);

      if (diffDays >= 1 && diffDays <= 4) {
        lastGroup.overlap_end_date = day.dateStr;
        lastGroup.total_allocation_percent = Math.max(lastGroup.total_allocation_percent, day.totalAlloc);
        lastGroup.excess_percent = Math.max(lastGroup.excess_percent, day.excessAlloc);
        // Re-generate fingerprint for extended date range
        lastGroup.fingerprint = generateCapacityFingerprint(
          lastGroup.worker_id,
          lastGroup.projects,
          lastGroup.overlap_start_date,
          lastGroup.overlap_end_date
        );
        continue;
      }
    }

    const fp = generateCapacityFingerprint(
      day.worker.id,
      day.projects,
      day.dateStr,
      day.dateStr
    );

    groups.push({
      id: `ovl_${day.worker.id}_${day.dateStr}`,
      policy_version: 'project_capacity_v1',
      worker_id: day.worker.id,
      worker_name: day.worker.name,
      overlap_start_date: day.dateStr,
      overlap_end_date: day.dateStr,
      total_allocation_percent: day.totalAlloc,
      excess_percent: day.excessAlloc,
      projects: day.projects,
      missing_project_count: day.missingCount,
      fingerprint: fp,
    });
  }

  return {
    overload_count: groups.length,
    groups,
  };
}

export const detectWorkerCapacityConflicts = detectWorkerCapacityOverloads;
