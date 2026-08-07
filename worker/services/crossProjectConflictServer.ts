// worker/services/crossProjectConflictServer.ts
import { resolveWorkDayStatusServer } from './workCalendar';

export interface CrossProjectTaskRef {
  task_id: string;
  task_name: string;
  project_id: string;
  project_name: string;
  start_date: string;
  end_date: string;
  allocation_percent: number;
}

export interface CrossProjectConflictGroup {
  id: string;
  fingerprint: string;
  policy_version: 'cross_project_v1';
  worker_id: string;
  worker_name: string;
  project_ids: string[];
  projects: {
    project_id: string;
    project_name: string;
    tasks: CrossProjectTaskRef[];
    total_allocation: number;
  }[];
  overlap_start_date: string;
  overlap_end_date: string;
  total_working_days: number;
  acknowledged: boolean;
  acknowledged_by_name?: string;
  acknowledged_at?: string;
}

export interface CrossProjectConflictResult {
  total_conflict_count: number;
  unacknowledged_conflict_count: number;
  groups: CrossProjectConflictGroup[];
}

export function generateConflictFingerprint(
  workerId: string,
  projectIds: string[],
  startDate: string,
  endDate: string
): string {
  const sortedPids = [...projectIds].sort().join('_');
  return `cross_project_v1_${workerId}_${sortedPids}_${startDate}_${endDate}`;
}

export function detectCrossProjectWorkerConflictsServer(
  allProjects: any[],
  allTasks: any[],
  workers: any[],
  holidays: any[] = [],
  overrides: any[] = [],
  filterProjectId?: string,
  acknowledgementRecords: any[] = []
): CrossProjectConflictResult {
  const activeProjects = (allProjects || []).filter((p) => p.status === 'ACTIVE');
  const activeProjectMap = new Map<string, any>(activeProjects.map((p) => [p.id, p]));
  const workerMap = new Map<string, any>((workers || []).map((w) => [w.id, w]));

  const ackMap = new Map<string, any>();
  (acknowledgementRecords || []).forEach((ack) => {
    if (ack && ack.conflict_fingerprint) {
      ackMap.set(ack.conflict_fingerprint, ack);
    }
  });

  const scheduledTasks = (allTasks || []).filter((t) => {
    if (!t.start_date || !t.end_date || t.schedule_status === 'UNSCHEDULED') return false;
    return activeProjectMap.has(t.project_id);
  });

  const rawDailyConflicts: {
    worker_id: string;
    worker_name: string;
    dateStr: string;
    project_ids: string[];
    taskEntries: CrossProjectTaskRef[];
  }[] = [];

  for (const worker of workers || []) {
    if (!worker || worker.is_active === 0) continue;
    const workerId = worker.id;
    const workerName = worker.name;

    const workerTasks = scheduledTasks.filter((t) => {
      const assignees = t.assignees || [];
      if (assignees.length > 0) {
        return assignees.some((a: any) => a.worker_id === workerId || a.name === workerName);
      }
      return t.primary_worker_id === workerId || t.worker_name === workerName;
    });

    if (workerTasks.length === 0) continue;

    // Collect date range spanned by tasks
    let minDate = '9999-12-31';
    let maxDate = '0000-01-01';
    for (const t of workerTasks) {
      if (t.start_date < minDate) minDate = t.start_date;
      if (t.end_date > maxDate) maxDate = t.end_date;
    }

    if (minDate > maxDate) continue;

    let cur = new Date(`${minDate}T00:00:00Z`);
    const endObj = new Date(`${maxDate}T00:00:00Z`);

    while (cur <= endObj) {
      const dateStr = cur.toISOString().slice(0, 10);
      const dayStatus = resolveWorkDayStatusServer(dateStr, worker, holidays, overrides);

      if (dayStatus.is_working_day) {
        // Find tasks covering this day
        const activeDailyTasks = workerTasks.filter((t) => t.start_date <= dateStr && t.end_date >= dateStr);
        const projectSet = new Set<string>();

        const taskEntries: CrossProjectTaskRef[] = [];
        activeDailyTasks.forEach((t) => {
          projectSet.add(t.project_id);
          const prj = activeProjectMap.get(t.project_id);
          const assignees = t.assignees || [];
          const matchedAssignee = assignees.find((a: any) => a.worker_id === workerId || a.name === workerName);
          const alloc = matchedAssignee ? Number(matchedAssignee.allocation_percent) || 100 : 100;

          taskEntries.push({
            task_id: t.id,
            task_name: t.task_name_ko || t.task_name || '이름 없음',
            project_id: t.project_id,
            project_name: prj ? prj.name_ko || prj.name : '프로젝트',
            start_date: t.start_date,
            end_date: t.end_date,
            allocation_percent: alloc,
          });
        });

        // CROSS-PROJECT CONFLICT: Scheduled across 2 or more distinct ACTIVE projects
        if (projectSet.size >= 2) {
          const sortedProjectIds = Array.from(projectSet).sort();
          rawDailyConflicts.push({
            worker_id: workerId,
            worker_name: workerName,
            dateStr,
            project_ids: sortedProjectIds,
            taskEntries,
          });
        }
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  // Group contiguous days with exact same worker_id and exact same project_ids
  const groups: CrossProjectConflictGroup[] = [];

  let currentGroup: {
    worker_id: string;
    worker_name: string;
    project_ids: string[];
    dates: string[];
    taskEntriesByDate: CrossProjectTaskRef[][];
  } | null = null;

  for (const item of rawDailyConflicts) {
    const pidsKey = item.project_ids.join(',');

    if (
      !currentGroup ||
      currentGroup.worker_id !== item.worker_id ||
      currentGroup.project_ids.join(',') !== pidsKey ||
      !isContiguousDay(currentGroup.dates[currentGroup.dates.length - 1], item.dateStr)
    ) {
      if (currentGroup) {
        groups.push(buildGroupObject(currentGroup, activeProjectMap, ackMap));
      }
      currentGroup = {
        worker_id: item.worker_id,
        worker_name: item.worker_name,
        project_ids: item.project_ids,
        dates: [item.dateStr],
        taskEntriesByDate: [item.taskEntries],
      };
    } else {
      currentGroup.dates.push(item.dateStr);
      currentGroup.taskEntriesByDate.push(item.taskEntries);
    }
  }

  if (currentGroup) {
    groups.push(buildGroupObject(currentGroup, activeProjectMap, ackMap));
  }

  // Filter groups by filterProjectId if provided
  const filteredGroups = filterProjectId
    ? groups.filter((g) => g.project_ids.includes(filterProjectId))
    : groups;

  const unacknowledgedGroups = filteredGroups.filter((g) => !g.acknowledged);

  return {
    total_conflict_count: filteredGroups.length,
    unacknowledged_conflict_count: unacknowledgedGroups.length,
    groups: filteredGroups,
  };
}

function isContiguousDay(d1Str: string, d2Str: string): boolean {
  const d1 = new Date(`${d1Str}T00:00:00Z`);
  const d2 = new Date(`${d2Str}T00:00:00Z`);
  const diffTime = d2.getTime() - d1.getTime();
  const diffDays = Math.round(diffTime / (1000 * 3600 * 24));
  return diffDays === 1;
}

function buildGroupObject(
  groupData: {
    worker_id: string;
    worker_name: string;
    project_ids: string[];
    dates: string[];
    taskEntriesByDate: CrossProjectTaskRef[][];
  },
  activeProjectMap: Map<string, any>,
  ackMap: Map<string, any>
): CrossProjectConflictGroup {
  const startDate = groupData.dates[0];
  const endDate = groupData.dates[groupData.dates.length - 1];
  const fingerprint = generateConflictFingerprint(groupData.worker_id, groupData.project_ids, startDate, endDate);

  const ackRecord = ackMap.get(fingerprint);

  // De-duplicate task references per project
  const projectSummaries = groupData.project_ids.map((pId) => {
    const prj = activeProjectMap.get(pId);
    const taskMap = new Map<string, CrossProjectTaskRef>();
    let totalAlloc = 0;

    groupData.taskEntriesByDate.forEach((dailyTasks) => {
      dailyTasks.forEach((t) => {
        if (t.project_id === pId && !taskMap.has(t.task_id)) {
          taskMap.set(t.task_id, t);
          totalAlloc += t.allocation_percent;
        }
      });
    });

    return {
      project_id: pId,
      project_name: prj ? prj.name_ko || prj.name : '프로젝트',
      tasks: Array.from(taskMap.values()),
      total_allocation: totalAlloc,
    };
  });

  return {
    id: `cp_conf_${groupData.worker_id}_${startDate}_${endDate}`,
    fingerprint,
    policy_version: 'cross_project_v1',
    worker_id: groupData.worker_id,
    worker_name: groupData.worker_name,
    project_ids: groupData.project_ids,
    projects: projectSummaries,
    overlap_start_date: startDate,
    overlap_end_date: endDate,
    total_working_days: groupData.dates.length,
    acknowledged: !!ackRecord,
    acknowledged_by_name: ackRecord ? ackRecord.acknowledged_by_name : undefined,
    acknowledged_at: ackRecord ? ackRecord.acknowledged_at : undefined,
  };
}
