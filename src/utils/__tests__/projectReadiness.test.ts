// src/utils/__tests__/projectReadiness.test.ts
import { describe, it, expect } from 'vitest';
import { calculateProjectReadiness } from '../projectReadiness';
import { Project, Task, ProjectWorkerAllocation, Worker } from '../../types';

describe('Project Readiness Audit Engine', () => {
  const dummyProject: Project = {
    id: 'prj_01',
    name: 'Readiness Test Project',
    start_date: '2026-08-01',
    end_date: '2026-08-31',
    progress: 0,
    status: 'ACTIVE',
  };

  const dummyWorker: Worker = {
    id: 'wrk_01',
    name: 'Thanh Phuong',
    country_code: 'VN',
    workweek_profile: 'MON_SAT',
    access_role: 'EDITOR',
    is_active: 1,
    sort_order: 1,
  };

  it('1. Returns READY status when all tasks, PICs, allocations, and worker profiles are valid', () => {
    const validTask: Task = {
      id: 'tsk_01',
      project_id: 'prj_01',
      worker_name: 'Thanh Phuong',
      task_name: 'Database Migration',
      start_date: '2026-08-05',
      end_date: '2026-08-10',
      schedule_status: 'SCHEDULED',
      primary_worker_id: 'wrk_01',
      progress: 50,
      actual_progress: 50,
      assignees: [
        {
          worker_id: 'wrk_01',
          name: 'Thanh Phuong',
          assignment_role: 'PRIMARY',
          allocation_percent: 100,
        },
      ],
    };

    const validAlloc: ProjectWorkerAllocation = {
      id: 'pwa_01',
      project_id: 'prj_01',
      worker_id: 'wrk_01',
      allocation_percent: 80,
    };

    const readiness = calculateProjectReadiness(dummyProject, [validTask], [validAlloc], [dummyWorker]);
    expect(readiness.status).toBe('READY');
    expect(readiness.setup_count).toBe(0);
    expect(readiness.risk_count).toBe(0);
    expect(readiness.issues).toHaveLength(0);
  });

  it('2. Returns NEEDS_SETUP status when worker allocation is unset or PIC is missing', () => {
    const unallocatedTask: Task = {
      id: 'tsk_02',
      project_id: 'prj_01',
      worker_name: 'Thanh Phuong',
      task_name: 'Frontend Setup',
      start_date: '2026-08-05',
      end_date: '2026-08-10',
      schedule_status: 'SCHEDULED',
      primary_worker_id: 'wrk_01',
      progress: 0,
      assignees: [
        {
          worker_id: 'wrk_01',
          name: 'Thanh Phuong',
          assignment_role: 'PRIMARY',
          allocation_percent: 100,
        },
      ],
    };

    // No allocation passed for wrk_01
    const readiness = calculateProjectReadiness(dummyProject, [unallocatedTask], [], [dummyWorker]);
    expect(readiness.status).toBe('NEEDS_SETUP');
    expect(readiness.setup_count).toBeGreaterThan(0);
    expect(readiness.issues.some((i) => i.type === 'ALLOCATION_UNSET')).toBe(true);
  });

  it('3. Returns RISK status when task schedule is outside project dates or overdue', () => {
    const overdueTask: Task = {
      id: 'tsk_03',
      project_id: 'prj_01',
      worker_name: 'Thanh Phuong',
      task_name: 'Expired API Task',
      start_date: '2026-08-01',
      end_date: '2026-08-03', // Past date relative to today 2026-08-08
      schedule_status: 'SCHEDULED',
      primary_worker_id: 'wrk_01',
      progress: 10,
      actual_progress: 10,
      assignees: [
        {
          worker_id: 'wrk_01',
          name: 'Thanh Phuong',
          assignment_role: 'PRIMARY',
          allocation_percent: 100,
        },
      ],
    };

    const validAlloc: ProjectWorkerAllocation = {
      id: 'pwa_01',
      project_id: 'prj_01',
      worker_id: 'wrk_01',
      allocation_percent: 80,
    };

    const readiness = calculateProjectReadiness(dummyProject, [overdueTask], [validAlloc], [dummyWorker]);
    expect(readiness.status).toBe('RISK');
    expect(readiness.risk_count).toBeGreaterThan(0);
    expect(readiness.issues.some((i) => i.type === 'OVERDUE_TASK')).toBe(true);
  });
});
