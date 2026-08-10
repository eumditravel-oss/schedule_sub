// tests/taskMultiAssigneesProgress.test.ts
import { describe, it, expect } from 'vitest';
import {
  calculateTaskProgressServer,
  calculateProjectProgressServer,
  detectWorkerTaskConflictsServer,
} from '../worker/services/progressAndConflictServer';

describe('Multi-Assignees & Progress Mode Unit Tests', () => {
  const mockWorkers = [
    { id: 'w1', name: '박용진', country_code: 'KR', workweek_profile: 'MON_FRI', is_active: 1, access_role: 'EDITOR' },
    { id: 'w2', name: 'Thanh Phuong', country_code: 'VN', workweek_profile: 'MON_SAT', is_active: 1, access_role: 'EDITOR' },
    { id: 'w3', name: 'Manh Cuong', country_code: 'VN', workweek_profile: 'MON_SAT', is_active: 1, access_role: 'EDITOR' },
  ];

  it('1. Calculates AUTO_TIME task progress based on PRIMARY worker calendar only', () => {
    const task = {
      id: 't1',
      start_date: '2026-08-03', // Mon
      end_date: '2026-08-07', // Fri
      progress_mode: 'AUTO_TIME',
      primary_worker_id: 'w1',
      assignees: [
        { worker_id: 'w1', name: '박용진', country_code: 'KR', assignment_role: 'PRIMARY', allocation_percent: 100 },
        { worker_id: 'w2', name: 'Thanh Phuong', country_code: 'VN', assignment_role: 'CO_ASSIGNEE', allocation_percent: 0 },
      ],
    };

    const metrics = calculateTaskProgressServer(task, mockWorkers, [], [], 'ACTIVE', {}, '2026-08-05');
    expect(metrics.planned_working_days).toBe(5);
    expect(metrics.actual_progress).toBe(40); // 2 elapsed days (Mon, Tue) / 5 = 40%
    expect(metrics.actual_progress_source).toBe('AUTO_TIME');
  });

  it('2. Calculates STATUS_BASED task progress using daily statuses', () => {
    const task = {
      id: 't2',
      start_date: '2026-08-03',
      end_date: '2026-08-07',
      progress_mode: 'STATUS_BASED',
      primary_worker_id: 'w1',
      assignees: [
        { worker_id: 'w1', name: '박용진', country_code: 'KR', assignment_role: 'PRIMARY', allocation_percent: 100 },
      ],
    };

    const dailyStatuses = {
      '2026-08-03': 'COMPLETED',
      '2026-08-04': 'COMPLETED',
    };

    const metrics = calculateTaskProgressServer(task, mockWorkers, [], [], 'ACTIVE', dailyStatuses, '2026-08-01');
    expect(metrics.planned_working_days).toBe(5);
    expect(metrics.completed_working_days).toBe(2);
    expect(metrics.actual_progress).toBe(40); // 2 / 5 * 100
    expect(metrics.actual_progress_source).toBe('STATUS_BASED');
  });

  it('3. V2 Rule: PRIMARY worker calendar ONLY (Saturday=0 for KR PIC regardless of VN Support)', () => {
    const task = {
      id: 't3',
      start_date: '2026-08-08', // Saturday
      end_date: '2026-08-08',
      availability_policy: 'ANY_AVAILABLE',
      primary_worker_id: 'w1',
      assignees: [
        { worker_id: 'w1', name: '박용진', country_code: 'KR', assignment_role: 'PRIMARY', allocation_percent: 100 },
        { worker_id: 'w2', name: 'Thanh Phuong', country_code: 'VN', assignment_role: 'CO_ASSIGNEE', allocation_percent: 0 },
      ],
    };

    const metrics = calculateTaskProgressServer(task, mockWorkers, [], [], 'ACTIVE', {}, '2026-08-01');
    // PRIMARY is KR worker (w1). Saturday is non-working day for KR worker. Support worker w2 calendar has 0 impact.
    expect(metrics.planned_working_days).toBe(0);
  });

  it('4. ALL_REQUIRED policy evaluates PRIMARY worker calendar in V2 mode', () => {
    const task = {
      id: 't4',
      start_date: '2026-08-08', // Saturday
      end_date: '2026-08-08',
      availability_policy: 'ALL_REQUIRED',
      primary_worker_id: 'w1',
      assignees: [
        { worker_id: 'w1', name: '박용진', country_code: 'KR', assignment_role: 'PRIMARY', allocation_percent: 100 },
        { worker_id: 'w2', name: 'Thanh Phuong', country_code: 'VN', assignment_role: 'CO_ASSIGNEE', allocation_percent: 0 },
      ],
    };

    const metrics = calculateTaskProgressServer(task, mockWorkers, [], [], 'ACTIVE', {}, '2026-08-01');
    expect(metrics.planned_working_days).toBe(0);
  });

  it('5. Project weighted progress is correctly calculated using PRIMARY worker calendar', () => {
    const project = { id: 'p1', start_date: '2026-07-01', end_date: '2026-08-31', status: 'ACTIVE' };
    const tasks = [
      {
        id: 't1',
        start_date: '2026-07-01',
        end_date: '2026-07-05',
        progress_mode: 'AUTO_TIME',
        primary_worker_id: 'w1',
        assignees: [
          { worker_id: 'w1', name: '박용진', assignment_role: 'PRIMARY', allocation_percent: 100 },
          { worker_id: 'w2', name: 'Thanh Phuong', assignment_role: 'CO_ASSIGNEE', allocation_percent: 0 },
        ],
      },
      {
        id: 't2',
        start_date: '2026-08-10',
        end_date: '2026-08-14',
        progress_mode: 'STATUS_BASED',
        primary_worker_id: 'w3',
        assignees: [
          { worker_id: 'w3', name: 'Manh Cuong', assignment_role: 'PRIMARY', allocation_percent: 100 },
        ],
      },
    ];

    const pMetrics = calculateProjectProgressServer(project, tasks, mockWorkers, [], [], {}, '2026-08-01');
    expect(pMetrics.auto_progress_task_count).toBe(1);
    expect(pMetrics.status_progress_task_count).toBe(1);
    expect(pMetrics.planned_working_days).toBe(8); // 3 (w1: Wed,Thu,Fri) + 5 (w3: Mon..Fri)
  });

  it('6. Conflict detection inspects PRIMARY assignees and ignores Support-only overlaps', () => {
    const target = {
      id: 't10',
      worker_name: 'Thanh Phuong',
      start_date: '2026-08-10',
      end_date: '2026-08-12',
      assignees: [
        { worker_id: 'w2', name: 'Thanh Phuong', assignment_role: 'CO_ASSIGNEE', allocation_percent: 0 },
      ],
    };

    const allProjects = [{ id: 'p1', status: 'ACTIVE' }];
    const allTasks = [
      {
        id: 't11',
        project_id: 'p1',
        task_name: 'Existing Task',
        worker_name: 'Thanh Phuong',
        start_date: '2026-08-10',
        end_date: '2026-08-12',
        assignees: [{ worker_id: 'w2', name: 'Thanh Phuong', assignment_role: 'PRIMARY', allocation_percent: 100 }],
      },
    ];

    // Support-only target assignment does not produce hard worker schedule conflict
    const conflicts = detectWorkerTaskConflictsServer(target, allProjects, allTasks, mockWorkers, [], []);
    expect(conflicts.length).toBe(0);
  });
});
