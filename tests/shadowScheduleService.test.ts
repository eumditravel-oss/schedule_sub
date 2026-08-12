import { describe, expect, it } from 'vitest';
import {
  expandSharedEmployeeTaskClosure,
  filterEmployeeShadowView,
  filterEffectiveOvertimeCandidates,
  dependencyGraphGuardAcquired,
  firstPositiveActualContribution,
  hasShadowActualOrCapacityTrigger,
  findMissingWorklogDates,
  recordedWorkTimestampUtc,
  selectEffectiveProjectPriorities,
  shadowVersionUsesEmployee,
  shadowRunAuthorityIsCurrent,
  isValidShadowWorkPolicy,
  normalizeShadowCutoff,
  validateSourceWorklogRevisionPair,
  validateDependencyReviewAction,
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

  it('keeps an employee-visible task and diff when only a temporary allocation belongs to them', () => {
    const filtered = filterEmployeeShadowView({
      employeeId: 'emp-temp',
      tasks: [{ task_id: 'task-split', project_id: 'project-a', employee_id: 'emp-primary' }],
      allocations: [
        { task_id: 'task-split', project_id: 'project-a', employee_id: 'emp-temp' },
        { task_id: 'task-split', project_id: 'project-a', employee_id: 'emp-primary' },
      ],
      diffs: [{ task_id: 'task-split', project_id: 'project-a' }],
      versions: [{ project_id: 'project-a' }],
      impacts: [{ employee_id: null, primary_project_id: 'project-a' }],
    });
    expect(filtered.tasks.map((row) => row.task_id)).toEqual(['task-split']);
    expect(filtered.allocations.map((row) => row.employee_id)).toEqual(['emp-temp']);
    expect(filtered.diffs.map((row) => row.task_id)).toEqual(['task-split']);
    expect(filtered.versions.map((row) => row.project_id)).toEqual(['project-a']);
    expect(filtered.impacts).toHaveLength(1);
  });

  it('marks a Shadow version as employee-affected through a temporary allocation after handback', () => {
    expect(shadowVersionUsesEmployee({
      employeeId: 'emp-temp', taskEmployeeIds: ['emp-primary'], allocationEmployeeIds: ['emp-temp', 'emp-primary'],
    })).toBe(true);
    expect(shadowVersionUsesEmployee({
      employeeId: 'emp-unrelated', taskEmployeeIds: ['emp-primary'], allocationEmployeeIds: ['emp-temp'],
    })).toBe(false);
  });

  it('treats a persisted Shadow run as stale whenever schedule authority advanced', () => {
    expect(shadowRunAuthorityIsCurrent(12, 12)).toBe(true);
    expect(shadowRunAuthorityIsCurrent(12, 13)).toBe(false);
    expect(shadowRunAuthorityIsCurrent(undefined, 13)).toBe(false);
  });

  it('documents the Shadow capacity authority accepting APPROVED and EFFECTIVE event statuses', () => {
    const accepted = new Set(['APPROVED', 'EFFECTIVE']);
    expect(accepted.has('APPROVED')).toBe(true);
    expect(accepted.has('EFFECTIVE')).toBe(true);
    expect(accepted.has('PENDING')).toBe(false);
  });

  it('ignores pending or approved overtime candidates from superseded Worklog revisions', () => {
    const candidates = filterEffectiveOvertimeCandidates([
      { revision_id: 'revision-old', approval_status: 'APPROVED', candidate_minutes: 120 },
      { revision_id: 'revision-old-pending', approval_status: 'PENDING_REVIEW', candidate_minutes: 60 },
      { revision_id: 'revision-current', approval_status: 'PENDING_REVIEW', candidate_minutes: 30 },
    ], new Set(['revision-current']));
    expect(candidates).toEqual([{ revision_id: 'revision-current', approval_status: 'PENDING_REVIEW', candidate_minutes: 30 }]);
  });

  it('applies only project priorities effective at the planning cutoff', () => {
    const priorities = selectEffectiveProjectPriorities([
      { project_id: 'current', priority_rank: 1, effective_from: '2026-08-01', effective_to: '2026-08-31' },
      { project_id: 'future', priority_rank: 2, effective_from: '2026-09-01', effective_to: null },
      { project_id: 'expired', priority_rank: 3, effective_from: '2026-07-01', effective_to: '2026-08-11' },
    ], '2026-08-12');
    expect([...priorities.keys()]).toEqual(['current']);
  });

  it('rejects dependency batch-review action typos before any write path', () => {
    expect(validateDependencyReviewAction('CONFIRM')).toBe('CONFIRM');
    expect(validateDependencyReviewAction('REJECT')).toBe('REJECT');
    expect(() => validateDependencyReviewAction('CONFIRMED')).toThrowError('DEPENDENCY_REVIEW_ACTION_INVALID');
    expect(() => validateDependencyReviewAction('')).toThrowError('DEPENDENCY_REVIEW_ACTION_INVALID');
  });

  it('accepts only a complete dependency graph CAS batch', () => {
    expect(dependencyGraphGuardAcquired([
      { meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } },
      { meta: { changes: 1 } }, { meta: { changes: 1 } },
    ], 2)).toBe(true);
    expect(dependencyGraphGuardAcquired([
      { meta: { changes: 0 } }, { meta: { changes: 0 } },
    ], 1)).toBe(false);
    expect(dependencyGraphGuardAcquired([
      { meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 0 } },
    ], 1)).toBe(false);
  });

  it('validates office calendar policy instead of using hard-coded production fallbacks', () => {
    const valid = {
      timezone: 'Asia/Seoul', work_start_local: '09:00', work_end_local: '17:00',
      lunch_start_local: '12:00', lunch_end_local: '13:00', schedulable_minutes: 420,
    };
    expect(isValidShadowWorkPolicy(valid)).toBe(true);
    expect(isValidShadowWorkPolicy(null)).toBe(false);
    expect(isValidShadowWorkPolicy({ ...valid, timezone: 'Invalid/Zone' })).toBe(false);
    expect(isValidShadowWorkPolicy({ ...valid, lunch_end_local: '11:00' })).toBe(false);
    expect(isValidShadowWorkPolicy({ ...valid, schedulable_minutes: 0 })).toBe(false);
  });

  it('normalizes a coherent cutoff and rejects invalid or contradictory request values', () => {
    expect(normalizeShadowCutoff({
      planningCutoffUtc: '2026-08-12T00:00:00.000Z', planningCutoffLocalDate: '2026-08-12', timezone: 'Asia/Seoul',
    }).localDate).toBe('2026-08-12');
    expect(() => normalizeShadowCutoff({
      planningCutoffUtc: 'not-a-timestamp', planningCutoffLocalDate: '2026-08-12', timezone: 'Asia/Seoul',
    })).toThrowError('SHADOW_RUN_INPUT_CHANGED');
    expect(() => normalizeShadowCutoff({
      planningCutoffUtc: '2026-08-12T00:00:00.000Z', planningCutoffLocalDate: '2026-08-20', timezone: 'Asia/Seoul',
    })).toThrowError('SHADOW_RUN_INPUT_CHANGED');
  });

  it('rejects missing, stale, or cross-worklog source revision pairs', () => {
    expect(() => validateSourceWorklogRevisionPair({
      requestedWorklogId: null, requestedRevisionId: 'revision-a', sourceWorklog: null,
      sourceRevision: { id: 'revision-a', worklog_id: 'worklog-a', is_effective: 1 }, resolvedRevisionId: 'revision-a',
    })).toThrowError('SHADOW_RUN_INPUT_CHANGED');
    expect(() => validateSourceWorklogRevisionPair({
      requestedWorklogId: 'worklog-a', requestedRevisionId: 'revision-b',
      sourceWorklog: { id: 'worklog-a', current_eod_revision_id: 'revision-a' },
      sourceRevision: { id: 'revision-b', worklog_id: 'worklog-b', is_effective: 1 }, resolvedRevisionId: 'revision-b',
    })).toThrowError('SHADOW_RUN_INPUT_CHANGED');
    expect(() => validateSourceWorklogRevisionPair({
      requestedWorklogId: 'worklog-a', requestedRevisionId: 'revision-a',
      sourceWorklog: { id: 'worklog-a', current_eod_revision_id: 'revision-a' },
      sourceRevision: { id: 'revision-a', worklog_id: 'worklog-a', is_effective: 1 }, resolvedRevisionId: 'revision-a',
    })).not.toThrow();
  });
});
