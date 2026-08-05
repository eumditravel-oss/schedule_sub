// tests/taskMultiAssigneesProgress.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateTaskProgressServer,
  calculateProjectProgressServer,
  detectWorkerTaskConflictsServer,
} from '../worker/services/progressAndConflictServer';

describe('Multi-Assignees & Progress Mode Unit Tests', () => {
  const mockWorkers = [
    { id: 'w1', name: '박용진', country_code: 'KR', workweek_profile: 'MON_FRI', is_active: 1, access_role: 'EDITOR' },
    { id: 'w2', name: 'Thanh Phuong', country_code: 'VN', workweek_profile: 'MON_SAT', is_active: 1, access_role: 'EDITOR' },
    { id: 'w3', name: 'Manh Cuong', country_code: 'VN', workweek_profile: 'MON_FRI', is_active: 1, access_role: 'EDITOR' },
    { id: 'w4', name: 'CEO', country_code: 'KR', workweek_profile: 'MON_FRI', is_active: 1, access_role: 'VIEWER' },
  ];

  it('1. AUTO_TIME mode calculates 100% actual progress for past completed schedule', () => {
    const task = {
      id: 't1',
      start_date: '2026-07-01',
      end_date: '2026-07-10',
      progress_mode: 'AUTO_TIME',
      assignees: [
        { worker_id: 'w1', name: '박용진', assignment_role: 'PRIMARY', allocation_percent: 100 },
      ],
    };

    const metrics = calculateTaskProgressServer(task, mockWorkers, [], [], 'ACTIVE', {}, '2026-08-01');
    expect(metrics.planned_progress).toBe(100);
    expect(metrics.actual_progress).toBe(100);
    expect(metrics.actual_progress_source).toBe('AUTO_TIME');
    expect(metrics.schedule_state).toBe('COMPLETION_REVIEW');
  });

  it('2. STATUS_BASED mode calculates actual progress based on COMPLETED daily statuses', () => {
    const task = {
      id: 't2',
      start_date: '2026-07-06', // Mon
      end_date: '2026-07-10',   // Fri (5 working days)
      progress_mode: 'STATUS_BASED',
      assignees: [
        { worker_id: 'w1', name: '박용진', assignment_role: 'PRIMARY', allocation_percent: 100 },
      ],
    };

    const dailyStatuses = {
      '2026-07-06': 'COMPLETED',
      '2026-07-07': 'COMPLETED',
    };

    const metrics = calculateTaskProgressServer(task, mockWorkers, [], [], 'ACTIVE', dailyStatuses, '2026-08-01');
    expect(metrics.planned_working_days).toBe(5);
    expect(metrics.completed_working_days).toBe(2);
    expect(metrics.actual_progress).toBe(40); // 2 / 5 * 100
    expect(metrics.actual_progress_source).toBe('STATUS_BASED');
  });

  it('3. ANY_AVAILABLE policy counts Saturday as working day for mixed KR(MON_FRI) + VN(MON_SAT) assignees', () => {
    const task = {
      id: 't3',
      start_date: '2026-08-08', // Saturday
      end_date: '2026-08-08',
      availability_policy: 'ANY_AVAILABLE',
      assignees: [
        { worker_id: 'w1', name: '박용진', country_code: 'KR', assignment_role: 'PRIMARY', allocation_percent: 50 },
        { worker_id: 'w2', name: 'Thanh Phuong', country_code: 'VN', assignment_role: 'CO_ASSIGNEE', allocation_percent: 50 },
      ],
    };

    const metrics = calculateTaskProgressServer(task, mockWorkers, [], [], 'ACTIVE', {}, '2026-08-01');
    expect(metrics.planned_working_days).toBe(1);
  });

  it('4. ALL_REQUIRED policy rejects Saturday when KR worker is off', () => {
    const task = {
      id: 't4',
      start_date: '2026-08-08', // Saturday
      end_date: '2026-08-08',
      availability_policy: 'ALL_REQUIRED',
      assignees: [
        { worker_id: 'w1', name: '박용진', country_code: 'KR', assignment_role: 'PRIMARY', allocation_percent: 50 },
        { worker_id: 'w2', name: 'Thanh Phuong', country_code: 'VN', assignment_role: 'CO_ASSIGNEE', allocation_percent: 50 },
      ],
    };

    const metrics = calculateTaskProgressServer(task, mockWorkers, [], [], 'ACTIVE', {}, '2026-08-01');
    expect(metrics.planned_working_days).toBe(0);
  });

  it('5. Project weighted progress is correctly calculated without duplicate assignee weights', () => {
    const project = { id: 'p1', start_date: '2026-07-01', end_date: '2026-08-31', status: 'ACTIVE' };
    const tasks = [
      {
        id: 't1',
        start_date: '2026-07-01',
        end_date: '2026-07-05',
        planned_working_days: 3,
        progress_mode: 'AUTO_TIME',
        assignees: [
          { worker_id: 'w1', name: '박용진', allocation_percent: 50 },
          { worker_id: 'w2', name: 'Thanh Phuong', allocation_percent: 50 },
        ],
      },
      {
        id: 't2',
        start_date: '2026-08-10',
        end_date: '2026-08-14',
        planned_working_days: 5,
        progress_mode: 'STATUS_BASED',
        assignees: [
          { worker_id: 'w3', name: 'Manh Cuong', allocation_percent: 100 },
        ],
      },
    ];

    const pMetrics = calculateProjectProgressServer(project, tasks, mockWorkers, [], [], {}, '2026-08-01');
    expect(pMetrics.auto_progress_task_count).toBe(1);
    expect(pMetrics.status_progress_task_count).toBe(1);
    expect(pMetrics.planned_working_days).toBe(9); // 4 + 5
  });

  it('6. Conflict detection inspects multi-assignees correctly', () => {
    const target = {
      id: 't10',
      worker_name: 'Thanh Phuong',
      start_date: '2026-08-03',
      end_date: '2026-08-07',
      project_id: 'p2',
      assignees: [
        { worker_id: 'w2', name: 'Thanh Phuong', allocation_percent: 100 },
      ],
    };

    const allProjects = [{ id: 'p1', status: 'ACTIVE', name: 'Project Alpha' }];
    const allTasks = [
      {
        id: 't1',
        project_id: 'p1',
        start_date: '2026-08-01',
        end_date: '2026-08-10',
        assignees: [{ worker_id: 'w2', name: 'Thanh Phuong', allocation_percent: 100 }],
      },
    ];

    const conflicts = detectWorkerTaskConflictsServer(target, allProjects, allTasks, mockWorkers, [], []);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0].worker_id).toBe('w2');
  });
});
