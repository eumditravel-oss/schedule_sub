import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  fingerprintEngineInput,
  generateDependencyProposals,
  localDateTimeToUtc,
  resolveEffectivePrimary,
  resolveRemainingEffort,
  runShadowScheduleEngine,
  SHADOW_ENGINE_VERSION,
  ShadowEngineInput,
  ShadowTaskInput,
  validateDependencyGraph,
} from '../worker/services/shadowScheduleEngine';

const employee = (id = 'emp-kr', countryCode: 'KR' | 'VN' = 'KR') => ({
  id, name: id, countryCode,
  timezone: countryCode === 'VN' ? 'Asia/Ho_Chi_Minh' : 'Asia/Seoul',
  workStartLocal: countryCode === 'VN' ? '08:00' : '09:00', workEndLocal: '17:00',
  lunchStartLocal: '12:00', lunchEndLocal: '13:00', defaultCapacityMinutes: countryCode === 'VN' ? 480 : 420,
});

const task = (id: string, overrides: Partial<ShadowTaskInput> = {}): ShadowTaskInput => ({
  id, projectId: 'project-a', groupId: 'group-1', wbsOrder: Number(id.replace(/\D/g, '') || 1), name: id,
  status: 'FUTURE', baselineStart: '2026-08-12', baselineEnd: '2026-08-13',
  officialStart: '2026-08-12', officialEnd: '2026-08-13', dueDate: '2026-08-13',
  primaryEmployeeId: 'emp-kr', temporaryPrimaries: [], actualStarted: false, actualStartUtc: null,
  actualEndUtc: null, actualEndLocalDate: null, completed: false, completionReported: false, remainingEstimatedMinutes: 420,
  confirmedEffortMinutes: null, proposedEffortMinutes: null, approvedActualMinutes: 0,
  ...overrides,
});

const days = (employeeId: string, start = '2026-08-12', count = 20, minutes = 420, timezone = 'Asia/Seoul') => {
  const rows = [];
  const date = new Date(`${start}T00:00:00Z`);
  for (let index = 0; index < count; index += 1) {
    const value = date.toISOString().slice(0, 10);
    const weekday = date.getUTCDay();
    rows.push({ employeeId, localWorkDate: value, timezone, availableCapacityMinutes: weekday === 0 || weekday === 6 ? 0 : minutes, capacitySource: weekday === 0 || weekday === 6 ? 'WEEKLY_OFF' : 'WORKDAY' });
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return rows;
};

const input = (overrides: Partial<ShadowEngineInput> = {}): ShadowEngineInput => ({
  engineVersion: SHADOW_ENGINE_VERSION, planningCutoffUtc: '2026-08-12T03:00:00.000Z', planningCutoffLocalDate: '2026-08-12',
  basedOnBaselineVersion: 1, basedOnForecastVersion: 1, sourceWorklogId: 'worklog-1', sourceRevisionId: 'revision-1',
  sourceEmployeeId: 'emp-kr', sourceProjectId: 'project-a', noActualTrigger: false,
  projects: [{ id: 'project-a', name: 'A', status: 'ACTIVE', baselineStart: '2026-08-12', baselineEnd: '2026-08-31', officialStart: '2026-08-12', officialEnd: '2026-08-31', officialForecastVersionId: 'fv-a', priorityRank: 1 }],
  tasks: [task('task-1')], dependencies: [], constraints: [], employees: [employee()],
  capacityDays: days('emp-kr'), pendingOvertimeTaskIds: [], dataGapEmployeeDates: [],
  ...overrides,
});

describe('Checkpoint 3A A-Z shadow engine simulations', () => {
  it('A — early completion releases successor on next valid local work date without official mutation', () => {
    const source = input({
      tasks: [
        task('task-1', { completed: true, remainingEstimatedMinutes: 0, actualStartUtc: '2026-08-12T00:00:00.000Z', actualEndUtc: '2026-08-12T01:00:00.000Z' }),
        task('task-2', { wbsOrder: 2, officialStart: '2026-08-14', officialEnd: '2026-08-17' }),
      ],
      dependencies: [{ id: 'dep-1', projectId: 'project-a', predecessorTaskId: 'task-1', successorTaskId: 'task-2', type: 'FINISH_TO_START', lagWorkMinutes: 0, status: 'CONFIRMED' }],
    });
    const before = canonicalJson(source.projects);
    const result = runShadowScheduleEngine(source);
    expect(result.tasks.find((item) => item.taskId === 'task-1')?.shadowEnd).toBe('2026-08-12');
    expect(result.tasks.find((item) => item.taskId === 'task-2')?.shadowStart).toBe('2026-08-13');
    expect(result.allocations.find((allocation) => allocation.taskId === 'task-2')?.startsAtUtc).toBe('2026-08-13T00:00:00.000Z');
    expect(canonicalJson(source.projects)).toBe(before);
  });

  it('A2 — future Shadow FS zero-lag releases a successor at the predecessor finish minute', () => {
    const result = runShadowScheduleEngine(input({
      planningCutoffUtc: '2026-08-12T00:00:00.000Z',
      tasks: [
        task('task-1', { remainingEstimatedMinutes: 60, officialStart: '2026-08-12', officialEnd: '2026-08-12' }),
        task('task-2', { wbsOrder: 2, remainingEstimatedMinutes: 60, officialStart: '2026-08-12', officialEnd: '2026-08-12' }),
      ],
      dependencies: [{ id: 'dep-a2', projectId: 'project-a', predecessorTaskId: 'task-1', successorTaskId: 'task-2', type: 'FINISH_TO_START', lagWorkMinutes: 0, status: 'CONFIRMED' }],
    }));
    expect(result.allocations.find((allocation) => allocation.taskId === 'task-1')).toMatchObject({
      startsAtUtc: '2026-08-12T00:00:00.000Z', endsAtUtc: '2026-08-12T01:00:00.000Z',
    });
    expect(result.allocations.find((allocation) => allocation.taskId === 'task-2')).toMatchObject({
      startsAtUtc: '2026-08-12T01:00:00.000Z', endsAtUtc: '2026-08-12T02:00:00.000Z',
    });
  });

  it('A3 — multiple predecessor releases compare independent date and work-lag instants', () => {
    const result = runShadowScheduleEngine(input({
      planningCutoffUtc: '2026-08-12T00:00:00.000Z',
      tasks: [
        task('task-1', { completed: true, remainingEstimatedMinutes: 0, actualEndUtc: '2026-08-12T08:00:00.000Z' }),
        task('task-2', { completed: true, remainingEstimatedMinutes: 0, actualEndUtc: '2026-08-13T08:00:00.000Z' }),
        task('task-3', { wbsOrder: 3, remainingEstimatedMinutes: 60 }),
      ],
      dependencies: [
        { id: 'dep-a3-a', projectId: 'project-a', predecessorTaskId: 'task-1', successorTaskId: 'task-3', type: 'FINISH_TO_START', lagWorkMinutes: 300, status: 'CONFIRMED' },
        { id: 'dep-a3-b', projectId: 'project-a', predecessorTaskId: 'task-2', successorTaskId: 'task-3', type: 'FINISH_TO_START', lagWorkMinutes: 0, status: 'CONFIRMED' },
      ],
    }));
    expect(result.allocations.find((allocation) => allocation.taskId === 'task-3')).toMatchObject({
      localWorkDate: '2026-08-14', startsAtUtc: '2026-08-14T00:00:00.000Z',
    });
  });

  it('A4 — dependency work-lag can release inside an approved-overtime window', () => {
    const result = runShadowScheduleEngine(input({
      planningCutoffUtc: '2026-08-12T00:00:00.000Z',
      tasks: [
        task('task-1', { completed: true, remainingEstimatedMinutes: 0, actualEndUtc: '2026-08-12T01:00:00.000Z' }),
        task('task-2', { wbsOrder: 2, remainingEstimatedMinutes: 60 }),
      ],
      dependencies: [{ id: 'dep-a4', projectId: 'project-a', predecessorTaskId: 'task-1', successorTaskId: 'task-2', type: 'FINISH_TO_START', lagWorkMinutes: 480, status: 'CONFIRMED' }],
      capacityDays: days('emp-kr').map((day) => day.localWorkDate === '2026-08-13'
        ? { ...day, availableCapacityMinutes: 540, capacityWindowMinutes: 540, capacitySource: 'WORKDAY+APPROVED_OVERTIME' }
        : day),
    }));
    expect(result.allocations.find((allocation) => allocation.taskId === 'task-2')).toMatchObject({
      localWorkDate: '2026-08-13', startsAtUtc: '2026-08-13T09:00:00.000Z', endsAtUtc: '2026-08-13T10:00:00.000Z',
    });
  });

  it('A5 — timestamp milestone releases a zero-lag successor at the same instant', () => {
    const result = runShadowScheduleEngine(input({
      planningCutoffUtc: '2026-08-12T00:00:00.000Z',
      tasks: [
        task('task-1', { remainingEstimatedMinutes: 0 }),
        task('task-2', { wbsOrder: 2, remainingEstimatedMinutes: 60 }),
      ],
      constraints: [{ id: 'milestone-a5', taskId: 'task-1', type: 'MILESTONE', date: null, timestampUtc: '2026-08-12T01:00:00.000Z', minutes: null, status: 'ACTIVE' }],
      dependencies: [{ id: 'dep-a5', projectId: 'project-a', predecessorTaskId: 'task-1', successorTaskId: 'task-2', type: 'FINISH_TO_START', lagWorkMinutes: 0, status: 'CONFIRMED' }],
    }));
    expect(result.allocations.find((allocation) => allocation.taskId === 'task-2')).toMatchObject({
      localWorkDate: '2026-08-12', startsAtUtc: '2026-08-12T01:00:00.000Z',
    });
  });

  it('B — other-project actual capacity forces cross-project impact and approval', () => {
    const result = runShadowScheduleEngine(input({
      projects: [
        input().projects[0],
        { id: 'project-b', name: 'B', status: 'ACTIVE', baselineStart: '2026-08-12', baselineEnd: '2026-08-31', officialStart: '2026-08-12', officialEnd: '2026-08-31', officialForecastVersionId: 'fv-b', priorityRank: 2 },
      ],
      tasks: [task('task-1'), task('task-2', { projectId: 'project-b', officialStart: '2026-08-12', officialEnd: '2026-08-12', remainingEstimatedMinutes: 420 })],
      capacityDays: days('emp-kr').map((day) => day.localWorkDate === '2026-08-12' ? { ...day, availableCapacityMinutes: 0, capacitySource: 'ACTUAL_CONSUMED' } : day),
    }));
    expect(result.crossProjectImpact).toBe(true);
    expect(result.approvalRequired).toBe(true);
    expect(result.tasks.some((item) => item.shadowStart && item.shadowStart > '2026-08-12')).toBe(true);
  });

  it('C — same-project outside work does not add an arbitrary day when primary remaining fits', () => {
    const result = runShadowScheduleEngine(input({
      tasks: [task('task-1', { remainingEstimatedMinutes: 210 })],
      capacityDays: days('emp-kr').map((day) => day.localWorkDate === '2026-08-12' ? { ...day, availableCapacityMinutes: 210, capacitySource: 'WORKDAY+ACTUAL_CONSUMED' } : day),
    }));
    expect(result.tasks[0].shadowStart).toBe('2026-08-12');
    expect(result.tasks[0].shadowEnd).toBe('2026-08-12');
  });

  it('D — company duty makes capacity zero, delays remaining work, and requires approval', () => {
    const result = runShadowScheduleEngine(input({
      capacityDays: days('emp-kr').map((day) => day.localWorkDate === '2026-08-12' ? { ...day, availableCapacityMinutes: 0, capacitySource: 'COMPANY_DUTY' } : day),
    }));
    expect(result.tasks[0].shadowStart).toBe('2026-08-13');
    expect(result.tasks[0].remainingMinutes).toBe(420);
    expect(result.projects[0].approvalClassification).toBe('APPROVAL_REQUIRED');
  });

  it('D2 — partial company duty remains an explicit approval reason even without date movement', () => {
    const result = runShadowScheduleEngine(input({
      planningCutoffUtc: '2026-08-12T00:00:00.000Z',
      tasks: [task('task-1', { remainingEstimatedMinutes: 60, officialStart: '2026-08-12', officialEnd: '2026-08-12' })],
      capacityDays: days('emp-kr').map((day) => day.localWorkDate === '2026-08-12'
        ? { ...day, availableCapacityMinutes: 360, capacityWindowMinutes: 420, capacitySource: 'WORKDAY+COMPANY_DUTY+ACTUAL_CONSUMED' }
        : day),
    }));
    expect(result.tasks[0].impactReasonCodes).toContain('COMPANY_DUTY');
    expect(result.projects[0].approvalClassification).toBe('APPROVAL_REQUIRED');
  });

  it('E — emergency leave capacity is zero once and is not double-deducted', () => {
    const capacityDays = days('emp-kr').map((day) => day.localWorkDate === '2026-08-12' ? { ...day, availableCapacityMinutes: 0, capacitySource: 'LEAVE' } : day);
    const result = runShadowScheduleEngine(input({ capacityDays }));
    expect(result.allocations.filter((allocation) => allocation.localWorkDate === '2026-08-12')).toHaveLength(0);
    expect(result.allocations.reduce((sum, row) => sum + row.allocatedMinutes, 0)).toBe(420);
  });

  it('E2 — approved overtime extends the deterministic same-day capacity window', () => {
    const result = runShadowScheduleEngine(input({
      planningCutoffUtc: '2026-08-12T00:00:00.000Z',
      tasks: [task('task-1', { remainingEstimatedMinutes: 540 })],
      capacityDays: days('emp-kr').map((day) => day.localWorkDate === '2026-08-12'
        ? { ...day, availableCapacityMinutes: 540, capacityWindowMinutes: 540, capacitySource: 'WORKDAY+APPROVED_OVERTIME' }
        : day),
    }));
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0]).toMatchObject({
      localWorkDate: '2026-08-12', allocatedMinutes: 540,
      startsAtUtc: '2026-08-12T00:00:00.000Z', endsAtUtc: '2026-08-12T10:00:00.000Z',
    });
  });

  it('F — support actual is never subtracted again from authoritative primary remaining', () => {
    expect(resolveRemainingEffort(task('task-1', { remainingEstimatedMinutes: 480, approvedActualMinutes: 240 }), 900)).toMatchObject({ minutes: 480, source: 'PRIMARY_REMAINING' });
  });

  it('G — NOT_BEFORE protects successor start from early movement', () => {
    const result = runShadowScheduleEngine(input({
      tasks: [task('task-1', { remainingEstimatedMinutes: 60 })],
      constraints: [{ id: 'con-1', taskId: 'task-1', type: 'NOT_BEFORE', date: '2026-08-20', timestampUtc: null, minutes: null, status: 'ACTIVE' }],
    }));
    expect(result.tasks[0].shadowStart).toBe('2026-08-20');
  });

  it('G2 — timestamp-only constraint is converted through the employee timezone and preserves time offset', () => {
    const result = runShadowScheduleEngine(input({
      tasks: [task('task-1', { remainingEstimatedMinutes: 120 })],
      constraints: [{ id: 'con-ts', taskId: 'task-1', type: 'FIXED_START', date: null, timestampUtc: '2026-08-20T05:00:00.000Z', minutes: null, status: 'ACTIVE' }],
    }));
    expect(result.tasks[0].shadowStart).toBe('2026-08-20');
    expect(result.allocations[0].startsAtUtc).toBe('2026-08-20T05:00:00.000Z');
  });

  it('H — missing worklog is a data gap, not zero-actual auto-delay', () => {
    const result = runShadowScheduleEngine(input({
      dataGapEmployeeDates: [{ employeeId: 'emp-kr', localWorkDate: '2026-08-12' }],
    }));
    expect(result.tasks[0].impactReasonCodes).toContain('WORKLOG_DATA_GAP');
    expect(result.tasks[0].dataConfidence).toBe('PROVISIONAL');
    expect(result.tasks[0].shadowStart).toBe(result.tasks[0].officialStart);
    expect(result.tasks[0].shadowEnd).toBe(result.tasks[0].officialEnd);
    expect(result.allocations).toHaveLength(0);
  });

  it('H2 — completion reported remains provisional until separately confirmed', () => {
    const result = runShadowScheduleEngine(input({
      tasks: [task('task-1', {
        actualStarted: true, actualStartUtc: '2026-08-12T00:00:00.000Z', actualEndUtc: '2026-08-12T08:00:00.000Z',
        actualEndLocalDate: '2026-08-12', completed: false, completionReported: true, remainingEstimatedMinutes: 0,
      })],
    }));
    expect(result.tasks[0]).toMatchObject({
      allocationSource: 'COMPLETION_REPORTED', approvalRequired: true, dataConfidence: 'PROVISIONAL',
    });
    expect(result.tasks[0].impactReasonCodes).toContain('COMPLETION_REPORTED_REVIEW');
  });

  it('H3 — explicit baseline effort does not collapse when the baseline is before cutoff', () => {
    const result = runShadowScheduleEngine(input({
      tasks: [task('task-1', {
        baselineStart: '2026-08-03', baselineEnd: '2026-08-07', baselineWorkMinutes: 2100,
        remainingEstimatedMinutes: null, confirmedEffortMinutes: null, proposedEffortMinutes: null,
      })],
    }));
    expect(result.tasks[0].remainingMinutes).toBe(2100);
    expect(result.allocations.reduce((sum, allocation) => sum + allocation.allocatedMinutes, 0)).toBe(2100);
  });

  it('I — identical inputs have the same fingerprint and result', async () => {
    const source = input();
    expect(await fingerprintEngineInput(source)).toBe(await fingerprintEngineInput({ ...source, tasks: [...source.tasks] }));
    expect(canonicalJson(runShadowScheduleEngine(source))).toBe(canonicalJson(runShadowScheduleEngine(source)));
  });

  it('J — revision identity participates in fingerprint so stale results cannot be reused', async () => {
    const oldRevision = input({ sourceRevisionId: 'revision-2' });
    const newRevision = input({ sourceRevisionId: 'revision-3' });
    expect(await fingerprintEngineInput(oldRevision)).not.toBe(await fingerprintEngineInput(newRevision));
  });

  it('K — weekend capacity is zero and receives no allocation', () => {
    const source = input({ planningCutoffLocalDate: '2026-08-15', planningCutoffUtc: '2026-08-15T00:00:00Z', capacityDays: days('emp-kr', '2026-08-15') });
    const result = runShadowScheduleEngine(source);
    expect(result.allocations[0].localWorkDate).toBe('2026-08-17');
  });

  it('L — public holiday capacity zero is respected', () => {
    const capacityDays = days('emp-kr').map((day) => day.localWorkDate === '2026-08-12' ? { ...day, availableCapacityMinutes: 0, capacitySource: 'PUBLIC_HOLIDAY' } : day);
    expect(runShadowScheduleEngine(input({ capacityDays })).tasks[0].shadowStart).toBe('2026-08-13');
  });

  it('M — workday override takes precedence and provides capacity', () => {
    const capacityDays = days('emp-kr', '2026-08-15').map((day) => day.localWorkDate === '2026-08-15' ? { ...day, availableCapacityMinutes: 420, capacitySource: 'WORK_OVERRIDE' } : day);
    const result = runShadowScheduleEngine(input({ planningCutoffLocalDate: '2026-08-15', planningCutoffUtc: '2026-08-15T00:00:00Z', capacityDays }));
    expect(result.allocations[0]).toMatchObject({ localWorkDate: '2026-08-15', allocatedMinutes: 420, capacitySource: 'WORK_OVERRIDE' });
  });

  it('N — Vietnam partial leave allows only remaining 240 minutes that day', () => {
    const vn = employee('emp-vn', 'VN');
    const capacityDays = days('emp-vn', '2026-08-12', 10, 480, vn.timezone).map((day) => day.localWorkDate === '2026-08-12' ? { ...day, availableCapacityMinutes: 240, capacitySource: 'WORKDAY+PARTIAL_LEAVE' } : day);
    const result = runShadowScheduleEngine(input({ employees: [vn], tasks: [task('task-1', { primaryEmployeeId: 'emp-vn', remainingEstimatedMinutes: 480 })], capacityDays }));
    expect(result.allocations[0].allocatedMinutes).toBe(240);
    expect(result.allocations[1].localWorkDate).toBe('2026-08-13');
  });

  it('O — cross-project collision follows started, fixed, priority, forecast, due, WBS, ID order', () => {
    const projects = [
      input().projects[0],
      { ...input().projects[0], id: 'project-b', name: 'B', officialForecastVersionId: 'fv-b', priorityRank: 2 },
    ];
    const result = runShadowScheduleEngine(input({
      projects,
      tasks: [
        task('task-9', { projectId: 'project-b', wbsOrder: 9, actualStarted: true, remainingEstimatedMinutes: 420 }),
        task('task-1', { projectId: 'project-a', wbsOrder: 1, remainingEstimatedMinutes: 420 }),
      ],
    }));
    expect(result.allocations[0].taskId).toBe('task-9');
    expect(runShadowScheduleEngine(input({ projects, tasks: [...result.tasks.map((item) => task(item.taskId, { projectId: item.projectId, actualStarted: item.taskId === 'task-9' }))] })).allocations[0].taskId).toBe('task-9');
  });

  it('O2 — future Temporary Primary allocations still require cross-project approval', () => {
    const projects = [
      input().projects[0],
      { id: 'project-b', name: 'B', status: 'ACTIVE', baselineStart: '2026-08-14', baselineEnd: '2026-08-14', officialStart: '2026-08-14', officialEnd: '2026-08-14', officialForecastVersionId: 'fv-b', priorityRank: 2 },
    ];
    const result = runShadowScheduleEngine(input({
      projects,
      employees: [employee('emp-kr'), employee('emp-temp')],
      capacityDays: [...days('emp-kr'), ...days('emp-temp')],
      constraints: [{ id: 'temp-start', taskId: 'task-1', type: 'NOT_BEFORE', date: '2026-08-13', timestampUtc: null, minutes: null, status: 'ACTIVE' }],
      tasks: [
        task('task-1', {
          officialStart: '2026-08-13', officialEnd: '2026-08-13', remainingEstimatedMinutes: 420,
          temporaryPrimaries: [{ employeeId: 'emp-temp', effectiveStartDate: '2026-08-13', effectiveEndDate: '2026-08-31' }],
        }),
        task('task-2', { projectId: 'project-b', primaryEmployeeId: 'emp-temp', officialStart: '2026-08-14', officialEnd: '2026-08-14', remainingEstimatedMinutes: 420 }),
      ],
    }));
    expect([...new Set(result.allocations.filter((allocation) => allocation.employeeId === 'emp-temp').map((allocation) => allocation.projectId))].sort())
      .toEqual(['project-a', 'project-b']);
    expect(result.crossProjectImpact).toBe(true);
    expect(result.approvalRequired).toBe(true);
    expect(result.projects.every((project) => project.approvalClassification === 'APPROVAL_REQUIRED')).toBe(true);
    expect(result.approvalReasonCodes).toContain('CROSS_PROJECT_IMPACT');
  });

  it('O3 — same-day Shadow allocation never starts before planning cutoff UTC', () => {
    const result = runShadowScheduleEngine(input({
      planningCutoffUtc: '2026-08-12T08:00:00.000Z',
      tasks: [task('task-1', { actualStarted: true, actualStartUtc: '2026-08-12T00:00:00.000Z', remainingEstimatedMinutes: 120 })],
      capacityDays: days('emp-kr').map((day) => day.localWorkDate === '2026-08-12'
        ? { ...day, availableCapacityMinutes: 120, capacitySource: 'WORKDAY+ACTUAL_CONSUMED' }
        : day),
    }));
    expect(result.allocations[0].localWorkDate).toBe('2026-08-13');
    expect(new Date(result.allocations[0].startsAtUtc).getTime()).toBeGreaterThanOrEqual(new Date('2026-08-12T08:00:00.000Z').getTime());
  });

  it('O4 — usable same-day capacity begins at cutoff and skips the lunch interval', () => {
    const result = runShadowScheduleEngine(input({
      planningCutoffUtc: '2026-08-12T04:00:00.000Z',
      tasks: [task('task-1', { remainingEstimatedMinutes: 120 })],
      capacityDays: days('emp-kr').map((day) => day.localWorkDate === '2026-08-12'
        ? { ...day, availableCapacityMinutes: 120, capacitySource: 'WORKDAY+ACTUAL_CONSUMED' }
        : day),
    }));
    expect(result.allocations[0]).toMatchObject({
      localWorkDate: '2026-08-12', startsAtUtc: '2026-08-12T04:00:00.000Z', endsAtUtc: '2026-08-12T06:00:00.000Z',
    });
  });

  it('P — dependency cycle blocks instead of silently dropping an edge', () => {
    const source = input({
      tasks: [task('task-1'), task('task-2')],
      dependencies: [
        { id: 'd1', projectId: 'project-a', predecessorTaskId: 'task-1', successorTaskId: 'task-2', type: 'FINISH_TO_START', lagWorkMinutes: 0, status: 'CONFIRMED' },
        { id: 'd2', projectId: 'project-a', predecessorTaskId: 'task-2', successorTaskId: 'task-1', type: 'FINISH_TO_START', lagWorkMinutes: 0, status: 'CONFIRMED' },
      ],
    });
    expect(validateDependencyGraph(source).map((issue) => issue.code)).toContain('DEPENDENCY_CYCLE_DETECTED');
    expect(runShadowScheduleEngine(source).status).toBe('BLOCKED');
  });

  it.each([
    ['DEPENDENCY_SELF_REFERENCE', [{ id: 'bad', projectId: 'project-a', predecessorTaskId: 'task-1', successorTaskId: 'task-1', type: 'FINISH_TO_START' as const, lagWorkMinutes: 0, status: 'CONFIRMED' as const }]],
    ['DEPENDENCY_TASK_NOT_FOUND', [{ id: 'bad', projectId: 'project-a', predecessorTaskId: 'missing', successorTaskId: 'task-1', type: 'FINISH_TO_START' as const, lagWorkMinutes: 0, status: 'CONFIRMED' as const }]],
    ['INVALID_DEPENDENCY_LAG', [{ id: 'bad', projectId: 'project-a', predecessorTaskId: 'task-1', successorTaskId: 'task-2', type: 'FINISH_TO_START' as const, lagWorkMinutes: -1, status: 'CONFIRMED' as const }]],
  ])('P2 — %s blocks its project instead of being silently ignored', (code, dependencies) => {
    const result = runShadowScheduleEngine(input({ tasks: [task('task-1'), task('task-2')], dependencies }));
    expect(result.status).toBe('BLOCKED');
    expect(result.validationIssues.map((issue) => issue.code)).toContain(code);
    expect(result.tasks.every((item) => item.dataConfidence === 'BLOCKED')).toBe(true);
    expect(result.tasks.every((item) => item.impactReasonCodes.includes(code))).toBe(true);
  });

  it('Q — FIXED_START conflict keeps date and reports a violation', () => {
    const source = input({
      tasks: [task('task-1', { remainingEstimatedMinutes: 60 })],
      constraints: [{ id: 'c1', taskId: 'task-1', type: 'FIXED_START', date: '2026-08-12', timestampUtc: null, minutes: null, status: 'ACTIVE' }],
      capacityDays: days('emp-kr').map((day) => day.localWorkDate === '2026-08-12' ? { ...day, availableCapacityMinutes: 0 } : day),
    });
    const result = runShadowScheduleEngine(source);
    expect(result.tasks[0].impactReasonCodes).toContain('FIXED_START_CAPACITY_CONFLICT');
    expect(result.tasks[0].shadowStart).toBeNull();
  });

  it('R — FIXED_END overrun is visible and approval-required', () => {
    const result = runShadowScheduleEngine(input({
      tasks: [task('task-1', { remainingEstimatedMinutes: 840 })],
      constraints: [{ id: 'c1', taskId: 'task-1', type: 'FIXED_END', date: '2026-08-12', timestampUtc: null, minutes: null, status: 'ACTIVE' }],
    }));
    expect(result.tasks[0].shadowEnd).toBe('2026-08-14');
    expect(result.tasks[0].impactReasonCodes).toContain('FIXED_END_VIOLATION');
    expect(result.tasks[0].approvalRequired).toBe(true);
  });

  it('R2 — timestamp-only FIXED_END is an end deadline, never a start offset', () => {
    const result = runShadowScheduleEngine(input({
      planningCutoffUtc: '2026-08-12T00:00:00.000Z',
      tasks: [task('task-1', { remainingEstimatedMinutes: 120 })],
      constraints: [{ id: 'c-ts-end', taskId: 'task-1', type: 'FIXED_END', date: null, timestampUtc: '2026-08-12T05:00:00.000Z', minutes: null, status: 'ACTIVE' }],
    }));
    expect(result.allocations[0].startsAtUtc).toBe('2026-08-12T00:00:00.000Z');
    expect(result.allocations.at(-1)?.endsAtUtc).toBe('2026-08-12T02:00:00.000Z');
    expect(result.tasks[0].impactReasonCodes).not.toContain('FIXED_END_VIOLATION');

    const overrun = runShadowScheduleEngine(input({
      planningCutoffUtc: '2026-08-12T00:00:00.000Z',
      tasks: [task('task-1', { remainingEstimatedMinutes: 360 })],
      constraints: [{ id: 'c-ts-end-overrun', taskId: 'task-1', type: 'FIXED_END', date: null, timestampUtc: '2026-08-12T05:00:00.000Z', minutes: null, status: 'ACTIVE' }],
    }));
    expect(overrun.tasks[0].impactReasonCodes).toContain('FIXED_END_VIOLATION');
    expect(overrun.tasks[0]).toMatchObject({ constraintResult: 'FIXED_END_VIOLATION', approvalRequired: true });
  });

  it('R3 — a timestamp FIXED_START before the planning cutoff is blocked, never shifted', () => {
    const result = runShadowScheduleEngine(input({
      planningCutoffUtc: '2026-08-12T04:00:00.000Z',
      tasks: [task('task-1', { remainingEstimatedMinutes: 120 })],
      constraints: [{ id: 'c-past-start', taskId: 'task-1', type: 'FIXED_START', date: null, timestampUtc: '2026-08-12T02:00:00.000Z', minutes: null, status: 'ACTIVE' }],
    }));
    expect(result.tasks[0]).toMatchObject({
      shadowStart: null, shadowEnd: null, constraintResult: 'FIXED_START_CAPACITY_CONFLICT',
      dataConfidence: 'BLOCKED', approvalRequired: true,
    });
    expect(result.allocations).toHaveLength(0);
  });

  it('R3b — a fixed slot reserves only its interval and leaves earlier capacity usable', () => {
    const result = runShadowScheduleEngine(input({
      planningCutoffUtc: '2026-08-12T00:00:00.000Z',
      tasks: [
        task('task-fixed', { remainingEstimatedMinutes: 60, officialStart: '2026-08-12', officialEnd: '2026-08-12' }),
        task('task-asap', { wbsOrder: 2, remainingEstimatedMinutes: 240, officialStart: '2026-08-12', officialEnd: '2026-08-12' }),
      ],
      constraints: [{ id: 'fixed-slot', taskId: 'task-fixed', type: 'FIXED_START', date: null, timestampUtc: '2026-08-12T04:00:00.000Z', minutes: null, status: 'ACTIVE' }],
    }));
    expect(result.allocations.filter((allocation) => allocation.taskId === 'task-fixed')).toEqual([
      expect.objectContaining({ startsAtUtc: '2026-08-12T04:00:00.000Z', endsAtUtc: '2026-08-12T05:00:00.000Z' }),
    ]);
    expect(result.allocations.filter((allocation) => allocation.taskId === 'task-asap').map((allocation) => allocation.allocatedMinutes)).toEqual([180, 60]);
    expect(result.tasks.find((taskResult) => taskResult.taskId === 'task-asap')?.shadowEnd).toBe('2026-08-12');
  });

  it('R3c — valid fixed constraints and temporary-primary handoffs always require approval', () => {
    const fixed = runShadowScheduleEngine(input({
      planningCutoffUtc: '2026-08-12T00:00:00.000Z',
      tasks: [task('task-1', { remainingEstimatedMinutes: 60, officialStart: '2026-08-12', officialEnd: '2026-08-12' })],
      constraints: [{ id: 'fixed-valid', taskId: 'task-1', type: 'FIXED_END', date: '2026-08-12', timestampUtc: null, minutes: null, status: 'ACTIVE' }],
    }));
    expect(fixed.tasks[0].impactReasonCodes).toContain('FIXED_CONSTRAINT');
    expect(fixed.projects[0].approvalClassification).toBe('APPROVAL_REQUIRED');

    const temporary = runShadowScheduleEngine(input({
      planningCutoffUtc: '2026-08-12T00:00:00.000Z',
      employees: [employee('emp-kr'), employee('emp-temp')],
      capacityDays: [...days('emp-kr'), ...days('emp-temp')],
      tasks: [task('task-1', {
        remainingEstimatedMinutes: 60, officialStart: '2026-08-12', officialEnd: '2026-08-12',
        temporaryPrimaries: [{ employeeId: 'emp-temp', effectiveStartDate: '2026-08-12', effectiveEndDate: '2026-08-12' }],
      })],
    }));
    expect(temporary.tasks[0].impactReasonCodes).toContain('TEMPORARY_PRIMARY');
    expect(temporary.projects[0].approvalClassification).toBe('APPROVAL_REQUIRED');
  });

  it('R3d — timestamp FIXED_START preserves its UTC instant across a future KR to VN handoff', () => {
    const vn = employee('emp-vn', 'VN');
    const result = runShadowScheduleEngine(input({
      planningCutoffUtc: '2026-08-12T00:00:00.000Z',
      employees: [employee('emp-kr'), vn],
      capacityDays: [...days('emp-kr'), ...days('emp-vn', '2026-08-12', 10, 480, 'Asia/Ho_Chi_Minh')],
      tasks: [task('task-1', {
        remainingEstimatedMinutes: 60,
        temporaryPrimaries: [{ employeeId: 'emp-vn', effectiveStartDate: '2026-08-13', effectiveEndDate: '2026-08-31' }],
      })],
      constraints: [{ id: 'fixed-vn-instant', taskId: 'task-1', type: 'FIXED_START', date: null, timestampUtc: '2026-08-13T01:00:00.000Z', minutes: null, status: 'ACTIVE' }],
    }));
    expect(result.allocations[0]).toMatchObject({ employeeId: 'emp-vn', startsAtUtc: '2026-08-13T01:00:00.000Z' });
  });

  it('R3e — any temporary-primary segment remains approval-required after original Primary resumes', () => {
    const vn = employee('emp-vn', 'VN');
    const result = runShadowScheduleEngine(input({
      planningCutoffUtc: '2026-08-12T00:00:00.000Z',
      employees: [employee('emp-kr'), vn],
      capacityDays: [...days('emp-kr'), ...days('emp-vn', '2026-08-12', 10, 480, 'Asia/Ho_Chi_Minh')],
      tasks: [task('task-1', {
        remainingEstimatedMinutes: 600, officialStart: '2026-08-12', officialEnd: '2026-08-13',
        temporaryPrimaries: [{ employeeId: 'emp-vn', effectiveStartDate: '2026-08-12', effectiveEndDate: '2026-08-12' }],
      })],
    }));
    expect(result.allocations.map((allocation) => allocation.employeeId)).toEqual(['emp-vn', 'emp-kr']);
    expect(result.tasks[0].employeeId).toBe('emp-kr');
    expect(result.tasks[0].impactReasonCodes).toContain('TEMPORARY_PRIMARY');
    expect(result.projects[0].approvalClassification).toBe('APPROVAL_REQUIRED');
  });

  it.each([
    [{ id: 'bad-ts', taskId: 'task-1', type: 'FIXED_START' as const, date: null, timestampUtc: 'not-an-iso-timestamp', minutes: null, status: 'ACTIVE' }],
    [{ id: 'bad-date', taskId: 'task-1', type: 'NOT_BEFORE' as const, date: 'not-a-date', timestampUtc: null, minutes: null, status: 'ACTIVE' }],
    [{ id: 'bad-calendar', taskId: 'task-1', type: 'FIXED_END' as const, date: '2026-99-99', timestampUtc: null, minutes: null, status: 'ACTIVE' }],
  ])('R4 — invalid constraint snapshots block with a stable code instead of throwing', (constraint) => {
    const result = runShadowScheduleEngine(input({ constraints: [constraint] }));
    expect(result.status).toBe('BLOCKED');
    expect(result.validationIssues.map((issue) => issue.code)).toContain('CONSTRAINT_CONFLICT');
    expect(result.tasks[0]).toMatchObject({ dataConfidence: 'BLOCKED', changeDirection: 'BLOCKED', approvalRequired: true });
  });

  it('S — pending overtime is informational and blocks auto-apply eligibility', () => {
    const result = runShadowScheduleEngine(input({ pendingOvertimeTaskIds: ['task-1'] }));
    expect(result.tasks[0].impactReasonCodes).toContain('PENDING_OVERTIME');
    expect(result.tasks[0].approvalRequired).toBe(true);
  });

  it('T — temporary primary applies only inside its effective period', () => {
    const source = task('task-1', { temporaryPrimaries: [{ employeeId: 'emp-temp', effectiveStartDate: '2026-08-12', effectiveEndDate: '2026-08-13' }] });
    expect(resolveEffectivePrimary(source, '2026-08-12')).toBe('emp-temp');
    expect(resolveEffectivePrimary(source, '2026-08-14')).toBe('emp-kr');
  });

  it('U — actual before confirmed dependency is preserved as an actual fact', () => {
    const result = runShadowScheduleEngine(input({
      tasks: [
        task('task-1', { completed: true, actualEndUtc: '2026-08-13T08:00:00Z', remainingEstimatedMinutes: 0 }),
        task('task-2', { completed: true, actualStartUtc: '2026-08-12T00:00:00Z', actualEndUtc: '2026-08-12T08:00:00Z', remainingEstimatedMinutes: 0 }),
      ],
      dependencies: [{ id: 'd1', projectId: 'project-a', predecessorTaskId: 'task-1', successorTaskId: 'task-2', type: 'FINISH_TO_START', lagWorkMinutes: 0, status: 'CONFIRMED' }],
    }));
    const successor = result.tasks.find((item) => item.taskId === 'task-2');
    expect(successor?.shadowStart).toBe('2026-08-12');
    expect(successor?.impactReasonCodes).toContain('ACTUAL_PRECEDES_CONFIRMED_DEPENDENCY');
    expect(successor?.approvalRequired).toBe(true);
  });

  it('U2 — date-only predecessor completion still detects an impossible Actual sequence', () => {
    const result = runShadowScheduleEngine(input({
      tasks: [
        task('task-1', { completed: true, actualEndUtc: null, actualEndLocalDate: '2026-08-13', remainingEstimatedMinutes: 0 }),
        task('task-2', { completed: true, actualStartUtc: '2026-08-12T00:00:00Z', actualEndUtc: '2026-08-12T08:00:00Z', remainingEstimatedMinutes: 0 }),
      ],
      dependencies: [{ id: 'd-u2', projectId: 'project-a', predecessorTaskId: 'task-1', successorTaskId: 'task-2', type: 'FINISH_TO_START', lagWorkMinutes: 0, status: 'CONFIRMED' }],
    }));
    const successor = result.tasks.find((item) => item.taskId === 'task-2');
    expect(successor?.impactReasonCodes).toContain('ACTUAL_PRECEDES_CONFIRMED_DEPENDENCY');
    expect(successor?.approvalRequired).toBe(true);
  });

  it('V — Korea/Vietnam local conversion does not produce a one-day handoff error', () => {
    expect(localDateTimeToUtc('2026-08-13', '08:00', 'Asia/Ho_Chi_Minh')).toBe('2026-08-13T01:00:00.000Z');
    expect(localDateTimeToUtc('2026-08-13', '09:00', 'Asia/Seoul')).toBe('2026-08-13T00:00:00.000Z');
  });

  it('W — engine output is separate and leaves official Forecast input byte-identical', () => {
    const source = input();
    const officialBefore = canonicalJson({ projects: source.projects, tasks: source.tasks.map(({ officialStart, officialEnd }) => ({ officialStart, officialEnd })) });
    runShadowScheduleEngine(source);
    const officialAfter = canonicalJson({ projects: source.projects, tasks: source.tasks.map(({ officialStart, officialEnd }) => ({ officialStart, officialEnd })) });
    expect(officialAfter).toBe(officialBefore);
  });

  it('X — Baseline input remains byte-identical', () => {
    const source = input();
    const before = canonicalJson(source.tasks.map(({ baselineStart, baselineEnd }) => ({ baselineStart, baselineEnd })));
    runShadowScheduleEngine(source);
    expect(canonicalJson(source.tasks.map(({ baselineStart, baselineEnd }) => ({ baselineStart, baselineEnd })))).toBe(before);
  });

  it('Y — ten deterministic runs have identical tasks, allocations, dates, and diffs', async () => {
    const source = input({ tasks: [task('task-2', { wbsOrder: 2 }), task('task-1', { wbsOrder: 1 })] });
    const fingerprint = await fingerprintEngineInput(source);
    const results = Array.from({ length: 10 }, () => canonicalJson(runShadowScheduleEngine(source)));
    expect(new Set(results).size).toBe(1);
    expect(await fingerprintEngineInput(source)).toBe(fingerprint);
  });

  it('Z — project actual progress fields are never part of or mutated by Shadow output', () => {
    const source = input();
    const actualProgress = 37;
    const result = runShadowScheduleEngine(source);
    expect(actualProgress).toBe(37);
    expect('progress' in result.projects[0]).toBe(false);
    expect('progress' in result.tasks[0]).toBe(false);
  });
});

describe('Checkpoint 3A dependency proposal policy', () => {
  it('creates PROPOSED-quality candidates while protecting parallel overlaps', () => {
    const result = generateDependencyProposals([
      { id: 'a', projectId: 'p', groupId: 'g', groupOrder: 1, taskOrder: 1, name: '분석', baselineStart: '2026-08-12', baselineEnd: '2026-08-12', officialStart: '2026-08-12', officialEnd: '2026-08-12', primaryEmployeeId: 'e' },
      { id: 'b', projectId: 'p', groupId: 'g', groupOrder: 1, taskOrder: 2, name: '구현', baselineStart: '2026-08-13', baselineEnd: '2026-08-14', officialStart: '2026-08-13', officialEnd: '2026-08-14', primaryEmployeeId: 'e' },
      { id: 'c', projectId: 'p', groupId: 'g', groupOrder: 1, taskOrder: 3, name: '프론트엔드', baselineStart: '2026-08-14', baselineEnd: '2026-08-15', officialStart: '2026-08-14', officialEnd: '2026-08-15', primaryEmployeeId: 'x' },
    ]);
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]).toMatchObject({ predecessorTaskId: 'a', successorTaskId: 'b' });
    expect(result.parallelTaskIds).toContain('b');
    expect(result.parallelTaskIds).toContain('c');
  });

  it('canonical JSON is key-order invariant', () => {
    expect(canonicalJson({ b: 2, a: { d: 4, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 4 }, b: 2 }));
  });
});
