// tests/unit/worker-capacity-conflict.test.ts
import { describe, test, expect } from 'vitest';
import { detectWorkerCapacityOverloads } from '../../src/utils/capacityConflictDetector';
import { Project, Task, Worker, ProjectWorkerAllocation } from '../../src/types';

const mockWorker: Worker = {
  id: 'wrk_test',
  name: 'Test Worker',
  country_code: 'KR',
  workweek_profile: 'MON_FRI',
  is_active: 1,
  sort_order: 1,
};

const mockProjectA: Project = {
  id: 'prj_a',
  name: 'Project A',
  start_date: '2026-07-01',
  end_date: '2026-07-31',
  progress: 0,
  status: 'ACTIVE',
};

const mockProjectB: Project = {
  id: 'prj_b',
  name: 'Project B',
  start_date: '2026-07-01',
  end_date: '2026-07-31',
  progress: 0,
  status: 'ACTIVE',
};

describe('Worker Capacity Overload Detector Suite (V2 Model)', () => {
  test('A. 50% + 40% = 90% (<= 100%) produces 0 overloads', () => {
    const allocs: ProjectWorkerAllocation[] = [
      { id: '1', project_id: 'prj_a', worker_id: 'wrk_test', allocation_percent: 50 },
      { id: '2', project_id: 'prj_b', worker_id: 'wrk_test', allocation_percent: 40 },
    ];

    const res = detectWorkerCapacityOverloads([mockProjectA, mockProjectB], [], allocs, [mockWorker], [], []);
    expect(res.overload_count).toBe(0);
    expect(res.groups.length).toBe(0);
  });

  test('B. Multiple tasks in same project with 60% project allocation produce 0 overloads (no internal task duplication)', () => {
    const allocs: ProjectWorkerAllocation[] = [
      { id: '1', project_id: 'prj_a', worker_id: 'wrk_test', allocation_percent: 60 },
    ];
    const task1: Partial<Task> = {
      id: 't1',
      project_id: 'prj_a',
      start_date: '2026-07-06',
      end_date: '2026-07-06',
      schedule_status: 'SCHEDULED',
      assignees: [{ worker_id: 'wrk_test', name: 'Test Worker', assignment_role: 'PRIMARY', allocation_percent: 100 }],
    };
    const task2: Partial<Task> = {
      id: 't2',
      project_id: 'prj_a',
      start_date: '2026-07-06',
      end_date: '2026-07-06',
      schedule_status: 'SCHEDULED',
      assignees: [{ worker_id: 'wrk_test', name: 'Test Worker', assignment_role: 'CO_ASSIGNEE', allocation_percent: 0 }],
    };

    const res = detectWorkerCapacityOverloads([mockProjectA], [task1 as Task, task2 as Task], allocs, [mockWorker], [], []);
    expect(res.overload_count).toBe(0);
  });

  test('C. 70% (Project A) + 50% (Project B) = 120% (> 100%) produces 1 overload group with excess 20%', () => {
    const allocs: ProjectWorkerAllocation[] = [
      { id: '1', project_id: 'prj_a', worker_id: 'wrk_test', allocation_percent: 70 },
      { id: '2', project_id: 'prj_b', worker_id: 'wrk_test', allocation_percent: 50 },
    ];

    const res = detectWorkerCapacityOverloads([mockProjectA, mockProjectB], [], allocs, [mockWorker], [], []);
    expect(res.overload_count).toBe(1);
    expect(res.groups[0].total_allocation_percent).toBe(120);
    expect(res.groups[0].excess_percent).toBe(20);
    expect(res.groups[0].policy_version).toBe('project_capacity_v1');
  });

  test('D. Overload on weekend days only (Saturday/Sunday for MON_FRI) is suppressed (0 overloads)', () => {
    const projWeekendA: Project = { ...mockProjectA, start_date: '2026-07-11', end_date: '2026-07-12' };
    const projWeekendB: Project = { ...mockProjectB, start_date: '2026-07-11', end_date: '2026-07-12' };

    const allocs: ProjectWorkerAllocation[] = [
      { id: '1', project_id: 'prj_a', worker_id: 'wrk_test', allocation_percent: 70 },
      { id: '2', project_id: 'prj_b', worker_id: 'wrk_test', allocation_percent: 50 },
    ];

    const res = detectWorkerCapacityOverloads([projWeekendA, projWeekendB], [], allocs, [mockWorker], [], []);
    expect(res.overload_count).toBe(0);
  });
});
