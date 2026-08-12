import { describe, expect, it } from 'vitest';
import {
  expandSharedEmployeeTaskClosure,
  firstPositiveActualContribution,
  hasShadowActualOrCapacityTrigger,
  findMissingWorklogDates,
  recordedWorkTimestampUtc,
  worklogHasShadowDataGap,
} from '../worker/services/shadowScheduleService';
import { isValidIsoLocalDate, isValidUtcTimestamp } from '../worker/services/shadowScheduleEngine';

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

  it('uses the first positive Actual contribution, not an earlier zero-minute EOD row', () => {
    expect(firstPositiveActualContribution([
      { local_work_date: '2026-08-10', approved_actual_minutes: 0 },
      { local_work_date: '2026-08-11', approved_actual_minutes: 120 },
    ])?.local_work_date).toBe('2026-08-11');
  });

  it('treats an effective source EOD as a Shadow trigger even without task progress', () => {
    expect(hasShadowActualOrCapacityTrigger({
      candidateTaskIds: new Set(['task-a']),
      contributions: [],
      sourceWorklog: { current_eod_revision_id: 'revision-leave', status: 'EOD_SUBMITTED' },
      sourceRevisionId: 'revision-leave',
      effectiveRevisionIds: new Set(['revision-leave']),
    })).toBe(true);
  });

  it('does not treat a manual run without Actual or a non-effective EOD as a trigger', () => {
    expect(hasShadowActualOrCapacityTrigger({
      candidateTaskIds: new Set(['task-a']), contributions: [], sourceWorklog: null,
      sourceRevisionId: null, effectiveRevisionIds: new Set(),
    })).toBe(false);
    expect(hasShadowActualOrCapacityTrigger({
      candidateTaskIds: new Set(['task-a']), contributions: [],
      sourceWorklog: { current_eod_revision_id: 'revision-old', status: 'EOD_SUBMITTED' },
      sourceRevisionId: 'revision-old', effectiveRevisionIds: new Set(),
    })).toBe(false);
  });

  it('strictly validates constraint dates and canonical UTC timestamps', () => {
    expect(isValidIsoLocalDate('2026-08-12')).toBe(true);
    expect(isValidIsoLocalDate('2026-02-30')).toBe(false);
    expect(isValidIsoLocalDate('2026-99-99')).toBe(false);
    expect(isValidUtcTimestamp('2026-08-12T05:00:00.000Z')).toBe(true);
    expect(isValidUtcTimestamp('2026-08-12T05:00:00Z')).toBe(true);
    expect(isValidUtcTimestamp('2026-02-30T05:00:00Z')).toBe(false);
    expect(isValidUtcTimestamp('2026-08-12T14:00:00+09:00')).toBe(false);
    expect(isValidUtcTimestamp('not-an-iso-timestamp')).toBe(false);
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
