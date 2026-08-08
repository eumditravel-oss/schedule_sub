// src/utils/__tests__/projectReadiness.test.ts
import { describe, it, expect } from 'vitest';
import { calculateProjectReadiness } from '../projectReadiness';
import { Project, Task, ProjectWorkerAllocation, Worker } from '../../types';

describe('Project Readiness Audit Engine (Updated V2.2)', () => {
  const activeProject: Project = {
    id: 'prj_01',
    name: 'Active Test Project',
    start_date: '2026-08-01',
    end_date: '2026-08-31',
    progress: 0,
    status: 'ACTIVE',
  };

  const completedProject: Project = {
    id: 'prj_02',
    name: 'Completed Test Project',
    start_date: '2026-05-01',
    end_date: '2026-06-01',
    progress: 100,
    status: 'COMPLETED',
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

  it('1. ACTIVE Project: Overdue tasks generate meaningful badge text (기한 경과 22건) instead of raw raw count badge', () => {
    const overdueTask: Task = {
      id: 'tsk_01',
      project_id: 'prj_01',
      worker_name: 'Thanh Phuong',
      task_name: 'Expired Task',
      start_date: '2026-08-01',
      end_date: '2026-08-03',
      schedule_status: 'SCHEDULED',
      primary_worker_id: 'wrk_01',
      progress: 10,
      actual_progress: 10,
    };

    const validAlloc: ProjectWorkerAllocation = {
      id: 'a1',
      project_id: 'prj_01',
      worker_id: 'wrk_01',
      allocation_percent: 100,
    };

    const readiness = calculateProjectReadiness(activeProject, [overdueTask], [validAlloc], [dummyWorker]);
    expect(readiness.status).toBe('RISK');
    expect(readiness.badge_text_ko).toContain('기한 경과');
    expect(readiness.issue_groups['OVERDUE_TASK']).toBeDefined();
    expect(readiness.issue_groups['OVERDUE_TASK'].count).toBe(1);
  });

  it('2. COMPLETED Project: Ignores operational overdue risks, returning COMPLETED badge or single completion inconsistency risk', () => {
    const overdueTask: Task = {
      id: 'tsk_02',
      project_id: 'prj_02',
      worker_name: 'Thanh Phuong',
      task_name: 'Incomplete Task in Completed Project',
      start_date: '2026-05-01',
      end_date: '2026-05-10',
      schedule_status: 'SCHEDULED',
      primary_worker_id: 'wrk_01',
      progress: 50,
      actual_progress: 50,
      completion_confirmed: 0,
    };

    const readiness = calculateProjectReadiness(completedProject, [overdueTask], [], [dummyWorker]);
    // Does NOT generate OVERDUE_TASK issues
    expect(readiness.issue_groups['OVERDUE_TASK']).toBeUndefined();
    // Generates single PROJECT_COMPLETION_INCONSISTENCY risk
    expect(readiness.status).toBe('RISK');
    expect(readiness.badge_text_ko).toBe('완료 불일치 1');
    expect(readiness.issue_groups['PROJECT_COMPLETION_INCONSISTENCY']).toBeDefined();
    expect(readiness.issue_groups['PROJECT_COMPLETION_INCONSISTENCY'].count).toBe(1);
  });
});
