export const SHADOW_ENGINE_VERSION = '3A.1.3';

export type ShadowConfidence = 'HIGH' | 'PROVISIONAL' | 'LOW' | 'BLOCKED';
export type ApprovalClassification = 'AUTO_APPLY_ELIGIBLE' | 'APPROVAL_REQUIRED' | 'BLOCKED' | 'NO_CHANGE';
export type ConstraintType = 'AS_SOON_AS_POSSIBLE' | 'NOT_BEFORE' | 'FIXED_START' | 'FIXED_END' | 'MILESTONE';

export interface ShadowProjectInput {
  id: string;
  name: string;
  status: string;
  baselineStart: string | null;
  baselineEnd: string | null;
  officialStart: string | null;
  officialEnd: string | null;
  officialForecastVersionId: string | null;
  priorityRank: number;
}

export interface TemporaryPrimaryInput {
  employeeId: string;
  effectiveStartDate: string;
  effectiveEndDate: string;
}

export interface ShadowTaskInput {
  id: string;
  projectId: string;
  groupId: string | null;
  wbsOrder: number;
  name: string;
  status: string;
  baselineStart: string | null;
  baselineEnd: string | null;
  officialStart: string | null;
  officialEnd: string | null;
  dueDate: string | null;
  primaryEmployeeId: string | null;
  temporaryPrimaries: TemporaryPrimaryInput[];
  actualStarted: boolean;
  actualStartUtc: string | null;
  actualEndUtc: string | null;
  actualEndLocalDate: string | null;
  completed: boolean;
  completionReported: boolean;
  baselineWorkMinutes?: number | null;
  remainingEstimatedMinutes: number | null;
  confirmedEffortMinutes: number | null;
  proposedEffortMinutes: number | null;
  approvedActualMinutes: number;
}

export interface DependencyInput {
  id: string;
  projectId: string;
  predecessorTaskId: string;
  successorTaskId: string;
  type: 'FINISH_TO_START';
  lagWorkMinutes: number;
  status: 'PROPOSED' | 'CONFIRMED' | 'REJECTED' | 'DISABLED';
}

export interface ConstraintInput {
  id: string;
  taskId: string;
  type: ConstraintType;
  date: string | null;
  timestampUtc: string | null;
  minutes: number | null;
  status: string;
}

export interface ShadowEmployeeInput {
  id: string;
  name: string;
  countryCode: 'KR' | 'VN';
  timezone: string;
  workStartLocal: string;
  workEndLocal: string;
  lunchStartLocal: string;
  lunchEndLocal: string;
  defaultCapacityMinutes: number;
}

export interface CapacityDayInput {
  employeeId: string;
  localWorkDate: string;
  timezone: string;
  availableCapacityMinutes: number;
  capacitySource: string;
}

export interface ShadowEngineInput {
  engineVersion: string;
  planningCutoffUtc: string;
  planningCutoffLocalDate: string;
  basedOnBaselineVersion: number | null;
  basedOnForecastVersion: number | null;
  sourceWorklogId: string | null;
  sourceRevisionId: string | null;
  sourceEmployeeId: string | null;
  sourceProjectId: string | null;
  noActualTrigger?: boolean;
  projects: ShadowProjectInput[];
  tasks: ShadowTaskInput[];
  dependencies: DependencyInput[];
  constraints: ConstraintInput[];
  employees: ShadowEmployeeInput[];
  capacityDays: CapacityDayInput[];
  pendingOvertimeTaskIds: string[];
  dataGapEmployeeDates: Array<{ employeeId: string; localWorkDate: string }>;
}

export interface EngineValidationIssue {
  code: string;
  projectId?: string;
  taskId?: string;
  dependencyId?: string;
  details?: Record<string, unknown>;
}

export interface ShadowAllocationResult {
  taskId: string;
  projectId: string;
  employeeId: string;
  localWorkDate: string;
  timezone: string;
  availableCapacityMinutes: number;
  allocatedMinutes: number;
  capacitySource: string;
  priorityOrder: number;
  allocationSequence: number;
  startsAtUtc: string;
  endsAtUtc: string;
}

export interface ShadowTaskResult {
  taskId: string;
  projectId: string;
  employeeId: string | null;
  baselineStart: string | null;
  baselineEnd: string | null;
  officialStart: string | null;
  officialEnd: string | null;
  shadowStart: string | null;
  shadowEnd: string | null;
  deltaStartWorkdays: number;
  deltaEndWorkdays: number;
  remainingMinutes: number;
  allocationSource: string;
  constraintResult: string;
  dependencyResult: string;
  priorityResult: string;
  impactReasonCodes: string[];
  approvalRequired: boolean;
  dataConfidence: ShadowConfidence;
  changeDirection: 'ADVANCED' | 'DELAYED' | 'UNCHANGED' | 'BLOCKED';
}

export interface ShadowProjectResult {
  projectId: string;
  baselineStart: string | null;
  baselineEnd: string | null;
  officialStart: string | null;
  officialEnd: string | null;
  shadowStart: string | null;
  shadowEnd: string | null;
  scheduleVarianceWorkdays: number;
  varianceCalendarEmployeeId: string | null;
  varianceCalendarTimezone: string | null;
  varianceCalendarBasis: string;
  approvalClassification: ApprovalClassification;
  approvalReasons: string[];
  dataConfidence: ShadowConfidence;
}

export interface ShadowEngineResult {
  status: 'COMPLETED' | 'BLOCKED';
  dataConfidence: ShadowConfidence;
  validationIssues: EngineValidationIssue[];
  tasks: ShadowTaskResult[];
  projects: ShadowProjectResult[];
  allocations: ShadowAllocationResult[];
  affectedProjectCount: number;
  affectedTaskCount: number;
  tasksAdvancedCount: number;
  tasksDelayedCount: number;
  unchangedTaskCount: number;
  crossProjectImpact: boolean;
  approvalRequired: boolean;
  approvalReasonCodes: string[];
}

const MAX_PLANNING_DAYS = 730;

function compareNullable(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}

function nextDate(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

export function utcToLocalDate(utc: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(utc));
}

function utcToLocalTime(utc: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(utc));
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '00';
  return `${value('hour')}:${value('minute')}`;
}

function minuteOfDay(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function timeFromMinute(value: number): string {
  const normalized = Math.max(0, Math.min(1439, value));
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function getTimeZoneOffsetMs(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const values: Record<string, string> = {};
  for (const part of parts) if (part.type !== 'literal') values[part.type] = part.value;
  return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second)) - date.getTime();
}

export function localDateTimeToUtc(localDate: string, localTime: string, timezone: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  const [hour, minute] = localTime.split(':').map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const first = new Date(guess.getTime() - getTimeZoneOffsetMs(guess, timezone));
  const second = new Date(guess.getTime() - getTimeZoneOffsetMs(first, timezone));
  return second.toISOString();
}

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(object).sort().map((key) => [key, canonicalize(object[key])]));
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((part) => part.toString(16).padStart(2, '0')).join('');
}

export function normalizeEngineInput(input: ShadowEngineInput): ShadowEngineInput {
  return {
    ...input,
    projects: [...input.projects].sort((a, b) => a.id.localeCompare(b.id)),
    tasks: [...input.tasks].map((task) => ({
      ...task,
      temporaryPrimaries: [...task.temporaryPrimaries].sort((a, b) =>
        a.effectiveStartDate.localeCompare(b.effectiveStartDate) || a.employeeId.localeCompare(b.employeeId)),
    })).sort((a, b) => a.projectId.localeCompare(b.projectId) || a.wbsOrder - b.wbsOrder || a.id.localeCompare(b.id)),
    dependencies: [...input.dependencies].sort((a, b) =>
      a.projectId.localeCompare(b.projectId) || a.predecessorTaskId.localeCompare(b.predecessorTaskId) || a.successorTaskId.localeCompare(b.successorTaskId)),
    constraints: [...input.constraints].sort((a, b) => a.taskId.localeCompare(b.taskId) || a.type.localeCompare(b.type) || a.id.localeCompare(b.id)),
    employees: [...input.employees].sort((a, b) => a.id.localeCompare(b.id)),
    capacityDays: [...input.capacityDays].sort((a, b) => a.localWorkDate.localeCompare(b.localWorkDate) || a.employeeId.localeCompare(b.employeeId)),
    pendingOvertimeTaskIds: [...new Set(input.pendingOvertimeTaskIds)].sort(),
    dataGapEmployeeDates: [...input.dataGapEmployeeDates].sort((a, b) =>
      a.localWorkDate.localeCompare(b.localWorkDate) || a.employeeId.localeCompare(b.employeeId)),
  };
}

export async function fingerprintEngineInput(input: ShadowEngineInput): Promise<string> {
  return sha256Hex(canonicalJson(normalizeEngineInput(input)));
}

export function validateDependencyGraph(input: ShadowEngineInput): EngineValidationIssue[] {
  const tasks = new Map(input.tasks.map((task) => [task.id, task]));
  const confirmed = input.dependencies.filter((dependency) => dependency.status === 'CONFIRMED');
  const issues: EngineValidationIssue[] = [];
  const seen = new Set<string>();
  const adjacency = new Map<string, string[]>();

  for (const dependency of confirmed) {
    const predecessor = tasks.get(dependency.predecessorTaskId);
    const successor = tasks.get(dependency.successorTaskId);
    if (dependency.predecessorTaskId === dependency.successorTaskId) {
      issues.push({ code: 'DEPENDENCY_SELF_REFERENCE', dependencyId: dependency.id, projectId: dependency.projectId });
      continue;
    }
    if (!predecessor || !successor) {
      issues.push({ code: 'DEPENDENCY_TASK_NOT_FOUND', dependencyId: dependency.id, projectId: dependency.projectId });
      continue;
    }
    if (predecessor.projectId !== successor.projectId || predecessor.projectId !== dependency.projectId) {
      issues.push({ code: 'DEPENDENCY_CROSS_PROJECT_NOT_SUPPORTED', dependencyId: dependency.id, projectId: dependency.projectId });
      continue;
    }
    if (!Number.isInteger(dependency.lagWorkMinutes) || dependency.lagWorkMinutes < 0) {
      issues.push({ code: 'INVALID_DEPENDENCY_LAG', dependencyId: dependency.id, projectId: dependency.projectId });
      continue;
    }
    const key = `${dependency.predecessorTaskId}|${dependency.successorTaskId}|${dependency.type}`;
    if (seen.has(key)) {
      issues.push({ code: 'DEPENDENCY_DUPLICATE', dependencyId: dependency.id, projectId: dependency.projectId });
      continue;
    }
    seen.add(key);
    const edges = adjacency.get(dependency.predecessorTaskId) || [];
    edges.push(dependency.successorTaskId);
    adjacency.set(dependency.predecessorTaskId, edges);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const cycles = new Set<string>();
  const visit = (taskId: string) => {
    if (visited.has(taskId)) return;
    if (visiting.has(taskId)) {
      const start = stack.indexOf(taskId);
      cycles.add([...stack.slice(start), taskId].join('>'));
      return;
    }
    visiting.add(taskId);
    stack.push(taskId);
    for (const successor of [...(adjacency.get(taskId) || [])].sort()) visit(successor);
    stack.pop();
    visiting.delete(taskId);
    visited.add(taskId);
  };
  for (const taskId of [...tasks.keys()].sort()) visit(taskId);
  for (const cycle of [...cycles].sort()) {
    const firstTask = cycle.split('>')[0];
    issues.push({ code: 'DEPENDENCY_CYCLE_DETECTED', projectId: tasks.get(firstTask)?.projectId, details: { cycle } });
  }
  return issues;
}

export function resolveRemainingEffort(task: ShadowTaskInput, baselineWorkMinutes: number): {
  minutes: number;
  source: string;
  confidence: ShadowConfidence;
  approvalRequired: boolean;
  reasonCodes: string[];
} {
  if (task.completed) return { minutes: 0, source: 'ACTUAL_COMPLETED', confidence: 'HIGH', approvalRequired: false, reasonCodes: [] };
  if (task.remainingEstimatedMinutes !== null && task.remainingEstimatedMinutes >= 0) {
    return { minutes: Math.round(task.remainingEstimatedMinutes), source: 'PRIMARY_REMAINING', confidence: 'HIGH', approvalRequired: false, reasonCodes: [] };
  }
  if (task.confirmedEffortMinutes !== null) {
    return {
      minutes: Math.max(0, Math.round(task.confirmedEffortMinutes - task.approvedActualMinutes)),
      source: 'CONFIRMED_EFFORT_MINUS_APPROVED_ACTUAL', confidence: 'HIGH', approvalRequired: false, reasonCodes: [],
    };
  }
  if (task.proposedEffortMinutes !== null) {
    return {
      minutes: Math.max(0, Math.round(task.proposedEffortMinutes - task.approvedActualMinutes)),
      source: 'PROPOSED_EFFORT_MINUS_APPROVED_ACTUAL', confidence: 'PROVISIONAL', approvalRequired: true,
      reasonCodes: ['PROPOSED_EFFORT'],
    };
  }
  return {
    minutes: Math.max(0, Math.round(baselineWorkMinutes - task.approvedActualMinutes)),
    source: 'BASELINE_DURATION_FALLBACK', confidence: 'LOW', approvalRequired: true,
    reasonCodes: ['MISSING_PRIMARY_REMAINING_ESTIMATE', 'BASELINE_DURATION_FALLBACK'],
  };
}

export function resolveEffectivePrimary(task: ShadowTaskInput, localDate: string): string | null {
  const temporary = task.temporaryPrimaries.find((assignment) =>
    assignment.effectiveStartDate <= localDate && assignment.effectiveEndDate >= localDate);
  return temporary?.employeeId || task.primaryEmployeeId;
}

function confidenceRank(confidence: ShadowConfidence): number {
  return { HIGH: 0, PROVISIONAL: 1, LOW: 2, BLOCKED: 3 }[confidence];
}

function worstConfidence(values: ShadowConfidence[]): ShadowConfidence {
  return [...values].sort((a, b) => confidenceRank(b) - confidenceRank(a))[0] || 'HIGH';
}

function taskPriority(task: ShadowTaskInput, project: ShadowProjectInput, constraint: ConstraintInput | null): Array<string | number> {
  const fixed = constraint && ['FIXED_START', 'FIXED_END', 'MILESTONE'].includes(constraint.type) ? 0 : 1;
  return [task.actualStarted ? 0 : 1, fixed, project.priorityRank, task.officialStart || '9999-12-31', task.dueDate || '9999-12-31', task.wbsOrder, task.id];
}

function comparePriority(a: Array<string | number>, b: Array<string | number>): number {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const left = a[index];
    const right = b[index];
    if (left === right) continue;
    if (typeof left === 'number' && typeof right === 'number') return left - right;
    return String(left).localeCompare(String(right));
  }
  return 0;
}

function workdayDelta(from: string | null, to: string | null, employeeId: string | null, capacityDays: CapacityDayInput[]): number {
  if (!from || !to || from === to) return 0;
  const direction = to > from ? 1 : -1;
  const low = direction > 0 ? from : to;
  const high = direction > 0 ? to : from;
  const dates = new Set(capacityDays.filter((day) =>
    (!employeeId || day.employeeId === employeeId) && day.availableCapacityMinutes > 0 && day.localWorkDate > low && day.localWorkDate <= high
  ).map((day) => day.localWorkDate));
  return dates.size * direction;
}

function baselineMinutes(task: ShadowTaskInput, employeeId: string | null, capacityDays: CapacityDayInput[], employees: Map<string, ShadowEmployeeInput>): number {
  if (task.baselineWorkMinutes !== null && task.baselineWorkMinutes !== undefined) return Math.max(0, Math.round(task.baselineWorkMinutes));
  if (!task.baselineStart || !task.baselineEnd || !employeeId) return employees.get(employeeId || '')?.defaultCapacityMinutes || 0;
  const distinct = new Set(capacityDays.filter((day) =>
    day.employeeId === employeeId && day.localWorkDate >= task.baselineStart! && day.localWorkDate <= task.baselineEnd! && day.availableCapacityMinutes > 0
  ).map((day) => day.localWorkDate));
  const defaultCapacity = employees.get(employeeId)?.defaultCapacityMinutes || 0;
  return Math.max(defaultCapacity, distinct.size * defaultCapacity);
}

function workMinuteOffset(localTime: string, employee: ShadowEmployeeInput): number {
  const clock = minuteOfDay(localTime);
  const workStart = minuteOfDay(employee.workStartLocal);
  const lunchStart = minuteOfDay(employee.lunchStartLocal);
  const lunchEnd = minuteOfDay(employee.lunchEndLocal);
  if (clock <= workStart) return 0;
  if (clock <= lunchStart) return clock - workStart;
  if (clock <= lunchEnd) return Math.max(0, lunchStart - workStart);
  return Math.max(0, lunchStart - workStart) + (clock - lunchEnd);
}

function allocationTimes(employee: ShadowEmployeeInput, localDate: string, usedBefore: number, allocated: number): { start: string; end: string } {
  const workStart = minuteOfDay(employee.workStartLocal);
  const lunchStart = minuteOfDay(employee.lunchStartLocal);
  const lunchEnd = minuteOfDay(employee.lunchEndLocal);
  const toClockMinute = (workMinute: number, boundary: 'START' | 'END') => {
    const beforeLunchCapacity = Math.max(0, lunchStart - workStart);
    return boundary === 'END' && workMinute <= beforeLunchCapacity || boundary === 'START' && workMinute < beforeLunchCapacity
      ? workStart + workMinute
      : lunchEnd + (workMinute - beforeLunchCapacity);
  };
  return {
    start: localDateTimeToUtc(localDate, timeFromMinute(toClockMinute(usedBefore, 'START')), employee.timezone),
    end: localDateTimeToUtc(localDate, timeFromMinute(toClockMinute(usedBefore + allocated, 'END')), employee.timezone),
  };
}

export function runShadowScheduleEngine(rawInput: ShadowEngineInput): ShadowEngineResult {
  const input = normalizeEngineInput(rawInput);
  const validationIssues = validateDependencyGraph(input);
  const dependencyBlockingCodes = new Set([
    'DEPENDENCY_CYCLE_DETECTED', 'DEPENDENCY_SELF_REFERENCE', 'DEPENDENCY_DUPLICATE',
    'DEPENDENCY_TASK_NOT_FOUND', 'DEPENDENCY_CROSS_PROJECT_NOT_SUPPORTED', 'INVALID_DEPENDENCY_LAG',
  ]);
  const dependencyBlockingProjects = new Set(validationIssues
    .filter((issue) => dependencyBlockingCodes.has(issue.code))
    .map((issue) => issue.projectId).filter(Boolean) as string[]);
  const dependencyBlockingReasons = new Map<string, string[]>();
  for (const issue of validationIssues.filter((item) => dependencyBlockingCodes.has(item.code) && item.projectId)) {
    const reasons = dependencyBlockingReasons.get(issue.projectId!) || [];
    reasons.push(issue.code);
    dependencyBlockingReasons.set(issue.projectId!, [...new Set(reasons)].sort());
  }
  const projectMap = new Map(input.projects.map((project) => [project.id, project]));
  const taskMap = new Map(input.tasks.map((task) => [task.id, task]));
  const employeeMap = new Map(input.employees.map((employee) => [employee.id, employee]));

  if (input.noActualTrigger && validationIssues.length === 0) {
    const tasks: ShadowTaskResult[] = input.tasks.map((task): ShadowTaskResult => ({
      taskId: task.id, projectId: task.projectId, employeeId: task.primaryEmployeeId,
      baselineStart: task.baselineStart, baselineEnd: task.baselineEnd,
      officialStart: task.officialStart, officialEnd: task.officialEnd,
      shadowStart: task.officialStart, shadowEnd: task.officialEnd,
      deltaStartWorkdays: 0, deltaEndWorkdays: 0,
      remainingMinutes: Math.max(0, Number(task.remainingEstimatedMinutes || 0)),
      allocationSource: 'NO_ACTUAL_TRIGGER', constraintResult: 'NOT_EVALUATED', dependencyResult: 'NOT_TRIGGERED',
      priorityResult: 'OFFICIAL_ORDER_PRESERVED', impactReasonCodes: ['NO_NEW_ACTUAL_TRIGGER'],
      approvalRequired: false, dataConfidence: 'PROVISIONAL', changeDirection: 'UNCHANGED',
    })).sort((a, b) => a.projectId.localeCompare(b.projectId) || a.taskId.localeCompare(b.taskId));
    const projects: ShadowProjectResult[] = input.projects.map((project): ShadowProjectResult => ({
      projectId: project.id, baselineStart: project.baselineStart, baselineEnd: project.baselineEnd,
      officialStart: project.officialStart, officialEnd: project.officialEnd,
      shadowStart: project.officialStart, shadowEnd: project.officialEnd, scheduleVarianceWorkdays: 0,
      varianceCalendarEmployeeId: null, varianceCalendarTimezone: null,
      varianceCalendarBasis: 'NO_NEW_ACTUAL_TRIGGER', approvalClassification: 'NO_CHANGE',
      approvalReasons: ['NO_NEW_ACTUAL_TRIGGER'], dataConfidence: 'PROVISIONAL',
    })).sort((a, b) => a.projectId.localeCompare(b.projectId));
    return {
      status: 'COMPLETED', dataConfidence: 'PROVISIONAL', validationIssues: [], tasks, projects,
      allocations: [], affectedProjectCount: 0, affectedTaskCount: 0, tasksAdvancedCount: 0,
      tasksDelayedCount: 0, unchangedTaskCount: tasks.length, crossProjectImpact: false,
      approvalRequired: false, approvalReasonCodes: ['NO_NEW_ACTUAL_TRIGGER'],
    };
  }
  const constraints = new Map<string, ConstraintInput>();
  for (const constraint of input.constraints.filter((item) => item.status === 'ACTIVE')) {
    if (!constraints.has(constraint.taskId)) constraints.set(constraint.taskId, constraint);
  }
  const dependencies = input.dependencies.filter((dependency) => dependency.status === 'CONFIRMED');
  const predecessorMap = new Map<string, DependencyInput[]>();
  for (const dependency of dependencies) {
    predecessorMap.set(dependency.successorTaskId, [...(predecessorMap.get(dependency.successorTaskId) || []), dependency]);
  }

  const capacity = new Map<string, { total: number; remaining: number; source: string; timezone: string }>();
  for (const day of input.capacityDays) {
    capacity.set(`${day.employeeId}|${day.localWorkDate}`, {
      total: Math.max(0, Math.round(day.availableCapacityMinutes)),
      remaining: Math.max(0, Math.round(day.availableCapacityMinutes)),
      source: day.capacitySource,
      timezone: day.timezone,
    });
  }
  const capacityDates = [...new Set(input.capacityDays.map((day) => day.localWorkDate))].sort().slice(0, MAX_PLANNING_DAYS);
  const usedMinutes = new Map<string, number>();
  const allocations: ShadowAllocationResult[] = [];
  const results = new Map<string, ShadowTaskResult>();
  const unscheduled = new Set(input.tasks.map((task) => task.id));
  let prioritySequence = 0;

  const earliestFromPredecessors = (task: ShadowTaskInput): { date: string; releaseOffsetMinutes: number; dependencyResult: string; reasons: string[] } => {
    let earliest = input.planningCutoffLocalDate;
    let releaseOffsetMinutes = 0;
    const reasons: string[] = [];
    for (const dependency of predecessorMap.get(task.id) || []) {
      const predecessor = taskMap.get(dependency.predecessorTaskId);
      const predecessorResult = results.get(dependency.predecessorTaskId);
      let releaseDate: string | null = predecessorResult?.shadowEnd || predecessor?.officialEnd || null;
      if (predecessor?.completed && predecessor.actualEndUtc) {
        const successorEmployeeId = resolveEffectivePrimary(task, input.planningCutoffLocalDate);
        const successorTimezone = successorEmployeeId ? employeeMap.get(successorEmployeeId)?.timezone : null;
        const actualDate = successorTimezone
          ? utcToLocalDate(predecessor.actualEndUtc, successorTimezone)
          : predecessor.actualEndUtc.slice(0, 10);
        releaseDate = nextDate(actualDate);
        reasons.push('ACTUAL_COMPLETION_RELEASE');
      } else if (predecessor?.completed && predecessor.actualEndLocalDate) {
        releaseDate = nextDate(predecessor.actualEndLocalDate);
        reasons.push('ACTUAL_COMPLETION_RELEASE');
      } else if (releaseDate) {
        releaseDate = nextDate(releaseDate);
      }
      if (releaseDate && releaseDate > earliest) earliest = releaseDate;
      if (dependency.lagWorkMinutes > 0) {
        reasons.push('DEPENDENCY_LAG');
        const employeeId = resolveEffectivePrimary(task, releaseDate || earliest);
        let lagRemaining = dependency.lagWorkMinutes;
        let lagDate = releaseDate || earliest;
        for (const day of input.capacityDays.filter((item) => item.employeeId === employeeId && item.localWorkDate >= lagDate && item.availableCapacityMinutes > 0)) {
          if (lagRemaining < day.availableCapacityMinutes) {
            lagDate = day.localWorkDate;
            releaseOffsetMinutes = Math.max(releaseOffsetMinutes, lagRemaining);
            lagRemaining = 0;
            break;
          }
          lagRemaining -= day.availableCapacityMinutes;
          lagDate = nextDate(day.localWorkDate);
          releaseOffsetMinutes = 0;
        }
        if (lagDate > earliest) earliest = lagDate;
      }
    }
    return { date: earliest, releaseOffsetMinutes, dependencyResult: (predecessorMap.get(task.id) || []).length ? 'CONFIRMED_FS_APPLIED' : 'NO_CONFIRMED_DEPENDENCY', reasons };
  };

  const canSchedule = (taskId: string) => (predecessorMap.get(taskId) || []).every((dependency) =>
    results.has(dependency.predecessorTaskId) || !unscheduled.has(dependency.predecessorTaskId));

  while (unscheduled.size > 0) {
    let ready = [...unscheduled].map((id) => taskMap.get(id)!).filter((task) => canSchedule(task.id));
    if (ready.length === 0) {
      for (const taskId of [...unscheduled].sort()) {
        const task = taskMap.get(taskId)!;
        const blockingReasons = dependencyBlockingReasons.get(task.projectId) || ['DEPENDENCY_CYCLE_DETECTED'];
        results.set(taskId, {
          taskId, projectId: task.projectId, employeeId: task.primaryEmployeeId,
          baselineStart: task.baselineStart, baselineEnd: task.baselineEnd,
          officialStart: task.officialStart, officialEnd: task.officialEnd, shadowStart: null, shadowEnd: null,
          deltaStartWorkdays: 0, deltaEndWorkdays: 0, remainingMinutes: 0,
          allocationSource: 'BLOCKED', constraintResult: 'NOT_EVALUATED', dependencyResult: 'DEPENDENCY_GRAPH_BLOCKED',
          priorityResult: 'NOT_SCHEDULED', impactReasonCodes: blockingReasons, approvalRequired: true,
          dataConfidence: 'BLOCKED', changeDirection: 'BLOCKED',
        });
      }
      break;
    }
    ready = ready.sort((a, b) => comparePriority(
      taskPriority(a, projectMap.get(a.projectId)!, constraints.get(a.id) || null),
      taskPriority(b, projectMap.get(b.projectId)!, constraints.get(b.id) || null),
    ));
    const task = ready[0];
    unscheduled.delete(task.id);
    prioritySequence += 1;
    const project = projectMap.get(task.projectId)!;
    const constraint = constraints.get(task.id) || null;
    const primaryAtCutoff = resolveEffectivePrimary(task, input.planningCutoffLocalDate);
    const effort = resolveRemainingEffort(task, baselineMinutes(task, primaryAtCutoff, input.capacityDays, employeeMap));
    const reasons = [...effort.reasonCodes];
    let approvalRequired = effort.approvalRequired;
    let confidence = effort.confidence;
    let constraintResult: string = constraint?.type || 'AS_SOON_AS_POSSIBLE';
    const dependencyStart = earliestFromPredecessors(task);
    reasons.push(...dependencyStart.reasons);
    const hasUnconfirmedDependency = input.dependencies.some((dependency) =>
      dependency.status === 'PROPOSED' &&
      (dependency.predecessorTaskId === task.id || dependency.successorTaskId === task.id));
    if (hasUnconfirmedDependency) {
      approvalRequired = true;
      confidence = confidence === 'BLOCKED' || confidence === 'LOW' ? confidence : 'PROVISIONAL';
      reasons.push('UNCONFIRMED_DEPENDENCY');
    }

    if (dependencyBlockingProjects.has(task.projectId)) {
      const blockingReasons = dependencyBlockingReasons.get(task.projectId) || ['DEPENDENCY_GRAPH_INVALID'];
      results.set(task.id, {
        taskId: task.id, projectId: task.projectId, employeeId: primaryAtCutoff,
        baselineStart: task.baselineStart, baselineEnd: task.baselineEnd,
        officialStart: task.officialStart, officialEnd: task.officialEnd, shadowStart: null, shadowEnd: null,
        deltaStartWorkdays: 0, deltaEndWorkdays: 0, remainingMinutes: effort.minutes,
        allocationSource: effort.source, constraintResult, dependencyResult: 'BLOCKED', priorityResult: `ORDER_${prioritySequence}`,
        impactReasonCodes: blockingReasons, approvalRequired: true, dataConfidence: 'BLOCKED', changeDirection: 'BLOCKED',
      });
      continue;
    }
    if (!primaryAtCutoff && effort.minutes > 0) {
      validationIssues.push({ code: 'PRIMARY_ASSIGNMENT_MISSING', taskId: task.id, projectId: task.projectId });
      results.set(task.id, {
        taskId: task.id, projectId: task.projectId, employeeId: null,
        baselineStart: task.baselineStart, baselineEnd: task.baselineEnd,
        officialStart: task.officialStart, officialEnd: task.officialEnd, shadowStart: null, shadowEnd: null,
        deltaStartWorkdays: 0, deltaEndWorkdays: 0, remainingMinutes: effort.minutes,
        allocationSource: effort.source, constraintResult, dependencyResult: dependencyStart.dependencyResult,
        priorityResult: `ORDER_${prioritySequence}`, impactReasonCodes: ['PRIMARY_ASSIGNMENT_MISSING'], approvalRequired: true,
        dataConfidence: 'BLOCKED', changeDirection: 'BLOCKED',
      });
      continue;
    }
    if (primaryAtCutoff && !employeeMap.has(primaryAtCutoff) && effort.minutes > 0) {
      validationIssues.push({ code: 'CALENDAR_POLICY_MISSING', taskId: task.id, projectId: task.projectId });
      results.set(task.id, {
        taskId: task.id, projectId: task.projectId, employeeId: primaryAtCutoff,
        baselineStart: task.baselineStart, baselineEnd: task.baselineEnd,
        officialStart: task.officialStart, officialEnd: task.officialEnd, shadowStart: null, shadowEnd: null,
        deltaStartWorkdays: 0, deltaEndWorkdays: 0, remainingMinutes: effort.minutes,
        allocationSource: effort.source, constraintResult, dependencyResult: dependencyStart.dependencyResult,
        priorityResult: `ORDER_${prioritySequence}`, impactReasonCodes: ['CALENDAR_POLICY_MISSING'], approvalRequired: true,
        dataConfidence: 'BLOCKED', changeDirection: 'BLOCKED',
      });
      continue;
    }

    if (task.completed) {
      const actualEnd = task.actualEndLocalDate || task.actualEndUtc?.slice(0, 10) || task.officialEnd;
      const actualPrecedesDependency = Boolean(task.actualStartUtc && (predecessorMap.get(task.id) || []).some((dependency) => {
        const predecessor = taskMap.get(dependency.predecessorTaskId);
        return predecessor?.actualEndUtc && task.actualStartUtc! < predecessor.actualEndUtc;
      }));
      const completedReasons = actualEnd !== task.officialEnd ? ['ACTUAL_COMPLETION_DATE'] : [];
      if (actualPrecedesDependency) completedReasons.push('ACTUAL_PRECEDES_CONFIRMED_DEPENDENCY');
      results.set(task.id, {
        taskId: task.id, projectId: task.projectId, employeeId: primaryAtCutoff,
        baselineStart: task.baselineStart, baselineEnd: task.baselineEnd,
        officialStart: task.officialStart, officialEnd: task.officialEnd,
        shadowStart: task.actualStartUtc?.slice(0, 10) || task.officialStart, shadowEnd: actualEnd,
        deltaStartWorkdays: 0, deltaEndWorkdays: workdayDelta(task.officialEnd, actualEnd, primaryAtCutoff, input.capacityDays),
        remainingMinutes: 0, allocationSource: 'ACTUAL_COMPLETED', constraintResult: 'ACTUAL_FIXED',
        dependencyResult: dependencyStart.dependencyResult, priorityResult: 'ACTUAL_FIXED',
        impactReasonCodes: completedReasons, approvalRequired: actualPrecedesDependency,
        dataConfidence: 'HIGH', changeDirection: compareNullable(actualEnd, task.officialEnd) < 0 ? 'ADVANCED' : compareNullable(actualEnd, task.officialEnd) > 0 ? 'DELAYED' : 'UNCHANGED',
      });
      continue;
    }

    const taskDataGap = input.dataGapEmployeeDates.some((gap) =>
      (gap.employeeId === primaryAtCutoff || task.temporaryPrimaries.some((item) =>
        item.employeeId === gap.employeeId && item.effectiveStartDate <= gap.localWorkDate && item.effectiveEndDate >= gap.localWorkDate)) &&
      gap.localWorkDate <= input.planningCutoffLocalDate);
    if (taskDataGap) {
      results.set(task.id, {
        taskId: task.id, projectId: task.projectId, employeeId: primaryAtCutoff,
        baselineStart: task.baselineStart, baselineEnd: task.baselineEnd,
        officialStart: task.officialStart, officialEnd: task.officialEnd,
        shadowStart: task.actualStarted ? (task.actualStartUtc?.slice(0, 10) || task.officialStart) : task.officialStart,
        shadowEnd: task.officialEnd,
        deltaStartWorkdays: 0, deltaEndWorkdays: 0, remainingMinutes: effort.minutes,
        allocationSource: effort.source, constraintResult, dependencyResult: dependencyStart.dependencyResult,
        priorityResult: `ORDER_${prioritySequence}`, impactReasonCodes: [...new Set([...reasons, 'WORKLOG_DATA_GAP'])].sort(),
        approvalRequired: true, dataConfidence: 'PROVISIONAL', changeDirection: 'UNCHANGED',
      });
      continue;
    }

    if (task.completionReported && effort.minutes === 0) {
      const reportedEnd = task.actualEndLocalDate || task.actualEndUtc?.slice(0, 10) || task.officialEnd;
      results.set(task.id, {
        taskId: task.id, projectId: task.projectId, employeeId: primaryAtCutoff,
        baselineStart: task.baselineStart, baselineEnd: task.baselineEnd,
        officialStart: task.officialStart, officialEnd: task.officialEnd,
        shadowStart: task.actualStartUtc?.slice(0, 10) || task.officialStart, shadowEnd: reportedEnd,
        deltaStartWorkdays: 0, deltaEndWorkdays: workdayDelta(task.officialEnd, reportedEnd, primaryAtCutoff, input.capacityDays),
        remainingMinutes: 0, allocationSource: 'COMPLETION_REPORTED', constraintResult: 'ACTUAL_REVIEW_REQUIRED',
        dependencyResult: dependencyStart.dependencyResult, priorityResult: 'ACTUAL_REVIEW_REQUIRED',
        impactReasonCodes: [...new Set([...reasons, 'COMPLETION_REPORTED_REVIEW'])].sort(),
        approvalRequired: true, dataConfidence: 'PROVISIONAL',
        changeDirection: compareNullable(reportedEnd, task.officialEnd) < 0 ? 'ADVANCED' : compareNullable(reportedEnd, task.officialEnd) > 0 ? 'DELAYED' : 'UNCHANGED',
      });
      continue;
    }

    const constraintEmployee = primaryAtCutoff ? employeeMap.get(primaryAtCutoff) : null;
    const constraintLocalDate = constraint?.date || (constraint?.timestampUtc && constraintEmployee
      ? utcToLocalDate(constraint.timestampUtc, constraintEmployee.timezone)
      : null);
    const constraintLocalTime = constraint?.timestampUtc && constraintEmployee
      ? utcToLocalTime(constraint.timestampUtc, constraintEmployee.timezone)
      : null;
    let earliest = dependencyStart.date;
    if (task.actualStarted && task.officialStart && task.officialStart < earliest) earliest = input.planningCutoffLocalDate;
    if (constraint?.type === 'NOT_BEFORE' && constraintLocalDate && constraintLocalDate > earliest) {
      earliest = constraintLocalDate;
      reasons.push('NOT_BEFORE');
    }
    if (constraint?.type === 'FIXED_START' && constraintLocalDate) {
      if (constraintLocalDate < earliest) {
        validationIssues.push({ code: 'FIXED_START_CAPACITY_CONFLICT', taskId: task.id, projectId: task.projectId });
        reasons.push('FIXED_START_CAPACITY_CONFLICT');
        approvalRequired = true;
        confidence = 'BLOCKED';
      }
      earliest = constraintLocalDate;
    }

    const fixedStartEmployee = primaryAtCutoff ? employeeMap.get(primaryAtCutoff) : null;
    const fixedStartConstraintOffset = constraint?.type === 'FIXED_START' && constraintLocalTime && fixedStartEmployee
      ? workMinuteOffset(constraintLocalTime, fixedStartEmployee)
      : 0;
    const fixedStartCutoffDate = fixedStartEmployee
      ? utcToLocalDate(input.planningCutoffUtc, fixedStartEmployee.timezone)
      : input.planningCutoffLocalDate;
    const fixedStartCutoffOffset = fixedStartEmployee && constraintLocalDate === fixedStartCutoffDate
      ? workMinuteOffset(utcToLocalTime(input.planningCutoffUtc, fixedStartEmployee.timezone), fixedStartEmployee)
      : 0;
    const fixedStartTimeConflict = constraint?.type === 'FIXED_START' && Boolean(constraintLocalTime) && Boolean(constraintLocalDate) && (
      constraintLocalDate! < fixedStartCutoffDate ||
      (constraintLocalDate === fixedStartCutoffDate && fixedStartConstraintOffset < fixedStartCutoffOffset) ||
      (constraintLocalDate === dependencyStart.date && fixedStartConstraintOffset < dependencyStart.releaseOffsetMinutes)
    );
    if (fixedStartTimeConflict) {
      if (!reasons.includes('FIXED_START_CAPACITY_CONFLICT')) reasons.push('FIXED_START_CAPACITY_CONFLICT');
      validationIssues.push({
        code: 'FIXED_START_CAPACITY_CONFLICT', taskId: task.id, projectId: task.projectId,
        details: { fixedStart: constraint?.timestampUtc, planningCutoffUtc: input.planningCutoffUtc },
      });
      results.set(task.id, {
        taskId: task.id, projectId: task.projectId, employeeId: primaryAtCutoff,
        baselineStart: task.baselineStart, baselineEnd: task.baselineEnd,
        officialStart: task.officialStart, officialEnd: task.officialEnd, shadowStart: null, shadowEnd: null,
        deltaStartWorkdays: 0, deltaEndWorkdays: 0, remainingMinutes: effort.minutes,
        allocationSource: effort.source, constraintResult: 'FIXED_START_CAPACITY_CONFLICT',
        dependencyResult: dependencyStart.dependencyResult, priorityResult: `ORDER_${prioritySequence}`,
        impactReasonCodes: [...new Set(reasons)].sort(), approvalRequired: true,
        dataConfidence: 'BLOCKED', changeDirection: 'BLOCKED',
      });
      continue;
    }

    if (constraint?.type === 'MILESTONE') {
      const milestoneDate = constraintLocalDate && constraintLocalDate > earliest ? constraintLocalDate : earliest;
      results.set(task.id, {
        taskId: task.id, projectId: task.projectId, employeeId: primaryAtCutoff,
        baselineStart: task.baselineStart, baselineEnd: task.baselineEnd, officialStart: task.officialStart, officialEnd: task.officialEnd,
        shadowStart: milestoneDate, shadowEnd: milestoneDate,
        deltaStartWorkdays: workdayDelta(task.officialStart, milestoneDate, primaryAtCutoff, input.capacityDays),
        deltaEndWorkdays: workdayDelta(task.officialEnd, milestoneDate, primaryAtCutoff, input.capacityDays),
        remainingMinutes: 0, allocationSource: 'MILESTONE_ZERO_CAPACITY', constraintResult: 'MILESTONE_FIXED',
        dependencyResult: dependencyStart.dependencyResult, priorityResult: `ORDER_${prioritySequence}`,
        impactReasonCodes: [...new Set([...reasons, 'MILESTONE'])], approvalRequired: true, dataConfidence: confidence,
        changeDirection: compareNullable(milestoneDate, task.officialEnd) < 0 ? 'ADVANCED' : compareNullable(milestoneDate, task.officialEnd) > 0 ? 'DELAYED' : 'UNCHANGED',
      });
      continue;
    }

    let remaining = effort.minutes;
    let shadowStart: string | null = task.actualStarted ? (task.actualStartUtc?.slice(0, 10) || task.officialStart) : null;
    let shadowEnd: string | null = null;
    let allocationSequence = 0;
    let fixedStartCapacityConflict = false;
    for (const localDate of capacityDates) {
      if (remaining <= 0) break;
      if (localDate < earliest) continue;
      const employeeId = resolveEffectivePrimary(task, localDate);
      if (!employeeId) continue;
      const employee = employeeMap.get(employeeId);
      const key = `${employeeId}|${localDate}`;
      const day = capacity.get(key);
      if (!employee || !day) continue;
      const cutoffLocalDate = utcToLocalDate(input.planningCutoffUtc, employee.timezone);
      if (localDate < cutoffLocalDate) continue;
      if (day.remaining <= 0) {
        if (day.source.includes('COMPANY_DUTY')) { reasons.push('COMPANY_DUTY'); approvalRequired = true; }
        if (day.source.includes('TRAINING')) { reasons.push('TRAINING'); approvalRequired = true; }
        if (day.source.includes('LEAVE')) { reasons.push('LEAVE_CAPACITY'); approvalRequired = true; }
        continue;
      }
      if (constraint?.type === 'FIXED_START' && constraintLocalDate && !shadowStart && localDate !== constraintLocalDate) {
        confidence = 'BLOCKED';
        approvalRequired = true;
        reasons.push('FIXED_START_CAPACITY_CONFLICT');
        fixedStartCapacityConflict = true;
        break;
      }
      const usedBefore = usedMinutes.get(key) || 0;
      const dependencyOffset = localDate === dependencyStart.date ? dependencyStart.releaseOffsetMinutes : 0;
      const constraintOffset = constraint?.type !== 'FIXED_END' && constraintLocalDate === localDate && constraintLocalTime
        ? workMinuteOffset(constraintLocalTime, employee)
        : 0;
      const cutoffOffset = localDate === cutoffLocalDate
        ? workMinuteOffset(utcToLocalTime(input.planningCutoffUtc, employee.timezone), employee)
        : 0;
      const requiredOffset = Math.max(dependencyOffset, constraintOffset, cutoffOffset);
      const startOffset = Math.max(usedBefore, requiredOffset);
      const effectiveAvailable = Math.max(0, employee.defaultCapacityMinutes - startOffset);
      const allocated = Math.min(day.remaining, effectiveAvailable, remaining);
      if (allocated <= 0) continue;
      const times = allocationTimes(employee, localDate, startOffset, allocated);
      allocationSequence += 1;
      allocations.push({
        taskId: task.id, projectId: task.projectId, employeeId, localWorkDate: localDate,
        timezone: employee.timezone, availableCapacityMinutes: day.total, allocatedMinutes: allocated,
        capacitySource: day.source, priorityOrder: prioritySequence, allocationSequence,
        startsAtUtc: times.start, endsAtUtc: times.end,
      });
      day.remaining -= allocated;
      usedMinutes.set(key, startOffset + allocated);
      remaining -= allocated;
      if (!shadowStart) shadowStart = localDate;
      shadowEnd = localDate;
    }
    if (remaining > 0 && !fixedStartCapacityConflict) {
      validationIssues.push({ code: 'CAPACITY_CALCULATION_FAILED', taskId: task.id, projectId: task.projectId, details: { unallocatedMinutes: remaining } });
      confidence = 'BLOCKED';
      approvalRequired = true;
      reasons.push('CAPACITY_CALCULATION_FAILED');
    }
    const lastTaskAllocation = [...allocations].reverse().find((allocation) => allocation.taskId === task.id);
    const scheduledEmployeeId = lastTaskAllocation?.employeeId || primaryAtCutoff;
    const fixedEndOverrun = constraint?.type === 'FIXED_END' && constraintLocalDate && shadowEnd && (
      shadowEnd > constraintLocalDate || Boolean(constraint.timestampUtc && lastTaskAllocation?.endsAtUtc
        && new Date(lastTaskAllocation.endsAtUtc).getTime() > new Date(constraint.timestampUtc).getTime())
    );
    if (fixedEndOverrun) {
      validationIssues.push({
        code: 'FIXED_END_VIOLATION', taskId: task.id, projectId: task.projectId,
        details: { fixedEnd: constraint.timestampUtc || constraintLocalDate, shadowEnd, shadowEndUtc: lastTaskAllocation?.endsAtUtc || null },
      });
      approvalRequired = true;
      reasons.push('FIXED_END_VIOLATION');
      constraintResult = 'FIXED_END_VIOLATION';
    }
    if (input.pendingOvertimeTaskIds.includes(task.id)) {
      approvalRequired = true;
      reasons.push('PENDING_OVERTIME');
    }
    if (task.completionReported) {
      approvalRequired = true;
      confidence = confidence === 'BLOCKED' ? 'BLOCKED' : 'PROVISIONAL';
      reasons.push('COMPLETION_REPORTED_REVIEW');
    }
    const deltaStart = workdayDelta(task.officialStart, shadowStart, scheduledEmployeeId, input.capacityDays);
    const deltaEnd = workdayDelta(task.officialEnd, shadowEnd, scheduledEmployeeId, input.capacityDays);
    if (Math.abs(deltaStart) >= 2 || Math.abs(deltaEnd) >= 2) approvalRequired = true;
    const endComparison = compareNullable(shadowEnd, task.officialEnd);
    const startComparison = compareNullable(shadowStart, task.officialStart);
    const comparison = endComparison !== 0 ? endComparison : startComparison;
    results.set(task.id, {
      taskId: task.id, projectId: task.projectId, employeeId: scheduledEmployeeId,
      baselineStart: task.baselineStart, baselineEnd: task.baselineEnd,
      officialStart: task.officialStart, officialEnd: task.officialEnd, shadowStart, shadowEnd,
      deltaStartWorkdays: deltaStart, deltaEndWorkdays: deltaEnd, remainingMinutes: effort.minutes,
      allocationSource: effort.source, constraintResult, dependencyResult: dependencyStart.dependencyResult,
      priorityResult: `ORDER_${prioritySequence}`, impactReasonCodes: [...new Set(reasons)].sort(), approvalRequired,
      dataConfidence: confidence,
      changeDirection: confidence === 'BLOCKED' ? 'BLOCKED' : comparison < 0 ? 'ADVANCED' : comparison > 0 ? 'DELAYED' : 'UNCHANGED',
    });
  }

  const taskResults = [...results.values()].sort((a, b) => a.projectId.localeCompare(b.projectId) || a.taskId.localeCompare(b.taskId));
  const impactedEmployees = new Map<string, Set<string>>();
  const addEmployeeProjectImpact = (employeeId: string | null | undefined, projectId: string | null | undefined) => {
    if (!employeeId || !projectId) return;
    const projectIds = impactedEmployees.get(employeeId) || new Set<string>();
    projectIds.add(projectId);
    impactedEmployees.set(employeeId, projectIds);
  };
  for (const allocation of allocations) addEmployeeProjectImpact(allocation.employeeId, allocation.projectId);
  addEmployeeProjectImpact(input.sourceEmployeeId, input.sourceProjectId);
  for (const task of input.tasks.filter((item) => item.actualStarted || item.completed)) {
    const employeeTimezone = task.primaryEmployeeId ? employeeMap.get(task.primaryEmployeeId)?.timezone : null;
    const actualDate = task.actualStartUtc && employeeTimezone
      ? utcToLocalDate(task.actualStartUtc, employeeTimezone)
      : input.planningCutoffLocalDate;
    addEmployeeProjectImpact(resolveEffectivePrimary(task, actualDate), task.projectId);
  }
  const crossProjectIds = new Set<string>();
  for (const projectIds of impactedEmployees.values()) {
    if (projectIds.size > 1) for (const projectId of projectIds) crossProjectIds.add(projectId);
  }
  const projects: ShadowProjectResult[] = input.projects.map((project) => {
    const projectTasks = taskResults.filter((task) => task.projectId === project.id);
    const endingTask = [...projectTasks].filter((task) => task.shadowEnd).sort((a, b) =>
      (b.shadowEnd || '').localeCompare(a.shadowEnd || '') || a.taskId.localeCompare(b.taskId))[0];
    const starts = projectTasks.map((task) => task.shadowStart).filter(Boolean) as string[];
    const shadowStart = starts.sort()[0] || project.officialStart;
    const shadowEnd = endingTask?.shadowEnd || project.officialEnd;
    const employee = endingTask?.employeeId ? employeeMap.get(endingTask.employeeId) : null;
    const variance = workdayDelta(project.officialEnd, shadowEnd, endingTask?.employeeId || null, input.capacityDays);
    const confidence = worstConfidence(projectTasks.map((task) => task.dataConfidence));
    const reasons = [...new Set(projectTasks.flatMap((task) => task.impactReasonCodes))];
    const crossProject = crossProjectIds.has(project.id);
    if (shadowEnd !== project.officialEnd) reasons.push('PROJECT_END_CHANGED');
    if (crossProject) reasons.push('CROSS_PROJECT_IMPACT');
    const approvalRequired = projectTasks.some((task) => task.approvalRequired) || shadowEnd !== project.officialEnd || crossProject;
    const noChange = projectTasks.every((task) => task.changeDirection === 'UNCHANGED');
    const classification: ApprovalClassification = confidence === 'BLOCKED' ? 'BLOCKED'
      : approvalRequired ? 'APPROVAL_REQUIRED'
      : noChange ? 'NO_CHANGE'
      : 'AUTO_APPLY_ELIGIBLE';
    return {
      projectId: project.id, baselineStart: project.baselineStart, baselineEnd: project.baselineEnd,
      officialStart: project.officialStart, officialEnd: project.officialEnd,
      shadowStart, shadowEnd, scheduleVarianceWorkdays: variance,
      varianceCalendarEmployeeId: endingTask?.employeeId || null,
      varianceCalendarTimezone: employee?.timezone || null,
      varianceCalendarBasis: endingTask ? `CRITICAL_END_TASK:${endingTask.taskId}` : 'OFFICIAL_FORECAST_FALLBACK',
      approvalClassification: classification, approvalReasons: [...new Set(reasons)].sort(), dataConfidence: confidence,
    };
  }).sort((a, b) => a.projectId.localeCompare(b.projectId));

  const affectedProjects = projects.filter((project) => project.approvalClassification !== 'NO_CHANGE');
  const affectedTasks = taskResults.filter((task) => task.changeDirection !== 'UNCHANGED');
  const crossProjectImpact = crossProjectIds.size > 0;
  const allReasons = [...new Set(projects.flatMap((project) => project.approvalReasons))].sort();
  if (crossProjectImpact && !allReasons.includes('CROSS_PROJECT_IMPACT')) allReasons.push('CROSS_PROJECT_IMPACT');
  const blocked = taskResults.some((task) => task.dataConfidence === 'BLOCKED') || dependencyBlockingProjects.size > 0;
  return {
    status: blocked ? 'BLOCKED' : 'COMPLETED',
    dataConfidence: worstConfidence(taskResults.map((task) => task.dataConfidence)),
    validationIssues: validationIssues.sort((a, b) => a.code.localeCompare(b.code) || String(a.taskId || '').localeCompare(String(b.taskId || ''))),
    tasks: taskResults, projects, allocations: allocations.sort((a, b) =>
      a.localWorkDate.localeCompare(b.localWorkDate) || a.employeeId.localeCompare(b.employeeId) || a.priorityOrder - b.priorityOrder || a.allocationSequence - b.allocationSequence),
    affectedProjectCount: affectedProjects.length,
    affectedTaskCount: affectedTasks.length,
    tasksAdvancedCount: taskResults.filter((task) => task.changeDirection === 'ADVANCED').length,
    tasksDelayedCount: taskResults.filter((task) => task.changeDirection === 'DELAYED').length,
    unchangedTaskCount: taskResults.filter((task) => task.changeDirection === 'UNCHANGED').length,
    crossProjectImpact,
    approvalRequired: blocked || crossProjectImpact || projects.some((project) => project.approvalClassification === 'APPROVAL_REQUIRED'),
    approvalReasonCodes: allReasons,
  };
}

export interface DependencyProposalTask {
  id: string;
  projectId: string;
  groupId: string | null;
  groupOrder: number;
  taskOrder: number;
  name: string;
  baselineStart: string | null;
  baselineEnd: string | null;
  officialStart: string | null;
  officialEnd: string | null;
  primaryEmployeeId: string | null;
}

export interface DependencyProposal {
  projectId: string;
  predecessorTaskId: string;
  successorTaskId: string;
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceScore: number;
  evidence: string[];
}

export function generateDependencyProposals(tasks: DependencyProposalTask[]): { proposals: DependencyProposal[]; parallelTaskIds: string[] } {
  const proposals: DependencyProposal[] = [];
  const parallel = new Set<string>();
  const byProject = new Map<string, DependencyProposalTask[]>();
  for (const task of tasks) byProject.set(task.projectId, [...(byProject.get(task.projectId) || []), task]);
  for (const [projectId, projectTasks] of [...byProject.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const ordered = [...projectTasks].sort((a, b) => a.groupOrder - b.groupOrder || a.taskOrder - b.taskOrder || a.id.localeCompare(b.id));
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const predecessor = ordered[index];
      const successor = ordered[index + 1];
      const predecessorEnd = predecessor.officialEnd || predecessor.baselineEnd;
      const successorStart = successor.officialStart || successor.baselineStart;
      const overlaps = Boolean(predecessorEnd && successorStart && successorStart <= predecessorEnd);
      const sameStart = Boolean(predecessor.officialStart && successor.officialStart && predecessor.officialStart === successor.officialStart);
      const parallelName = /(백엔드|frontend|프론트엔드)/i.test(predecessor.name) && /(백엔드|frontend|프론트엔드)/i.test(successor.name);
      if (overlaps || sameStart || parallelName) {
        parallel.add(predecessor.id);
        parallel.add(successor.id);
        continue;
      }
      const evidence = ['WBS_ADJACENT'];
      let score = 40;
      if (predecessor.groupId && predecessor.groupId === successor.groupId) { evidence.push('SAME_TASK_GROUP'); score += 25; }
      if (predecessorEnd && successorStart && successorStart > predecessorEnd) { evidence.push('BASELINE_NON_OVERLAP'); score += 20; }
      if (predecessor.primaryEmployeeId && predecessor.primaryEmployeeId === successor.primaryEmployeeId) { evidence.push('SAME_PRIMARY'); score += 10; }
      const level = score >= 80 ? 'HIGH' : score >= 55 ? 'MEDIUM' : 'LOW';
      proposals.push({ projectId, predecessorTaskId: predecessor.id, successorTaskId: successor.id, confidenceLevel: level, confidenceScore: Math.min(100, score), evidence });
    }
  }
  return { proposals, parallelTaskIds: [...parallel].sort() };
}
