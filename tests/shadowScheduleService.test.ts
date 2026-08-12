import { describe, expect, it } from 'vitest';
import {
  expandSharedEmployeeTaskClosure,
  findMissingWorklogDates,
  recordedWorkTimestampUtc,
  worklogHasShadowDataGap,
} from '../worker/services/shadowScheduleService';

describe('Checkpoint 3A Shadow service timestamp mapping', () => {
  const employee = {
    workStartLocal: '09:00',
    workEndLocal: '17:00',
    timezone: 'Asia/Seoul',
  };

  it('uses the recorded EOD work date instead of a later revision creation date', () => {
    const lateRevision = {
      local_work_date: '2026-08-10',
      revision_created_at: '2026-08-12T08:00:00.000Z',
    };

    expect(recordedWorkTimestampUtc(lateRevision, employee, 'START')).toBe('2026-08-10T00:00:00.000Z');
    expect(recordedWorkTimestampUtc(lateRevision, employee, 'END')).toBe('2026-08-10T08:00:00.000Z');
  });

  it('returns null when the recorded work date or employee calendar is unavailable', () => {
    expect(recordedWorkTimestampUtc(null, employee, 'START')).toBeNull();
    expect(recordedWorkTimestampUtc({ local_work_date: '2026-08-10' }, null, 'END')).toBeNull();
  });

  it('detects absent past working-day worklogs without treating weekends as gaps', () => {
    const gaps = findMissingWorklogDates(
      ['employee-a'], '2026-08-10', '2026-08-16',
      new Set(['employee-a|2026-08-10', 'employee-a|2026-08-12']),
      (_employeeId, localDate) => !['2026-08-15', '2026-08-16'].includes(localDate),
    );
    expect(gaps).toEqual([
      { employeeId: 'employee-a', localWorkDate: '2026-08-11' },
      { employeeId: 'employee-a', localWorkDate: '2026-08-13' },
      { employeeId: 'employee-a', localWorkDate: '2026-08-14' },
    ]);
  });

  it('does not turn a valid EOD without Morning into a Shadow data gap', () => {
    expect(worklogHasShadowDataGap({ morning_missing: 1, has_gap: 0 } as any)).toBe(false);
    expect(worklogHasShadowDataGap({ morning_missing: 0, has_gap: 1 } as any)).toBe(true);
  });

  it('expands project scope transitively through primary, temporary, and fallback assignments', () => {
    const tasks = [
      { id: 'a', project_id: 'p1', primary_worker_id: 'employee-a' },
      { id: 'b', project_id: 'p2', primary_worker_id: null },
      { id: 'c', project_id: 'p3', primary_worker_id: 'employee-c' },
      { id: 'd', project_id: 'p4', primary_worker_id: 'employee-d' },
    ];
    const assignments = new Map<string, any[]>([
      ['b', [{ worker_id: 'employee-a' }, { worker_id: 'employee-c' }]],
    ]);
    const temporary = new Map<string, any[]>([
      ['c', [{ temporary_primary_employee_id: 'employee-d' }]],
    ]);
    expect(expandSharedEmployeeTaskClosure(tasks, 'p1', assignments, temporary).map((task) => task.project_id))
      .toEqual(['p1', 'p2', 'p3', 'p4']);
  });
});
