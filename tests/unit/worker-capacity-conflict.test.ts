// tests/unit/worker-capacity-conflict.test.ts
import { describe, test, expect } from 'vitest';
import { detectWorkerCapacityConflicts } from '../../src/utils/capacityConflictDetector';
import { Project, Task, Worker } from '../../src/types';

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

describe('Worker Capacity Conflict Detector Suite', () => {
  test('A. 33% + 33% = 66% (<= 100%) produces 0 conflicts', () => {
    const task1: Partial<Task> = {
      id: 't1',
      project_id: 'prj_a',
      task_name: 'Task 1',
      start_date: '2026-07-06', // Monday
      end_date: '2026-07-06',
      schedule_status: 'SCHEDULED',
      assignees: [{ worker_id: 'wrk_test', name: 'Test Worker', assignment_role: 'PRIMARY', allocation_percent: 33 }],
    };
    const task2: Partial<Task> = {
      id: 't2',
      project_id: 'prj_a',
      task_name: 'Task 2',
      start_date: '2026-07-06',
      end_date: '2026-07-06',
      schedule_status: 'SCHEDULED',
      assignees: [{ worker_id: 'wrk_test', name: 'Test Worker', assignment_role: 'PRIMARY', allocation_percent: 33 }],
    };

    const res = detectWorkerCapacityConflicts([mockProjectA], [task1 as Task, task2 as Task], [mockWorker], [], []);
    expect(res.conflict_count).toBe(0);
    expect(res.groups.length).toBe(0);
  });

  test('B. 34% + 33% + 33% = 100% (<= 100%) produces 0 conflicts', () => {
    const task1: Partial<Task> = {
      id: 't1',
      project_id: 'prj_a',
      start_date: '2026-07-06',
      end_date: '2026-07-06',
      schedule_status: 'SCHEDULED',
      assignees: [{ worker_id: 'wrk_test', name: 'Test Worker', assignment_role: 'PRIMARY', allocation_percent: 34 }],
    };
    const task2: Partial<Task> = {
      id: 't2',
      project_id: 'prj_a',
      start_date: '2026-07-06',
      end_date: '2026-07-06',
      schedule_status: 'SCHEDULED',
      assignees: [{ worker_id: 'wrk_test', name: 'Test Worker', assignment_role: 'CO_ASSIGNEE', allocation_percent: 33 }],
    };
    const task3: Partial<Task> = {
      id: 't3',
      project_id: 'prj_a',
      start_date: '2026-07-06',
      end_date: '2026-07-06',
      schedule_status: 'SCHEDULED',
      assignees: [{ worker_id: 'wrk_test', name: 'Test Worker', assignment_role: 'CO_ASSIGNEE', allocation_percent: 33 }],
    };

    const res = detectWorkerCapacityConflicts([mockProjectA], [task1 as Task, task2 as Task, task3 as Task], [mockWorker], [], []);
    expect(res.conflict_count).toBe(0);
  });

  test('C. 60% + 50% = 110% (> 100%) produces 1 conflict group', () => {
    const task1: Partial<Task> = {
      id: 't1',
      project_id: 'prj_a',
      start_date: '2026-07-06',
      end_date: '2026-07-06',
      schedule_status: 'SCHEDULED',
      assignees: [{ worker_id: 'wrk_test', name: 'Test Worker', assignment_role: 'PRIMARY', allocation_percent: 60 }],
    };
    const task2: Partial<Task> = {
      id: 't2',
      project_id: 'prj_a',
      start_date: '2026-07-06',
      end_date: '2026-07-06',
      schedule_status: 'SCHEDULED',
      assignees: [{ worker_id: 'wrk_test', name: 'Test Worker', assignment_role: 'CO_ASSIGNEE', allocation_percent: 50 }],
    };

    const res = detectWorkerCapacityConflicts([mockProjectA], [task1 as Task, task2 as Task], [mockWorker], [], []);
    expect(res.conflict_count).toBe(1);
    expect(res.groups[0].max_total_allocation).toBe(110);
    expect(res.groups[0].excess_percent).toBe(10);
    expect(res.groups[0].scope).toBe('WITHIN_PROJECT');
  });

  test('D & E. 3 contiguous days of 110% allocation produce 1 conflict group (raw days = 3)', () => {
    const task1: Partial<Task> = {
      id: 't1',
      project_id: 'prj_a',
      start_date: '2026-07-06', // Mon
      end_date: '2026-07-08',   // Wed
      schedule_status: 'SCHEDULED',
      assignees: [{ worker_id: 'wrk_test', name: 'Test Worker', assignment_role: 'PRIMARY', allocation_percent: 60 }],
    };
    const task2: Partial<Task> = {
      id: 't2',
      project_id: 'prj_a',
      start_date: '2026-07-06',
      end_date: '2026-07-08',
      schedule_status: 'SCHEDULED',
      assignees: [{ worker_id: 'wrk_test', name: 'Test Worker', assignment_role: 'CO_ASSIGNEE', allocation_percent: 50 }],
    };

    const res = detectWorkerCapacityConflicts([mockProjectA], [task1 as Task, task2 as Task], [mockWorker], [], []);
    expect(res.conflict_count).toBe(1);
    expect(res.raw_entry_count).toBe(3);
    expect(res.groups[0].overlap_start_date).toBe('2026-07-06');
    expect(res.groups[0].overlap_end_date).toBe('2026-07-08');
  });

  test('F. UNSCHEDULED task is excluded from capacity conflicts', () => {
    const task1: Partial<Task> = {
      id: 't1',
      project_id: 'prj_a',
      start_date: '2026-07-06',
      end_date: '2026-07-06',
      schedule_status: 'SCHEDULED',
      assignees: [{ worker_id: 'wrk_test', name: 'Test Worker', assignment_role: 'PRIMARY', allocation_percent: 70 }],
    };
    const task2: Partial<Task> = {
      id: 't2',
      project_id: 'prj_a',
      start_date: '2026-07-06',
      end_date: '2026-07-06',
      schedule_status: 'UNSCHEDULED',
      assignees: [{ worker_id: 'wrk_test', name: 'Test Worker', assignment_role: 'CO_ASSIGNEE', allocation_percent: 50 }],
    };

    const res = detectWorkerCapacityConflicts([mockProjectA], [task1 as Task, task2 as Task], [mockWorker], [], []);
    expect(res.conflict_count).toBe(0);
  });

  test('G. Overlap on worker off-days only (Saturday/Sunday for MON_FRI) produces 0 conflicts', () => {
    const task1: Partial<Task> = {
      id: 't1',
      project_id: 'prj_a',
      start_date: '2026-07-11', // Sat
      end_date: '2026-07-12',   // Sun
      schedule_status: 'SCHEDULED',
      assignees: [{ worker_id: 'wrk_test', name: 'Test Worker', assignment_role: 'PRIMARY', allocation_percent: 70 }],
    };
    const task2: Partial<Task> = {
      id: 't2',
      project_id: 'prj_a',
      start_date: '2026-07-11',
      end_date: '2026-07-12',
      schedule_status: 'SCHEDULED',
      assignees: [{ worker_id: 'wrk_test', name: 'Test Worker', assignment_role: 'CO_ASSIGNEE', allocation_percent: 50 }],
    };

    const res = detectWorkerCapacityConflicts([mockProjectA], [task1 as Task, task2 as Task], [mockWorker], [], []);
    expect(res.conflict_count).toBe(0);
  });

  test('H. Cross-project overlap 70% + 50% produces 1 group with scope = CROSS_PROJECT', () => {
    const task1: Partial<Task> = {
      id: 't1',
      project_id: 'prj_a',
      start_date: '2026-07-06',
      end_date: '2026-07-06',
      schedule_status: 'SCHEDULED',
      assignees: [{ worker_id: 'wrk_test', name: 'Test Worker', assignment_role: 'PRIMARY', allocation_percent: 70 }],
    };
    const task2: Partial<Task> = {
      id: 't2',
      project_id: 'prj_b',
      start_date: '2026-07-06',
      end_date: '2026-07-06',
      schedule_status: 'SCHEDULED',
      assignees: [{ worker_id: 'wrk_test', name: 'Test Worker', assignment_role: 'PRIMARY', allocation_percent: 50 }],
    };

    const res = detectWorkerCapacityConflicts(
      [mockProjectA, mockProjectB],
      [task1 as Task, task2 as Task],
      [mockWorker],
      [],
      []
    );
    expect(res.conflict_count).toBe(1);
    expect(res.groups[0].scope).toBe('CROSS_PROJECT');
    expect(res.groups[0].max_total_allocation).toBe(120);
  });
});
