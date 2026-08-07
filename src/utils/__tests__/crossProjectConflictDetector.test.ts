// src/utils/__tests__/crossProjectConflictDetector.test.ts
import { describe, it, expect } from 'vitest';
import { detectCrossProjectWorkerConflicts, generateConflictFingerprint } from '../crossProjectConflictDetector';
import { Project, Task, Worker } from '../../types';

describe('Cross-Project Conflict Engine', () => {
  const mockWorkers: Worker[] = [
    {
      id: 'wrk_03',
      name: 'Thanh Phuong',
      country_code: 'VN',
      workweek_profile: 'MON_SAT',
      is_active: 1,
      can_manage_country_calendar: 1,
      can_manage_integrations: 0,
    },
    {
      id: 'wrk_04',
      name: 'Manh Cuong',
      country_code: 'VN',
      workweek_profile: 'MON_SAT',
      is_active: 1,
      can_manage_country_calendar: 0,
      can_manage_integrations: 0,
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
  ];

  it('returns 0 conflicts for parallel tasks assigned within the SAME project', () => {
    const tasksWithinSameProject: Task[] = [
      {
        id: 'tsk_01',
        project_id: 'prj_01',
        task_name: 'Sub Task A',
        start_date: '2026-05-11',
        end_date: '2026-05-15',
        schedule_status: 'SCHEDULED',
        primary_worker_id: 'wrk_03',
        worker_name: 'Thanh Phuong',
        assignees: [{ worker_id: 'wrk_03', name: 'Thanh Phuong', allocation_percent: 60 }],
      } as any,
      {
        id: 'tsk_02',
        project_id: 'prj_01',
        task_name: 'Sub Task B',
        start_date: '2026-05-11',
        end_date: '2026-05-15',
        schedule_status: 'SCHEDULED',
        primary_worker_id: 'wrk_03',
        worker_name: 'Thanh Phuong',
        assignees: [{ worker_id: 'wrk_03', name: 'Thanh Phuong', allocation_percent: 60 }],
      } as any,
    ];

    const result = detectCrossProjectWorkerConflicts(
      mockActiveProjects,
      tasksWithinSameProject,
      mockWorkers
    );

    expect(result.total_conflict_count).toBe(0);
    expect(result.unacknowledged_conflict_count).toBe(0);
    expect(result.groups).toHaveLength(0);
  });

  it('detects a conflict when worker is assigned across 2 distinct ACTIVE projects on working days', () => {
    const tasksAcrossProjects: Task[] = [
      {
        id: 'tsk_01',
        project_id: 'prj_01',
        task_name: 'Hub Backend API',
        start_date: '2026-05-11',
        end_date: '2026-05-15',
        schedule_status: 'SCHEDULED',
        primary_worker_id: 'wrk_03',
        worker_name: 'Thanh Phuong',
        assignees: [{ worker_id: 'wrk_03', name: 'Thanh Phuong', allocation_percent: 50 }],
      } as any,
      {
        id: 'tsk_02',
        project_id: 'prj_02',
        task_name: 'Factory Site Supervision',
        start_date: '2026-05-11',
        end_date: '2026-05-15',
        schedule_status: 'SCHEDULED',
        primary_worker_id: 'wrk_03',
        worker_name: 'Thanh Phuong',
        assignees: [{ worker_id: 'wrk_03', name: 'Thanh Phuong', allocation_percent: 50 }],
      } as any,
    ];

    const result = detectCrossProjectWorkerConflicts(
      mockActiveProjects,
      tasksAcrossProjects,
      mockWorkers
    );

    expect(result.total_conflict_count).toBe(1);
    expect(result.unacknowledged_conflict_count).toBe(1);
    expect(result.groups).toHaveLength(1);

    const group = result.groups[0];
    expect(group.policy_version).toBe('cross_project_v1');
    expect(group.worker_id).toBe('wrk_03');
    expect(group.project_ids).toEqual(['prj_01', 'prj_02']);
    expect(group.overlap_start_date).toBe('2026-05-11');
    expect(group.overlap_end_date).toBe('2026-05-15');
    expect(group.acknowledged).toBe(false);
  });

  it('correctly respects acknowledgement matching by fingerprint', () => {
    const tasksAcrossProjects: Task[] = [
      {
        id: 'tsk_01',
        project_id: 'prj_01',
        task_name: 'Hub Backend API',
        start_date: '2026-05-11',
        end_date: '2026-05-15',
        schedule_status: 'SCHEDULED',
        primary_worker_id: 'wrk_03',
        worker_name: 'Thanh Phuong',
        assignees: [{ worker_id: 'wrk_03', name: 'Thanh Phuong', allocation_percent: 50 }],
      } as any,
      {
        id: 'tsk_02',
        project_id: 'prj_02',
        task_name: 'Factory Site Supervision',
        start_date: '2026-05-11',
        end_date: '2026-05-15',
        schedule_status: 'SCHEDULED',
        primary_worker_id: 'wrk_03',
        worker_name: 'Thanh Phuong',
        assignees: [{ worker_id: 'wrk_03', name: 'Thanh Phuong', allocation_percent: 50 }],
      } as any,
    ];

    const fingerprint = generateConflictFingerprint('wrk_03', ['prj_01', 'prj_02'], '2026-05-11', '2026-05-15');
    const acks = [
      {
        conflict_fingerprint: fingerprint,
        acknowledged_by_name: 'CEO',
        acknowledged_at: '2026-08-07T12:00:00Z',
      },
    ];

    const result = detectCrossProjectWorkerConflicts(
      mockActiveProjects,
      tasksAcrossProjects,
      mockWorkers,
      [],
      [],
      undefined,
      acks
    );

    expect(result.total_conflict_count).toBe(1);
    expect(result.unacknowledged_conflict_count).toBe(0);
    expect(result.groups[0].acknowledged).toBe(true);
  });
});
