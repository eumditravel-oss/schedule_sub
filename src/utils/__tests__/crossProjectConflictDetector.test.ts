// src/utils/__tests__/crossProjectConflictDetector.test.ts
import { describe, it, expect } from 'vitest';
import { detectCrossProjectWorkerConflicts, generateConflictFingerprint } from '../crossProjectConflictDetector';
import { Project, Task, Worker } from '../../types';

describe('Cross-Project Conflict Engine (V2 PRIMARY-Only)', () => {
  const mockWorkers: Worker[] = [
    {
      id: 'wrk_03',
      name: 'Thanh Phuong',
      country_code: 'VN',
      workweek_profile: 'MON_SAT',
      is_active: 1,
      sort_order: 1,
      can_manage_country_calendar: 1,
    },
    {
      id: 'wrk_04',
      name: 'Manh Cuong',
      country_code: 'VN',
      workweek_profile: 'MON_SAT',
      is_active: 1,
      sort_order: 2,
      can_manage_country_calendar: 0,
    },
  ];

  const mockActiveProjects: Project[] = [
    {
      id: 'prj_01',
      name: 'CONCOST-HUB',
      status: 'ACTIVE',
      start_date: '2026-05-01',
      end_date: '2026-05-31',
    } as any,
    {
      id: 'prj_02',
      name: 'FACTORY-EXPANSION',
      status: 'ACTIVE',
      start_date: '2026-05-01',
      end_date: '2026-05-31',
    } as any,
    {
      id: 'prj_completed',
      name: 'COMPLETED-PROJECT',
      status: 'COMPLETED',
      start_date: '2026-05-01',
      end_date: '2026-05-31',
    } as any,
  ];

  it('CASE 1: PRIMARY A <-> PRIMARY B overlap generates Conflict = 1', () => {
    const tasks: Task[] = [
      {
        id: 'tsk_01',
        project_id: 'prj_01',
        task_name: 'Task 1',
        start_date: '2026-05-11',
        end_date: '2026-05-15',
        schedule_status: 'SCHEDULED',
        primary_worker_id: 'wrk_03',
        worker_name: 'Thanh Phuong',
        assignees: [{ worker_id: 'wrk_03', name: 'Thanh Phuong', assignment_role: 'PRIMARY', allocation_percent: 100 }],
      } as any,
      {
        id: 'tsk_02',
        project_id: 'prj_02',
        task_name: 'Task 2',
        start_date: '2026-05-11',
        end_date: '2026-05-15',
        schedule_status: 'SCHEDULED',
        primary_worker_id: 'wrk_03',
        worker_name: 'Thanh Phuong',
        assignees: [{ worker_id: 'wrk_03', name: 'Thanh Phuong', assignment_role: 'PRIMARY', allocation_percent: 100 }],
      } as any,
    ];

    const result = detectCrossProjectWorkerConflicts(mockActiveProjects, tasks, mockWorkers);
    expect(result.total_conflict_count).toBe(1);
    expect(result.groups[0].policy_version).toBe('cross_project_v2_primary_only');
  });

  it('CASE 2: PRIMARY A <-> SUPPORT B overlap generates Conflict = 0', () => {
    const tasks: Task[] = [
      {
        id: 'tsk_01',
        project_id: 'prj_01',
        task_name: 'Task 1',
        start_date: '2026-05-11',
        end_date: '2026-05-15',
        schedule_status: 'SCHEDULED',
        primary_worker_id: 'wrk_03',
        worker_name: 'Thanh Phuong',
        assignees: [{ worker_id: 'wrk_03', name: 'Thanh Phuong', assignment_role: 'PRIMARY', allocation_percent: 100 }],
      } as any,
      {
        id: 'tsk_02',
        project_id: 'prj_02',
        task_name: 'Task 2',
        start_date: '2026-05-11',
        end_date: '2026-05-15',
        schedule_status: 'SCHEDULED',
        primary_worker_id: 'wrk_04',
        worker_name: 'Manh Cuong',
        assignees: [
          { worker_id: 'wrk_04', name: 'Manh Cuong', assignment_role: 'PRIMARY', allocation_percent: 100 },
          { worker_id: 'wrk_03', name: 'Thanh Phuong', assignment_role: 'CO_ASSIGNEE', allocation_percent: 0 },
        ],
      } as any,
    ];

    const result = detectCrossProjectWorkerConflicts(mockActiveProjects, tasks, mockWorkers);
    expect(result.total_conflict_count).toBe(0);
  });

  it('CASE 4: SUPPORT <-> SUPPORT overlap generates Conflict = 0', () => {
    const tasks: Task[] = [
      {
        id: 'tsk_01',
        project_id: 'prj_01',
        task_name: 'Task 1',
        start_date: '2026-05-11',
        end_date: '2026-05-15',
        schedule_status: 'SCHEDULED',
        primary_worker_id: 'wrk_04',
        worker_name: 'Manh Cuong',
        assignees: [
          { worker_id: 'wrk_04', name: 'Manh Cuong', assignment_role: 'PRIMARY', allocation_percent: 100 },
          { worker_id: 'wrk_03', name: 'Thanh Phuong', assignment_role: 'CO_ASSIGNEE', allocation_percent: 0 },
        ],
      } as any,
      {
        id: 'tsk_02',
        project_id: 'prj_02',
        task_name: 'Task 2',
        start_date: '2026-05-11',
        end_date: '2026-05-15',
        schedule_status: 'SCHEDULED',
        primary_worker_id: 'wrk_01',
        worker_name: 'Yoo Jong-wook',
        assignees: [
          { worker_id: 'wrk_01', name: 'Yoo Jong-wook', assignment_role: 'PRIMARY', allocation_percent: 100 },
          { worker_id: 'wrk_03', name: 'Thanh Phuong', assignment_role: 'CO_ASSIGNEE', allocation_percent: 0 },
        ],
      } as any,
    ];

    const result = detectCrossProjectWorkerConflicts(mockActiveProjects, tasks, mockWorkers);
    expect(result.total_conflict_count).toBe(0);
  });

  it('CASE 5: Support allocation_percent = 0 is preserved and never converted to 100', () => {
    const tasks: Task[] = [
      {
        id: 'tsk_01',
        project_id: 'prj_01',
        task_name: 'Task 1',
        start_date: '2026-05-11',
        end_date: '2026-05-15',
        schedule_status: 'SCHEDULED',
        primary_worker_id: 'wrk_03',
        worker_name: 'Thanh Phuong',
        assignees: [{ worker_id: 'wrk_03', name: 'Thanh Phuong', assignment_role: 'PRIMARY', allocation_percent: 100 }],
      } as any,
    ];

    const result = detectCrossProjectWorkerConflicts(mockActiveProjects, tasks, mockWorkers);
    expect(result.total_conflict_count).toBe(0);
  });

  it('CASE 6: Overlap with COMPLETED Project generates Current Hard Conflict = 0', () => {
    const tasks: Task[] = [
      {
        id: 'tsk_01',
        project_id: 'prj_01',
        task_name: 'Task Active',
        start_date: '2026-05-11',
        end_date: '2026-05-15',
        schedule_status: 'SCHEDULED',
        primary_worker_id: 'wrk_03',
        worker_name: 'Thanh Phuong',
        assignees: [{ worker_id: 'wrk_03', name: 'Thanh Phuong', assignment_role: 'PRIMARY', allocation_percent: 100 }],
      } as any,
      {
        id: 'tsk_02',
        project_id: 'prj_completed',
        task_name: 'Task Completed',
        start_date: '2026-05-11',
        end_date: '2026-05-15',
        schedule_status: 'SCHEDULED',
        primary_worker_id: 'wrk_03',
        worker_name: 'Thanh Phuong',
        assignees: [{ worker_id: 'wrk_03', name: 'Thanh Phuong', assignment_role: 'PRIMARY', allocation_percent: 100 }],
      } as any,
    ];

    const result = detectCrossProjectWorkerConflicts(mockActiveProjects, tasks, mockWorkers);
    expect(result.total_conflict_count).toBe(0);
  });

  it('CASE 7: Same PIC across distinct projects but NO date overlap generates Conflict = 0', () => {
    const tasks: Task[] = [
      {
        id: 'tsk_01',
        project_id: 'prj_01',
        task_name: 'Task May Early',
        start_date: '2026-05-01',
        end_date: '2026-05-05',
        schedule_status: 'SCHEDULED',
        primary_worker_id: 'wrk_03',
        worker_name: 'Thanh Phuong',
        assignees: [{ worker_id: 'wrk_03', name: 'Thanh Phuong', assignment_role: 'PRIMARY', allocation_percent: 100 }],
      } as any,
      {
        id: 'tsk_02',
        project_id: 'prj_02',
        task_name: 'Task May Late',
        start_date: '2026-05-10',
        end_date: '2026-05-15',
        schedule_status: 'SCHEDULED',
        primary_worker_id: 'wrk_03',
        worker_name: 'Thanh Phuong',
        assignees: [{ worker_id: 'wrk_03', name: 'Thanh Phuong', assignment_role: 'PRIMARY', allocation_percent: 100 }],
      } as any,
    ];

    const result = detectCrossProjectWorkerConflicts(mockActiveProjects, tasks, mockWorkers);
    expect(result.total_conflict_count).toBe(0);
  });
});
