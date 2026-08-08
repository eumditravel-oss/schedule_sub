// src/utils/capacityEngine.ts
import { Project, ProjectWorkerAllocation, Worker, CapacityState, CountryHoliday, CalendarOverride } from '../types';
import { resolveWorkDayStatus } from './workCalendar';
import { getKoreaDateString } from './dateUtils';

export interface ProjectOverlapInfo {
  projectId: string;
  projectName: string;
  startDate: string;
  endDate: string;
  allocationPercent?: number | null; // undefined/null means UNSET (UNKNOWN)
}

export interface DailyWorkerCapacity {
  dateStr: string;
  totalPercent: number;
  hasUnknown: boolean;
  isOffDay: boolean; // Weekly off, holiday, or leave
  isOverallocated: boolean;
  overlappingProjects: ProjectOverlapInfo[];
}

export interface CapacityPeriod {
  startDate: string;
  endDate: string;
  peakPercent: number;
  hasUnknown: boolean;
  status: CapacityState;
  overlappingProjects: ProjectOverlapInfo[];
}

export interface WorkerRangeCapacityResult {
  workerId: string;
  workerName: string;
  startDate: string;
  endDate: string;
  peakPercent: number;
  overallocatedDaysCount: number;
  unknownDaysCount: number;
  normalDaysCount: number;
  status: CapacityState | 'MIXED';
  compressedPeriods: CapacityPeriod[];
  dailyMap: Record<string, DailyWorkerCapacity>;
}

/**
 * Reconstructs worker allocation percentage as of a specific date from history ledger.
 */
export function getAllocationAsOf(
  projectId: string,
  workerId: string,
  dateStr: string,
  currentAllocations: ProjectWorkerAllocation[],
  historyLogs: any[] = []
): number | null {
  const targetEnd = `${dateStr} 23:59:59`;
  const matchingLogs = historyLogs.filter(
    (h) => h.project_id === projectId && h.worker_id === workerId && h.changed_at <= targetEnd
  );

  if (matchingLogs.length > 0) {
    matchingLogs.sort((a, b) => (a.changed_at < b.changed_at ? 1 : -1));
    const lastLog = matchingLogs[0];
    return lastLog.new_allocation_percent !== null && lastLog.new_allocation_percent !== undefined
      ? Number(lastLog.new_allocation_percent)
      : null;
  }

  const cur = currentAllocations.find((a) => a.project_id === projectId && a.worker_id === workerId);
  return cur && cur.allocation_percent !== undefined && cur.allocation_percent !== null
    ? Number(cur.allocation_percent)
    : null;
}

/**
 * Calculates daily capacity for a worker on a specific date.
 */
export function getDailyWorkerCapacity(
  worker: Worker,
  dateStr: string,
  activeProjects: Project[],
  allocationsMap: Record<string, ProjectWorkerAllocation[]>,
  holidays: CountryHoliday[] = [],
  overrides: CalendarOverride[] = []
): DailyWorkerCapacity {
  const matchingProjects: ProjectOverlapInfo[] = [];
  let totalPercent = 0;
  let hasUnknown = false;

  for (const prj of activeProjects) {
    if (prj.status !== 'ACTIVE') continue;
    if (!prj.start_date || !prj.end_date) continue;
    if (prj.start_date <= dateStr && dateStr <= prj.end_date) {
      const pAllocations = allocationsMap[prj.id] || [];
      const alloc = pAllocations.find((a) => a.worker_id === worker.id);

      if (alloc) {
        if (alloc.allocation_percent !== undefined && alloc.allocation_percent !== null) {
          totalPercent += Number(alloc.allocation_percent);
          matchingProjects.push({
            projectId: prj.id,
            projectName: prj.name,
            startDate: prj.start_date,
            endDate: prj.end_date,
            allocationPercent: Number(alloc.allocation_percent),
          });
        } else {
          hasUnknown = true;
          matchingProjects.push({
            projectId: prj.id,
            projectName: prj.name,
            startDate: prj.start_date,
            endDate: prj.end_date,
            allocationPercent: null,
          });
        }
      }
    }
  }

  // Check worker calendar for off-days
  let isOffDay = false;
  try {
    const dayStatus = resolveWorkDayStatus(dateStr, worker, holidays, overrides);
    isOffDay = !dayStatus.is_working_day;
  } catch (e) {
    isOffDay = false;
  }

  const isOverallocated = !isOffDay && totalPercent > 100;

  return {
    dateStr,
    totalPercent,
    hasUnknown,
    isOffDay,
    isOverallocated,
    overlappingProjects: matchingProjects,
  };
}

/**
 * Calculates worker capacity across a date range (TODAY, WEEK, 30D, CUSTOM),
 * applying period compression for contiguous days with identical active projects.
 */
export function calculateWorkerCapacityForRange(
  worker: Worker,
  startDateStr: string,
  endDateStr: string,
  activeProjects: Project[],
  allocationsMap: Record<string, ProjectWorkerAllocation[]>,
  holidays: CountryHoliday[] = [],
  overrides: CalendarOverride[] = []
): WorkerRangeCapacityResult {
  const dailyMap: Record<string, DailyWorkerCapacity> = {};
  let cur = new Date(`${startDateStr}T00:00:00Z`);
  const endObj = new Date(`${endDateStr}T00:00:00Z`);

  let peakPercent = 0;
  let overallocatedDaysCount = 0;
  let unknownDaysCount = 0;
  let normalDaysCount = 0;

  const dateList: string[] = [];

  while (cur <= endObj) {
    const dStr = cur.toISOString().slice(0, 10);
    dateList.push(dStr);

    const dailyCap = getDailyWorkerCapacity(worker, dStr, activeProjects, allocationsMap, holidays, overrides);
    dailyMap[dStr] = dailyCap;

    if (dailyCap.totalPercent > peakPercent) {
      peakPercent = dailyCap.totalPercent;
    }

    if (dailyCap.isOverallocated) {
      overallocatedDaysCount++;
    } else if (dailyCap.hasUnknown) {
      unknownDaysCount++;
    } else {
      normalDaysCount++;
    }

    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  // Determine Overall Range Status
  let status: CapacityState | 'MIXED' = 'NORMAL';
  const hasOver = overallocatedDaysCount > 0;
  const hasUnk = unknownDaysCount > 0;

  if (hasOver && (normalDaysCount > 0 || hasUnk)) {
    status = 'MIXED';
  } else if (hasOver) {
    status = 'OVERALLOCATED';
  } else if (hasUnk && normalDaysCount > 0) {
    status = 'MIXED';
  } else if (hasUnk) {
    status = 'UNKNOWN';
  } else {
    status = 'NORMAL';
  }

  // Compress Contiguous Date Periods
  const compressedPeriods: CapacityPeriod[] = [];
  if (dateList.length > 0) {
    let pStart = dateList[0];
    let pEnd = dateList[0];
    let pCap = dailyMap[pStart];

    for (let i = 1; i < dateList.length; i++) {
      const dStr = dateList[i];
      const curCap = dailyMap[dStr];

      // Key for grouping: same overlapping project IDs and allocation values
      const pKey = pCap.overlappingProjects.map((p) => `${p.projectId}:${p.allocationPercent}`).sort().join('|');
      const curKey = curCap.overlappingProjects.map((p) => `${p.projectId}:${p.allocationPercent}`).sort().join('|');

      if (pKey === curKey && pCap.isOffDay === curCap.isOffDay) {
        pEnd = dStr;
      } else {
        compressedPeriods.push({
          startDate: pStart,
          endDate: pEnd,
          peakPercent: pCap.totalPercent,
          hasUnknown: pCap.hasUnknown,
          status: pCap.isOverallocated ? 'OVERALLOCATED' : pCap.hasUnknown ? 'UNKNOWN' : 'NORMAL',
          overlappingProjects: pCap.overlappingProjects,
        });
        pStart = dStr;
        pEnd = dStr;
        pCap = curCap;
      }
    }

    compressedPeriods.push({
      startDate: pStart,
      endDate: pEnd,
      peakPercent: pCap.totalPercent,
      hasUnknown: pCap.hasUnknown,
      status: pCap.isOverallocated ? 'OVERALLOCATED' : pCap.hasUnknown ? 'UNKNOWN' : 'NORMAL',
      overlappingProjects: pCap.overlappingProjects,
    });
  }

  return {
    workerId: worker.id,
    workerName: worker.name,
    startDate: startDateStr,
    endDate: endDateStr,
    peakPercent,
    overallocatedDaysCount,
    unknownDaysCount,
    normalDaysCount,
    status,
    compressedPeriods,
    dailyMap,
  };
}

/**
 * Helper to calculate overlapping project capacity for a worker specifically during a target project's date range.
 * Used in ProjectWorkforceModal to display "다른 겹치는 프로젝트" and "남은 가용량".
 */
export function getWorkerOverlappingCapacityForProject(
  workerId: string,
  targetProjectId: string,
  targetStartDate: string | null | undefined,
  targetEndDate: string | null | undefined,
  activeProjects: Project[],
  allocationsMap: Record<string, ProjectWorkerAllocation[]>
): {
  otherOverlappingPercent: number;
  hasUnsetOtherProject: boolean;
  overlappingProjectsCount: number;
  overlappingProjectsList: ProjectOverlapInfo[];
} {
  if (!targetStartDate || !targetEndDate) {
    return {
      otherOverlappingPercent: 0,
      hasUnsetOtherProject: false,
      overlappingProjectsCount: 0,
      overlappingProjectsList: [],
    };
  }

  let otherOverlappingPercent = 0;
  let hasUnsetOtherProject = false;
  const overlappingProjectsList: ProjectOverlapInfo[] = [];

  for (const prj of activeProjects) {
    if (prj.status !== 'ACTIVE' || prj.id === targetProjectId) continue;
    if (!prj.start_date || !prj.end_date) continue;

    // Check date overlap: prj.start <= targetEnd AND prj.end >= targetStart
    const isOverlapping = prj.start_date <= targetEndDate && prj.end_date >= targetStartDate;
    if (isOverlapping) {
      const pAllocations = allocationsMap[prj.id] || [];
      const alloc = pAllocations.find((a) => a.worker_id === workerId);

      if (alloc) {
        if (alloc.allocation_percent !== undefined && alloc.allocation_percent !== null) {
          otherOverlappingPercent += Number(alloc.allocation_percent);
          overlappingProjectsList.push({
            projectId: prj.id,
            projectName: prj.name,
            startDate: prj.start_date,
            endDate: prj.end_date,
            allocationPercent: Number(alloc.allocation_percent),
          });
        } else {
          hasUnsetOtherProject = true;
          overlappingProjectsList.push({
            projectId: prj.id,
            projectName: prj.name,
            startDate: prj.start_date,
            endDate: prj.end_date,
            allocationPercent: null,
          });
        }
      }
    }
  }

  return {
    otherOverlappingPercent,
    hasUnsetOtherProject,
    overlappingProjectsCount: overlappingProjectsList.length,
    overlappingProjectsList,
  };
}
