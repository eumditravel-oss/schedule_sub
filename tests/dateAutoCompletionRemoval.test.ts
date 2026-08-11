import { describe, expect, it } from 'vitest';
import { calculateTaskProgressServer } from '../worker/services/progressAndConflictServer';
import { calculateTaskProgress } from '../src/utils/progressCalculator';

const worker = {
  id: 'wrk-kr',
  name: 'Korea Worker',
  country_code: 'KR',
  workweek_profile: 'MON_FRI',
  is_active: 1,
  access_role: 'EDITOR',
};

const overdueTask = {
  id: 'task-overdue-60',
  project_id: 'project-active',
  task_name: 'Past due but unfinished',
  worker_name: worker.name,
  primary_worker_id: worker.id,
  start_date: '2026-08-03',
  end_date: '2026-08-07',
  schedule_status: 'SCHEDULED',
  progress_mode: 'AUTO_TIME',
  progress: 60,
  completion_confirmed: 0,
  status: 'ACTIVE',
};

describe('date-based auto completion removal', () => {
  it('keeps a past-due task at 60% in the server calculation', () => {
    const result = calculateTaskProgressServer(overdueTask, [worker], [], [], 'ACTIVE', {}, '2026-08-11');

    expect(result.planned_progress).toBe(100);
    expect(result.actual_progress).toBe(60);
    expect(result.schedule_state).toBe('DELAYED');
  });

  it('keeps the client fallback identical to the server calculation', () => {
    const result = calculateTaskProgress(overdueTask as any, [worker] as any, [], [], 'ACTIVE', '2026-08-11');

    expect(result.planned_progress).toBe(100);
    expect(result.actual_progress).toBe(60);
    expect(result.schedule_state).toBe('DELAYED');
  });

  it('preserves an explicit completed task', () => {
    const completed = { ...overdueTask, progress: 100, completion_confirmed: 1 };
    const server = calculateTaskProgressServer(completed, [worker], [], [], 'ACTIVE', {}, '2026-08-11');
    const client = calculateTaskProgress(completed as any, [worker] as any, [], [], 'ACTIVE', '2026-08-11');

    expect(server.actual_progress).toBe(100);
    expect(server.schedule_state).toBe('COMPLETED');
    expect(client.actual_progress).toBe(100);
    expect(client.schedule_state).toBe('COMPLETED');
  });
});
