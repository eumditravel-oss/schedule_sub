import { describe, expect, it } from 'vitest';
import {
  WorklogError,
  buildTaskActualView,
  collectAggregateRefreshTargets,
  isMorningLate,
  resolveEffectiveRevision,
  stableStringify,
  utcToLocalDateTime,
  validateIncrement,
  validateEntryAssignmentShape,
  validateMorningAssignmentRole,
  validatePrimaryProgress,
  validateTimeRanges,
  zonedLocalToUtc,
  deriveWorklogTriage,
  formatWorklogApprovalAge,
} from '../worker/services/dailyWorklogService';

const expectCode = (fn: () => unknown, code: string) => {
  try { fn(); throw new Error('expected rejection'); } catch (error) {
    expect(error).toBeInstanceOf(WorklogError);
    expect((error as WorklogError).code).toBe(code);
  }
};

describe('Checkpoint 2 daily worklog policy', () => {
  it.each([
    ['VN 08:30', '2026-08-12T01:30:00.000Z', '2026-08-12', 'Asia/Ho_Chi_Minh', '09:00', false],
    ['VN 09:01', '2026-08-12T02:01:00.000Z', '2026-08-12', 'Asia/Ho_Chi_Minh', '09:00', true],
    ['KR 09:30', '2026-08-12T00:30:00.000Z', '2026-08-12', 'Asia/Seoul', '10:00', false],
    ['KR 10:01', '2026-08-12T01:01:00.000Z', '2026-08-12', 'Asia/Seoul', '10:00', true],
  ])('A-D %s morning deadline', (_, utc, date, timezone, deadline, late) => {
    expect(isMorningLate(new Date(utc), date, timezone, deadline)).toBe(late);
  });

  it('stores UTC while preserving employee local date', () => {
    expect(zonedLocalToUtc('2026-08-12', '08:00', 'Asia/Ho_Chi_Minh').toISOString()).toBe('2026-08-12T01:00:00.000Z');
    expect(zonedLocalToUtc('2026-08-12', '09:00', 'Asia/Seoul').toISOString()).toBe('2026-08-12T00:00:00.000Z');
    expect(utcToLocalDateTime(new Date('2026-08-11T17:30:00Z'), 'Asia/Ho_Chi_Minh').date).toBe('2026-08-12');
  });

  it('F/G/H enforces 30-minute employee and 15-minute manager increments', () => {
    expectCode(() => validateIncrement(45, 30), 'INVALID_TIME_INCREMENT');
    expect(validateIncrement(60, 30)).toBe(60);
    expect(validateIncrement(45, 15)).toBe(45);
  });

  it('J-K-L validates primary progress and completion', () => {
    expectCode(() => validatePrimaryProgress({ actual_minutes: 60, work_result: 'x' }, 20), 'PRIMARY_PROGRESS_REQUIRED');
    expectCode(() => validatePrimaryProgress({ work_result: 'x', progress_after: 100, remaining_estimated_minutes: 60, completion_reported: true }, 20), 'PROGRESS_100_REQUIRES_ZERO_REMAINING');
    expect(() => validatePrimaryProgress({ work_result: 'done', progress_after: 100, remaining_estimated_minutes: 0, completion_reported: true }, 20)).not.toThrow();
  });

  it('M rejects progress decrease unless correction', () => {
    const payload = { work_result: 'corrected', progress_after: 50, remaining_estimated_minutes: 60, completion_reported: false };
    expectCode(() => validatePrimaryProgress(payload, 60), 'PROGRESS_DECREASE_REQUIRES_CORRECTION');
    expect(() => validatePrimaryProgress(payload, 60, true)).not.toThrow();
  });

  it('rejects overlap and lunch intersection for time-range input', () => {
    const policy = { lunch_start_local: '12:00', lunch_end_local: '13:00' };
    expectCode(() => validateTimeRanges([
      { local_start_time: '09:00', local_end_time: '10:00', actual_minutes: 60 },
      { local_start_time: '09:30', local_end_time: '10:30', actual_minutes: 60 },
    ], policy), 'ENTRY_TIME_OVERLAP');
    expectCode(() => validateTimeRanges([
      { local_start_time: '11:30', local_end_time: '12:30', actual_minutes: 60 },
    ], policy), 'ENTRY_TIME_OVERLAP');
  });

  it('stable payload fingerprint is key-order invariant', () => {
    expect(stableStringify({ b: 2, a: { d: 4, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 4 }, b: 2 }));
  });

  it('recognizes impossible calendar dates through public capacity validation helpers', () => {
    expect(() => zonedLocalToUtc('2026-02-28', '09:00', 'Asia/Seoul')).not.toThrow();
    expect(utcToLocalDateTime(zonedLocalToUtc('2026-02-28', '09:00', 'Asia/Seoul'), 'Asia/Seoul').date).toBe('2026-02-28');
  });

  it('returns exactly one effective revision aligned to the worklog header', () => {
    expect(resolveEffectiveRevision({ status: 'MANAGER_CORRECTED', current_revision_number: 3 }, [
      { id: 'r1', revision_number: 1, is_effective: 0 },
      { id: 'r2', revision_number: 2, is_effective: 0 },
      { id: 'r3', revision_number: 3, is_effective: 1 },
    ])).toMatchObject({ effectiveRevisionCount: 1, integrity: 'PASS', effectiveRevision: { id: 'r3' } });

    expect(resolveEffectiveRevision({ status: 'EOD_SUBMITTED', current_revision_number: 2 }, [
      { id: 'r1', revision_number: 1, is_effective: 1 },
      { id: 'r2', revision_number: 2, is_effective: 1 },
    ])).toMatchObject({ effectiveRevisionCount: 2, integrity: 'FAIL' });
  });

  it('never serializes an assigned Task Actual as an empty object', () => {
    const view = buildTaskActualView('task-1', 'project-1', {}, []);
    expect(view.taskActual).toEqual({
      taskId: 'task-1', rawActualMinutes: 0, approvedActualMinutes: 0, currentProgress: 0,
      remainingEstimatedMinutes: 0, completionReported: false, lastActualWorkDate: null,
      lastEffectiveWorklogId: null, lastEffectiveRevisionId: null, progressSource: 'TASK_FALLBACK', updatedAt: null,
    });
  });

  it('blocks task-scoped or progress input without an assignment while allowing non-task duty', () => {
    expectCode(() => validateEntryAssignmentShape({ work_category: 'NORMAL_ASSIGNED_TASK', actual_minutes: 60 }), 'ASSIGNMENT_REQUIRED');
    expectCode(() => validateEntryAssignmentShape({ work_category: 'COMPANY_DUTY', actual_minutes: 60, progress_after: 10 }), 'ASSIGNMENT_REQUIRED');
    expect(() => validateEntryAssignmentShape({ work_category: 'COMPANY_DUTY', actual_minutes: 60 })).not.toThrow();
  });

  it('blocks Support target progress in Morning API', () => {
    expectCode(() => validateMorningAssignmentRole({ target_progress: 10 }, { role: 'CO_ASSIGNEE' }), 'SUPPORT_PROGRESS_FORBIDDEN');
    expect(() => validateMorningAssignmentRole({ target_progress: 10 }, { role: 'PRIMARY' })).not.toThrow();
    expect(() => validateMorningAssignmentRole({}, { role: 'CO_ASSIGNEE' })).not.toThrow();
  });

  it('recalculates aggregates for removed, retained, and newly added revision tasks', () => {
    expect([...collectAggregateRefreshTargets(
      [{ task_id: 'task-a', project_id: 'project-1' }],
      [{ task_id: 'task-b', project_id: 'project-1' }],
    ).entries()]).toEqual([['task-a', 'project-1'], ['task-b', 'project-1']]);
  });

  it('derives manager triage from server-owned worklog facts', () => {
    expect(deriveWorklogTriage({ capacity_variance_minutes: 0 })).toEqual({ classification: 'NORMAL', reasonCodes: [] });
    expect(deriveWorklogTriage({ capacity_variance_minutes: 60 })).toMatchObject({ classification: 'REVIEW_REQUIRED' });
    expect(deriveWorklogTriage({ overtime_candidate_minutes: 30 })).toMatchObject({ classification: 'EXCEPTION', reasonCodes: ['OVERTIME_PENDING'] });
    expect(deriveWorklogTriage({ contains_other_project_work: 1 })).toMatchObject({ classification: 'REVIEW_REQUIRED' });
  });

  it('formats approval aging independent of office local date', () => {
    const now = new Date('2026-08-14T12:00:00.000Z');
    expect(formatWorklogApprovalAge('2026-08-14T11:00:00.000Z', now)).toEqual({ ageMinutes: 60, ageLabel: '1시간 0분' });
    expect(formatWorklogApprovalAge('2026-08-13T10:00:00.000Z', now)).toEqual({ ageMinutes: 1560, ageLabel: '1일 2시간' });
  });
});
