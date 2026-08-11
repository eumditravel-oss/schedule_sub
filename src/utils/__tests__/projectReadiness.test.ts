// src/utils/__tests__/projectReadiness.test.ts
import { describe, it, expect } from 'vitest';
import { calculateProjectReadiness, isProjectOverdue } from '../projectReadiness';
import { Project, Task, Worker } from '../../types';

describe('Project Readiness & Overdue Engine (CASE A ~ F Verification)', () => {
  const referenceToday = '2026-08-11';

  const dummyWorker: Worker = {
    id: 'wrk_01',
    name: 'Thanh Phuong',
    country_code: 'VN',
    workweek_profile: 'MON_SAT',
    access_role: 'EDITOR',
    is_active: 1,
    sort_order: 1,
  };

  it('CASE A: start=2026-09-01, end=2026-10-30, status=scheduled, progress=0 -> 기한 경과 없음', () => {
    const project: Project = {
      id: 'prj_case_a',
      name: 'KSRCV2 - ZWCAD 2026',
      start_date: '2026-09-01',
      end_date: '2026-10-30',
      progress: 0,
      actual_progress: 0,
      status: 'ACTIVE',
    };

    expect(isProjectOverdue(project, referenceToday)).toBe(false);
    const readiness = calculateProjectReadiness(project, [], [], [dummyWorker]);
    expect(readiness.badge_text_ko).not.toBe('기한 경과');
  });

  it('CASE B: start=2026-08-05, end=2026-11-10, status=in_progress, progress=4 -> 기한 경과 없음', () => {
    const project: Project = {
      id: 'prj_case_b',
      name: 'GROUPWARE - 그룹웨어 시스템 개발',
      start_date: '2026-08-05',
      end_date: '2026-11-10',
      progress: 4,
      actual_progress: 4,
      status: 'ACTIVE',
    };

    expect(isProjectOverdue(project, referenceToday)).toBe(false);

    // Subtask delayed in GROUPWARE should be labeled as 지연 작업, NOT project 기한 경과
    const delayedSubtask: Task = {
      id: 'tsk_gw_01',
      project_id: 'prj_case_b',
      task_name: 'Analysis',
      worker_name: 'Thanh Phuong',
      start_date: '2026-08-05',
      end_date: '2026-08-08',
      schedule_status: 'SCHEDULED',
      primary_worker_id: 'wrk_01',
      progress: 10,
      actual_progress: 10,
    };

    const readiness = calculateProjectReadiness(project, [delayedSubtask], [], [dummyWorker]);
    expect(readiness.badge_text_ko).toBe('정상');
    expect(readiness.status).toBe('READY');
  });

  it('CASE C: end=2026-08-11, 미완료 (progress=50) -> 기한 경과 없음', () => {
    const project: Project = {
      id: 'prj_case_c',
      name: 'Ending Today Project',
      start_date: '2026-08-01',
      end_date: '2026-08-11',
      progress: 50,
      actual_progress: 50,
      status: 'ACTIVE',
    };

    expect(isProjectOverdue(project, referenceToday)).toBe(false);
    const readiness = calculateProjectReadiness(project, [], [], [dummyWorker]);
    expect(readiness.badge_text_ko).not.toBe('기한 경과');
  });

  it('CASE D: end=2026-08-10, 미완료 (progress=50) -> 기한 경과 표시', () => {
    const project: Project = {
      id: 'prj_case_d',
      name: 'Expired Yesterday Project',
      start_date: '2026-08-01',
      end_date: '2026-08-10',
      progress: 50,
      actual_progress: 50,
      status: 'ACTIVE',
    };

    expect(isProjectOverdue(project, referenceToday)).toBe(true);
    const readiness = calculateProjectReadiness(project, [], [], [dummyWorker]);
    expect(readiness.badge_text_ko).toBe('기한 경과');
    expect(readiness.status).toBe('RISK');
  });

  it('CASE E: end=2026-08-10, status=completed, actualProgress=100 -> 기한 경과 없음', () => {
    const project: Project = {
      id: 'prj_case_e',
      name: 'Completed Past Project',
      start_date: '2026-08-01',
      end_date: '2026-08-10',
      progress: 100,
      actual_progress: 100,
      status: 'COMPLETED',
    };

    expect(isProjectOverdue(project, referenceToday)).toBe(false);
    const readiness = calculateProjectReadiness(project, [], [], [dummyWorker]);
    expect(readiness.badge_text_ko).not.toBe('기한 경과');
    expect(readiness.status).toBe('READY');
  });

  it('CASE F: due/end date = null -> 기한 경과 없음, 오류 없음', () => {
    const project: Project = {
      id: 'prj_case_f',
      name: 'No End Date Project',
      start_date: '2026-08-01',
      end_date: undefined as any,
      progress: 0,
      actual_progress: 0,
      status: 'ACTIVE',
    };

    expect(isProjectOverdue(project, referenceToday)).toBe(false);
    expect(() => {
      const readiness = calculateProjectReadiness(project, [], [], [dummyWorker]);
      expect(readiness.badge_text_ko).not.toBe('기한 경과');
    }).not.toThrow();
  });
});
