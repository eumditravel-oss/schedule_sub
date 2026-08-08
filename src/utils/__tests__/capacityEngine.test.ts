// src/utils/__tests__/capacityEngine.test.ts
import { describe, it, expect } from 'vitest';
import { calculateWorkerCapacityForRange, getWorkerOverlappingCapacityForProject } from '../capacityEngine';
import { Project, ProjectWorkerAllocation, Worker } from '../../types';

describe('Date-Based Capacity Engine (capacityEngine.ts)', () => {
  const dummyWorker: Worker = {
    id: 'wrk_thanh',
    name: 'Thanh Phuong',
    country_code: 'VN',
    workweek_profile: 'MON_SAT',
    access_role: 'EDITOR',
    is_active: 1,
    sort_order: 1,
  };

  it('1. Returns Peak Capacity 70% (NOT 160%) when project date ranges DO NOT overlap (ES, Web, CONCOST)', () => {
    const activeProjects: Project[] = [
      { id: 'prj_es', name: 'ES 개발', start_date: '2026-05-07', end_date: '2026-06-22', status: 'ACTIVE', progress: 0 },
      { id: 'prj_web', name: '웹개발작업', start_date: '2026-06-23', end_date: '2026-07-03', status: 'ACTIVE', progress: 0 },
      { id: 'prj_hub', name: 'CONCOST-HUB 개발', start_date: '2026-07-06', end_date: '2026-08-07', status: 'ACTIVE', progress: 0 },
    ];

    const allocationsMap: Record<string, ProjectWorkerAllocation[]> = {
      prj_es: [{ id: 'a1', project_id: 'prj_es', worker_id: 'wrk_thanh', allocation_percent: 40 }],
      prj_web: [{ id: 'a2', project_id: 'prj_web', worker_id: 'wrk_thanh', allocation_percent: 10 }],
      prj_hub: [{ id: 'a3', project_id: 'prj_hub', worker_id: 'wrk_thanh', allocation_percent: 70 }],
    };

    const res = calculateWorkerCapacityForRange(
      dummyWorker,
      '2026-05-01',
      '2026-08-31',
      activeProjects,
      allocationsMap
    );

    expect(res.peakPercent).toBe(70);
    expect(res.overallocatedDaysCount).toBe(0);
    expect(res.status).toBe('NORMAL');
    // Verify Period Compression
    expect(res.compressedPeriods.length).toBeGreaterThan(0);
  });

  it('2. Calculates Peak Capacity 120% and 6 overallocated days when projects DO overlap in date range', () => {
    const activeProjects: Project[] = [
      { id: 'prj_a', name: 'Project A', start_date: '2026-05-01', end_date: '2026-05-31', status: 'ACTIVE', progress: 0 },
      { id: 'prj_b', name: 'Project B', start_date: '2026-05-15', end_date: '2026-05-20', status: 'ACTIVE', progress: 0 },
    ];

    const allocationsMap: Record<string, ProjectWorkerAllocation[]> = {
      prj_a: [{ id: 'a1', project_id: 'prj_a', worker_id: 'wrk_thanh', allocation_percent: 70 }],
      prj_b: [{ id: 'a2', project_id: 'prj_b', worker_id: 'wrk_thanh', allocation_percent: 50 }],
    };

    const res = calculateWorkerCapacityForRange(
      dummyWorker,
      '2026-05-01',
      '2026-05-31',
      activeProjects,
      allocationsMap
    );

    expect(res.peakPercent).toBe(120);
    expect(res.overallocatedDaysCount).toBe(5); // May 15 to May 20 (6 calendar days - 1 Sunday weekly off = 5 working days)
    expect(res.status).toBe('MIXED'); // Normal on non-overlap days, overallocated on May 15-20
  });

  it('3. Correctly calculates getWorkerOverlappingCapacityForProject for ProjectWorkforceModal UX', () => {
    const activeProjects: Project[] = [
      { id: 'prj_target', name: 'Target Project', start_date: '2026-07-06', end_date: '2026-08-07', status: 'ACTIVE', progress: 0 },
      { id: 'prj_other_1', name: 'Other Overlapping Project', start_date: '2026-07-01', end_date: '2026-07-15', status: 'ACTIVE', progress: 0 },
      { id: 'prj_other_2', name: 'Non Overlapping Past Project', start_date: '2026-05-01', end_date: '2026-06-01', status: 'ACTIVE', progress: 0 },
    ];

    const allocationsMap: Record<string, ProjectWorkerAllocation[]> = {
      prj_target: [{ id: 'a1', project_id: 'prj_target', worker_id: 'wrk_thanh', allocation_percent: 70 }],
      prj_other_1: [{ id: 'a2', project_id: 'prj_other_1', worker_id: 'wrk_thanh', allocation_percent: 20 }],
      prj_other_2: [{ id: 'a3', project_id: 'prj_other_2', worker_id: 'wrk_thanh', allocation_percent: 40 }],
    };

    const overlapInfo = getWorkerOverlappingCapacityForProject(
      'wrk_thanh',
      'prj_target',
      '2026-07-06',
      '2026-08-07',
      activeProjects,
      allocationsMap
    );

    expect(overlapInfo.otherOverlappingPercent).toBe(20); // Only prj_other_1 overlaps (20%), NOT prj_other_2 (40%)
    expect(overlapInfo.hasUnsetOtherProject).toBe(false);
    expect(overlapInfo.overlappingProjectsCount).toBe(1);
  });
});
