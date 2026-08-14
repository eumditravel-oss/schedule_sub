import { ActorContextServer } from './v3FoundationService';
import { resolveWorkDayStatusServer } from './workCalendar';
import {
  canonicalJson,
  DependencyInput,
  DependencyProposalTask,
  fingerprintEngineInput,
  generateDependencyProposals,
  localDateTimeToUtc,
  normalizeEngineInput,
  runShadowScheduleEngine,
  sha256Hex,
  SHADOW_ENGINE_VERSION,
  ShadowEmployeeInput,
  ShadowEngineInput,
  ShadowEngineResult,
  validateDependencyGraph,
  isValidIsoLocalDate,
  isValidUtcTimestamp,
} from './shadowScheduleEngine';

export class ShadowScheduleError extends Error {
  constructor(public code: string, public status = 400, public details?: unknown) {
    super(code);
  }
}

interface ShadowActor {
  worker: any;
  isManager: boolean;
  actorMode: string;
  actorUserId: string | null;
  testSessionId: string | null;
}

interface RunOptions {
  projectId?: string | null;
  sourceWorklogId?: string | null;
  sourceRevisionId?: string | null;
  triggerType?: string;
  planningCutoffUtc?: string;
  planningCutoffLocalDate?: string;
  idempotencyKey: string;
  requestedBy: string;
  actor?: ShadowActor | null;
}

const uuid = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
export type ShadowMutationCommit = <T>(response: T, guard?: { lockToken: string; revision: number }) => any;

export function recordedWorkTimestampUtc(
  contribution: { local_work_date?: string | null } | null | undefined,
  employee: { workStartLocal: string; workEndLocal: string; timezone: string } | null | undefined,
  phase: 'START' | 'END',
): string | null {
  if (!contribution?.local_work_date || !employee) return null;
  return localDateTimeToUtc(
    contribution.local_work_date,
    phase === 'START' ? employee.workStartLocal : employee.workEndLocal,
    employee.timezone,
  );
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export async function idempotentShadowMutation<T>(
  db: any,
  key: string,
  operation: string,
  payload: unknown,
  mutation: (commit: ShadowMutationCommit) => Promise<T>,
): Promise<T> {
  if (!key) throw new ShadowScheduleError('IDEMPOTENCY_CONFLICT', 400, { reason: 'IDEMPOTENCY_KEY_REQUIRED' });
  const payloadHash = await sha256Hex(canonicalJson(payload));
  const existing = await db.prepare(`SELECT * FROM shadow_engine_idempotency_keys WHERE idempotency_key=?`).bind(key).first();
  if (existing) {
    if (existing.operation !== operation || existing.payload_hash !== payloadHash) throw new ShadowScheduleError('IDEMPOTENCY_CONFLICT', 409);
    if (existing.response_json === '{"status":"IN_PROGRESS"}') {
      throw new ShadowScheduleError('IDEMPOTENCY_CONFLICT', 409, { reason: 'REQUEST_IN_PROGRESS' });
    }
    return parseJson<T>(existing.response_json, null as T);
  }
  const reservation = await db.prepare(`INSERT OR IGNORE INTO shadow_engine_idempotency_keys
    (idempotency_key,operation,payload_hash,response_json,created_at) VALUES (?1,?2,?3,?4,?5)`)
    .bind(key, operation, payloadHash, '{"status":"IN_PROGRESS"}', new Date().toISOString()).run();
  if (Number(reservation.meta?.changes || 0) === 0) {
    const raced = await db.prepare(`SELECT * FROM shadow_engine_idempotency_keys WHERE idempotency_key=?`).bind(key).first();
    if (!raced || raced.operation !== operation || raced.payload_hash !== payloadHash) throw new ShadowScheduleError('IDEMPOTENCY_CONFLICT', 409);
    if (raced.response_json === '{"status":"IN_PROGRESS"}') {
      throw new ShadowScheduleError('IDEMPOTENCY_CONFLICT', 409, { reason: 'REQUEST_IN_PROGRESS' });
    }
    return parseJson<T>(raced.response_json, null as T);
  }
  let atomicCommitUsed = false;
  const commit: ShadowMutationCommit = (response, guard) => {
    atomicCommitUsed = true;
    const guardSql = guard
      ? ` AND EXISTS (SELECT 1 FROM dependency_graph_guard WHERE guard_id='GLOBAL' AND lock_token=?5 AND revision=?6)`
      : '';
    const statement = db.prepare(`UPDATE shadow_engine_idempotency_keys SET response_json=?1
      WHERE idempotency_key=?2 AND operation=?3 AND payload_hash=?4 AND response_json='{"status":"IN_PROGRESS"}'${guardSql}`);
    return guard
      ? statement.bind(canonicalJson(response), key, operation, payloadHash, guard.lockToken, guard.revision)
      : statement.bind(canonicalJson(response), key, operation, payloadHash);
  };
  (commit as any).__key = key;
  (commit as any).__operation = operation;
  (commit as any).__payloadHash = payloadHash;
  try {
    const response = await mutation(commit);
    if (!atomicCommitUsed) {
      const finalized = await commit(response).run();
      if (Number(finalized.meta?.changes || 0) !== 1) {
        throw new ShadowScheduleError('IDEMPOTENCY_CONFLICT', 409, { reason: 'FINALIZE_FAILED' });
      }
    }
    return response;
  } catch (error) {
    const retainReservation = error instanceof ShadowScheduleError && error.details && (error.details as any).reason === 'FINALIZE_FAILED';
    if (!retainReservation) {
      await db.prepare(`DELETE FROM shadow_engine_idempotency_keys WHERE idempotency_key=?1 AND operation=?2 AND payload_hash=?3 AND response_json='{"status":"IN_PROGRESS"}'`)
        .bind(key, operation, payloadHash).run();
    }
    throw error;
  }
}

function dateRange(startDate: string, days: number): string[] {
  const result: string[] = [];
  const date = new Date(`${startDate}T00:00:00Z`);
  for (let index = 0; index < days; index += 1) {
    result.push(date.toISOString().slice(0, 10));
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return result;
}

function localDateInTimezone(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

function previousDate(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function dateSpan(start: string, end: string): string[] {
  if (start > end) return [];
  const result: string[] = [];
  const value = new Date(`${start}T00:00:00Z`);
  while (value.toISOString().slice(0, 10) <= end) {
    result.push(value.toISOString().slice(0, 10));
    value.setUTCDate(value.getUTCDate() + 1);
  }
  return result;
}

function taskEmployeeIds(task: any, assignmentMap: Map<string, any[]>, temporaryMap: Map<string, any[]>): string[] {
  return [...new Set([
    ...(assignmentMap.get(task.id) || []).map((assignment: any) => assignment.worker_id),
    ...(temporaryMap.get(task.id) || []).map((assignment: any) => assignment.temporary_primary_employee_id),
    task.primary_worker_id,
  ].filter(Boolean))] as string[];
}

export function expandSharedEmployeeTaskClosure(
  allTasks: any[],
  initialProjectId: string,
  assignmentMap: Map<string, any[]>,
  temporaryMap: Map<string, any[]>,
): any[] {
  const projectIds = new Set([initialProjectId]);
  const employeeIds = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of allTasks.filter((item) => projectIds.has(item.project_id))) {
      for (const employeeId of taskEmployeeIds(task, assignmentMap, temporaryMap)) {
        if (!employeeIds.has(employeeId)) { employeeIds.add(employeeId); changed = true; }
      }
    }
    for (const task of allTasks) {
      if (taskEmployeeIds(task, assignmentMap, temporaryMap).some((employeeId) => employeeIds.has(employeeId)) && !projectIds.has(task.project_id)) {
        projectIds.add(task.project_id);
        changed = true;
      }
    }
  }
  return allTasks.filter((task) => projectIds.has(task.project_id));
}

export function findMissingWorklogDates(
  employeeIds: string[],
  startDate: string,
  endDate: string,
  existingEmployeeDateKeys: Set<string>,
  isWorkingDay: (employeeId: string, localWorkDate: string) => boolean,
): Array<{ employeeId: string; localWorkDate: string }> {
  return employeeIds.flatMap((employeeId) => dateSpan(startDate, endDate)
    .filter((localWorkDate) => isWorkingDay(employeeId, localWorkDate)
      && !existingEmployeeDateKeys.has(`${employeeId}|${localWorkDate}`))
    .map((localWorkDate) => ({ employeeId, localWorkDate })));
}

export function worklogHasShadowDataGap(worklog: { has_gap?: unknown }): boolean {
  return Number(worklog.has_gap || 0) === 1;
}

export function firstPositiveActualContribution<T extends { approved_actual_minutes?: unknown }>(contributions: T[]): T | undefined {
  return contributions.find((contribution) => Number(contribution.approved_actual_minutes || 0) > 0);
}

export function hasShadowActualOrCapacityTrigger(input: {
  candidateTaskIds: Set<string>;
  contributions: Array<{ task_id?: unknown }>;
  sourceWorklog: { current_eod_revision_id?: unknown; status?: unknown } | null | undefined;
  sourceRevisionId: string | null;
  effectiveRevisionIds: Set<string>;
}): boolean {
  const taskActual = input.contributions.some((contribution) =>
    typeof contribution.task_id === 'string' && input.candidateTaskIds.has(contribution.task_id));
  const effectiveSourceEod = Boolean(input.sourceWorklog && input.sourceRevisionId &&
    input.effectiveRevisionIds.has(input.sourceRevisionId) &&
    input.sourceWorklog.current_eod_revision_id === input.sourceRevisionId);
  return taskActual || effectiveSourceEod;
}

export function filterEmployeeShadowView(input: {
  employeeId: string;
  tasks: any[];
  allocations: any[];
  diffs: any[];
  versions: any[];
  impacts: any[];
}) {
  const employeeAllocationRows = input.allocations.filter((allocation) => allocation.employee_id === input.employeeId);
  const visibleTaskIds = new Set<string>([
    ...input.tasks.filter((task) => task.employee_id === input.employeeId).map((task) => String(task.task_id)),
    ...employeeAllocationRows.map((allocation) => String(allocation.task_id)),
  ]);
  const tasks = input.tasks.filter((task) => visibleTaskIds.has(String(task.task_id)));
  const visibleProjectIds = new Set<string>([
    ...tasks.map((task) => String(task.project_id)),
    ...input.diffs.filter((diff) => visibleTaskIds.has(String(diff.task_id))).map((diff) => String(diff.project_id)),
  ]);
  return {
    tasks,
    allocations: employeeAllocationRows,
    diffs: input.diffs.filter((diff) => visibleTaskIds.has(String(diff.task_id))),
    versions: input.versions.filter((version) => visibleProjectIds.has(String(version.project_id))),
    impacts: input.impacts.filter((impact) => impact.employee_id === input.employeeId || visibleProjectIds.has(String(impact.primary_project_id))),
  };
}

export function shadowVersionUsesEmployee(input: {
  employeeId: string;
  taskEmployeeIds: string[];
  allocationEmployeeIds: string[];
}): boolean {
  return input.taskEmployeeIds.includes(input.employeeId) || input.allocationEmployeeIds.includes(input.employeeId);
}

export function shadowRunAuthorityIsCurrent(runRevision: unknown, currentRevision: unknown): boolean {
  return Number.isInteger(Number(runRevision)) && Number.isInteger(Number(currentRevision)) &&
    Number(runRevision) === Number(currentRevision);
}

export function filterEffectiveOvertimeCandidates<T extends { revision_id: string; approval_status: string }>(
  candidates: T[],
  effectiveRevisionIds: Set<string>,
): T[] {
  return candidates.filter((candidate) => effectiveRevisionIds.has(candidate.revision_id) &&
    ['PENDING_REVIEW', 'APPROVED'].includes(candidate.approval_status));
}

export function selectEffectiveProjectPriorities<T extends { project_id: string; effective_from: string; effective_to?: string | null }>(
  priorities: T[],
  planningCutoffLocalDate: string,
): Map<string, T> {
  return new Map(priorities
    .filter((priority) => priority.effective_from <= planningCutoffLocalDate &&
      (!priority.effective_to || priority.effective_to >= planningCutoffLocalDate))
    .map((priority) => [priority.project_id, priority]));
}

export function validateDependencyReviewAction(action: unknown): 'CONFIRM' | 'REJECT' {
  if (action !== 'CONFIRM' && action !== 'REJECT') {
    throw new ShadowScheduleError('DEPENDENCY_REVIEW_ACTION_INVALID', 400);
  }
  return action;
}

export function dependencyGraphGuardAcquired(batchResults: any[], dependencyCount: number, trailingStatementCount = 0): boolean {
  const expectedCount = 1 + (dependencyCount * 2) + trailingStatementCount;
  return batchResults.length === expectedCount &&
    batchResults.every((result) => Number(result?.meta?.changes || 0) === 1);
}

export function isValidShadowWorkPolicy(policy: any): boolean {
  if (!policy || typeof policy.timezone !== 'string') return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: policy.timezone }).format(new Date(0)); } catch { return false; }
  const time = (value: unknown) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (![policy.work_start_local, policy.work_end_local, policy.lunch_start_local, policy.lunch_end_local].every(time)) return false;
  const minute = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  if (!(minute(policy.work_start_local) < minute(policy.lunch_start_local) &&
        minute(policy.lunch_start_local) < minute(policy.lunch_end_local) &&
        minute(policy.lunch_end_local) < minute(policy.work_end_local))) return false;
  return Number.isInteger(Number(policy.schedulable_minutes)) && Number(policy.schedulable_minutes) > 0;
}

export function normalizeShadowCutoff(input: {
  planningCutoffUtc?: unknown;
  planningCutoffLocalDate?: unknown;
  timezone: string;
  fallbackNow?: Date;
}): { now: Date; localDate: string } {
  if (input.planningCutoffUtc !== undefined && input.planningCutoffUtc !== null &&
      !isValidUtcTimestamp(input.planningCutoffUtc)) {
    throw new ShadowScheduleError('SHADOW_RUN_INPUT_CHANGED', 400, { reason: 'INVALID_PLANNING_CUTOFF_UTC' });
  }
  const now = input.planningCutoffUtc ? new Date(String(input.planningCutoffUtc)) : input.fallbackNow || new Date();
  const derivedLocalDate = localDateInTimezone(now, input.timezone);
  if (input.planningCutoffLocalDate !== undefined && input.planningCutoffLocalDate !== null) {
    if (!isValidIsoLocalDate(input.planningCutoffLocalDate) || input.planningCutoffLocalDate !== derivedLocalDate) {
      throw new ShadowScheduleError('SHADOW_RUN_INPUT_CHANGED', 400, {
        reason: 'PLANNING_CUTOFF_LOCAL_DATE_MISMATCH', expected: derivedLocalDate,
      });
    }
  }
  return { now, localDate: derivedLocalDate };
}

export function validateSourceWorklogRevisionPair(input: {
  requestedWorklogId?: string | null;
  requestedRevisionId?: string | null;
  sourceWorklog: { id?: unknown; current_eod_revision_id?: unknown } | null | undefined;
  sourceRevision: { id?: unknown; worklog_id?: unknown; is_effective?: unknown } | null | undefined;
  resolvedRevisionId: string | null;
}): void {
  if (input.requestedRevisionId && !input.requestedWorklogId) {
    throw new ShadowScheduleError('SHADOW_RUN_INPUT_CHANGED', 409, { reason: 'SOURCE_REVISION_WITHOUT_WORKLOG' });
  }
  if (!input.requestedWorklogId) return;
  if (!input.sourceWorklog || !input.sourceRevision ||
      input.sourceRevision.worklog_id !== input.sourceWorklog.id ||
      Number(input.sourceRevision.is_effective) !== 1 ||
      input.sourceWorklog.current_eod_revision_id !== input.resolvedRevisionId) {
    throw new ShadowScheduleError('SHADOW_RUN_INPUT_CHANGED', 409, { reason: 'SOURCE_WORKLOG_REVISION_MISMATCH' });
  }
}

async function resolveShadowActor(db: any, actorContext: ActorContextServer, write = false): Promise<ShadowActor> {
  const employeeId = actorContext.actorEmployeeId;
  if (!employeeId) throw new ShadowScheduleError('DEPENDENCY_PERMISSION_DENIED', 403);
  const worker = await db.prepare(`SELECT * FROM workers WHERE id=? AND is_active=1`).bind(employeeId).first();
  if (!worker) throw new ShadowScheduleError('DEPENDENCY_PERMISSION_DENIED', 403);
  if (write && worker.access_role !== 'EDITOR') throw new ShadowScheduleError('DEPENDENCY_PERMISSION_DENIED', 403);
  return {
    worker,
    isManager: Number(worker.can_manage_schedule_engine) === 1,
    actorMode: actorContext.actorMode,
    actorUserId: actorContext.actorUserId,
    testSessionId: actorContext.testSessionId,
  };
}

function requireManager(actor: ShadowActor) {
  if (!actor.isManager || actor.worker.access_role !== 'EDITOR') {
    throw new ShadowScheduleError('DEPENDENCY_PERMISSION_DENIED', 403);
  }
}

async function auditStatement(db: any, actor: ShadowActor | null, input: {
  eventType: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  requestId?: string | null;
  dependencyGraphGuard?: { lockToken: string; revision: number };
  idempotencyGuard?: { key: string; responseJson: string };
}) {
  const insert = input.dependencyGraphGuard
    ? `INSERT INTO shadow_engine_audit_events
      (audit_id,event_type,entity_type,entity_id,actor_employee_id,actor_mode,event_time_utc,before_json,after_json,reason,test_session_id,request_id)
     SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12
     WHERE EXISTS (SELECT 1 FROM dependency_graph_guard WHERE guard_id='GLOBAL' AND lock_token=?13 AND revision=?14)`
    : input.idempotencyGuard
    ? `INSERT INTO shadow_engine_audit_events
      (audit_id,event_type,entity_type,entity_id,actor_employee_id,actor_mode,event_time_utc,before_json,after_json,reason,test_session_id,request_id)
     SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12
     WHERE EXISTS (SELECT 1 FROM shadow_engine_idempotency_keys WHERE idempotency_key=?13 AND response_json=?14)`
    : `INSERT INTO shadow_engine_audit_events
      (audit_id,event_type,entity_type,entity_id,actor_employee_id,actor_mode,event_time_utc,before_json,after_json,reason,test_session_id,request_id)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`;
  const values = [
    uuid('sea'), input.eventType, input.entityType, input.entityId,
    actor?.worker?.id || null, actor?.actorMode || 'SYSTEM', new Date().toISOString(),
    input.before === undefined ? null : canonicalJson(input.before),
    input.after === undefined ? null : canonicalJson(input.after),
    input.reason || null, actor?.testSessionId || null, input.requestId || null,
  ];
  if (input.dependencyGraphGuard) values.push(input.dependencyGraphGuard.lockToken, input.dependencyGraphGuard.revision);
  if (input.idempotencyGuard) values.push(input.idempotencyGuard.key, input.idempotencyGuard.responseJson);
  return db.prepare(insert).bind(...values);
}

async function loadOfficialDataSnapshot(db: any) {
  const [projects, tasks, projectBaselines, taskBaselines, versions, versionTasks, aggregates,
    worklogs, worklogRevisions, taskActuals, legacyBootstrap, completionEvents] = await db.batch([
    db.prepare(`SELECT * FROM projects ORDER BY id`),
    db.prepare(`SELECT * FROM tasks ORDER BY id`),
    db.prepare(`SELECT id,project_id,version,baseline_start_date,baseline_end_date,created_at FROM project_baselines ORDER BY project_id,version`),
    db.prepare(`SELECT id,baseline_id,task_id,baseline_start_date,baseline_end_date,baseline_progress,effort_status,proposed_effort_minutes FROM task_baselines ORDER BY baseline_id,task_id`),
    db.prepare(`SELECT id,project_id,version_number,status,project_forecast_start,project_forecast_end,source_type,created_at FROM schedule_versions ORDER BY project_id,version_number`),
    db.prepare(`SELECT id,version_id,project_id,task_id,forecast_start,forecast_end,planned_effort_minutes,effort_status FROM schedule_version_tasks ORDER BY version_id,task_id`),
    db.prepare(`SELECT task_id,project_id,raw_actual_minutes,approved_actual_minutes,current_progress,remaining_estimated_minutes,completion_reported,actual_status,last_actual_work_date,updated_at FROM task_actual_aggregates ORDER BY task_id`),
    db.prepare(`SELECT * FROM daily_worklogs ORDER BY id`),
    db.prepare(`SELECT * FROM daily_worklog_revisions ORDER BY id`),
    db.prepare(`SELECT * FROM task_actuals ORDER BY id`),
    db.prepare(`SELECT * FROM task_actuals WHERE source_type='LEGACY_BOOTSTRAP' ORDER BY id`),
    db.prepare(`SELECT * FROM task_completion_events ORDER BY id`),
  ]);
  return {
    projects: projects.results || [], tasks: tasks.results || [],
    projectBaselines: projectBaselines.results || [], taskBaselines: taskBaselines.results || [],
    scheduleVersions: versions.results || [], scheduleVersionTasks: versionTasks.results || [],
    taskActualAggregates: aggregates.results || [],
    worklogs: worklogs.results || [], worklogRevisions: worklogRevisions.results || [],
    taskActuals: taskActuals.results || [], legacyBootstrap: legacyBootstrap.results || [],
    completionEvents: completionEvents.results || [],
  };
}

export async function officialDataFingerprint(db: any): Promise<string> {
  return sha256Hex(canonicalJson(await loadOfficialDataSnapshot(db)));
}

async function buildShadowEngineInput(db: any, options: RunOptions): Promise<ShadowEngineInput> {
  const snapshot = await loadOfficialDataSnapshot(db);
  const [workersResult, policiesResult, holidaysResult, overridesResult, assigneesResult, temporaryResult,
    dependenciesResult, constraintsResult, prioritiesResult, contributionsResult, completionResult,
    worklogsResult, capacityEventsResult, overtimeResult, revisionsResult, effectiveEntriesResult, cutoverResult] = await db.batch([
    db.prepare(`SELECT * FROM workers WHERE is_active=1 ORDER BY id`),
    db.prepare(`SELECT * FROM office_work_policies ORDER BY office_code`),
    db.prepare(`SELECT * FROM country_holidays ORDER BY country_code,holiday_date`),
    db.prepare(`SELECT * FROM calendar_overrides ORDER BY scope_type,scope_key,work_date`),
    db.prepare(`SELECT * FROM task_assignees WHERE deleted_at IS NULL ORDER BY task_id,sort_order,worker_id`),
    db.prepare(`SELECT * FROM temporary_primary_assignments WHERE status='ACTIVE' ORDER BY task_id,effective_start_date`),
    db.prepare(`SELECT * FROM task_dependencies ORDER BY project_id,predecessor_task_id,successor_task_id`),
    db.prepare(`SELECT * FROM task_constraints WHERE status='ACTIVE' ORDER BY task_id,created_at DESC`),
    db.prepare(`SELECT * FROM project_priorities ORDER BY priority_rank,project_id`),
    db.prepare(`SELECT c.*,r.created_at AS revision_created_at FROM task_actual_contributions c JOIN daily_worklog_revisions r ON r.id=c.revision_id WHERE c.is_effective=1 ORDER BY c.task_id,c.local_work_date,r.created_at`),
    db.prepare(`SELECT * FROM task_completion_events ORDER BY task_id,actual_end_date`),
    db.prepare(`SELECT * FROM daily_worklogs ORDER BY employee_id,local_work_date`),
    db.prepare(`SELECT e.* FROM employee_capacity_events e
      LEFT JOIN daily_worklog_revisions r ON r.id=e.revision_id
      WHERE e.approval_status IN ('EFFECTIVE','APPROVED') AND (e.revision_id IS NULL OR r.is_effective=1)
      ORDER BY e.employee_id,e.local_work_date,e.id`),
    db.prepare(`SELECT o.* FROM overtime_candidates o
      JOIN daily_worklog_revisions r ON r.id=o.revision_id AND r.is_effective=1
      WHERE o.approval_status IN ('PENDING_REVIEW','APPROVED') ORDER BY o.employee_id,o.local_work_date`),
    db.prepare(`SELECT id,worklog_id,revision_number,is_effective FROM daily_worklog_revisions ORDER BY worklog_id,revision_number`),
    db.prepare(`SELECT e.employee_id,w.local_work_date,e.work_category,e.actual_minutes
                FROM daily_worklog_entries e
                JOIN daily_worklog_revisions r ON r.id=e.revision_id AND r.is_effective=1
                JOIN daily_worklogs w ON w.id=e.worklog_id
                WHERE e.phase='EOD'
                ORDER BY e.employee_id,w.local_work_date,e.id`),
    db.prepare(`SELECT MIN(cutover_date) AS cutover_date FROM task_actuals WHERE source_type='LEGACY_BOOTSTRAP'`),
  ]);

  const workers = workersResult.results || [];
  const policyMap = new Map((policiesResult.results || []).map((policy: any) => [policy.country_code, policy]));
  const employees: ShadowEmployeeInput[] = workers
    .filter((worker: any) => worker.access_role === 'EDITOR' && isValidShadowWorkPolicy(policyMap.get(worker.country_code)))
    .map((worker: any) => {
      const policy: any = policyMap.get(worker.country_code);
      return {
        id: worker.id, name: worker.name, countryCode: worker.country_code,
        timezone: policy.timezone,
        workStartLocal: policy.work_start_local,
        workEndLocal: policy.work_end_local,
        lunchStartLocal: policy.lunch_start_local, lunchEndLocal: policy.lunch_end_local,
        defaultCapacityMinutes: Number(policy.schedulable_minutes),
      };
    });
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
  const sourceEmployee: any = options.sourceWorklogId
    ? (worklogsResult.results || []).find((worklog: any) => worklog.id === options.sourceWorklogId)?.employee_id
    : null;
  const sourceEmployeeProfile = sourceEmployee ? employeeMap.get(sourceEmployee) : null;
  const cutoff = normalizeShadowCutoff({
    planningCutoffUtc: options.planningCutoffUtc,
    planningCutoffLocalDate: options.planningCutoffLocalDate,
    timezone: sourceEmployeeProfile?.timezone || 'Asia/Seoul',
  });
  const now = cutoff.now;
  const planningCutoffLocalDate = cutoff.localDate;

  const latestVersionByProject = new Map<string, any>();
  for (const version of snapshot.scheduleVersions) {
    const current = latestVersionByProject.get(version.project_id);
    if (!current || Number(version.version_number) > Number(current.version_number)) latestVersionByProject.set(version.project_id, version);
  }
  const versionTaskMap = new Map<string, any>();
  for (const task of snapshot.scheduleVersionTasks) {
    if (latestVersionByProject.get(task.project_id)?.id === task.version_id) versionTaskMap.set(task.task_id, task);
  }
  const latestBaselineByProject = new Map<string, any>();
  for (const baseline of snapshot.projectBaselines) {
    const current = latestBaselineByProject.get(baseline.project_id);
    if (!current || Number(baseline.version) > Number(current.version)) latestBaselineByProject.set(baseline.project_id, baseline);
  }
  const baselineTaskMap = new Map<string, any>();
  for (const task of snapshot.taskBaselines) {
    const projectBaseline = [...latestBaselineByProject.values()].find((baseline) => baseline.id === task.baseline_id);
    if (projectBaseline) baselineTaskMap.set(task.task_id, task);
  }
  const aggregateMap = new Map(snapshot.taskActualAggregates.map((aggregate: any) => [aggregate.task_id, aggregate]));
  const assignmentMap = new Map<string, any[]>();
  for (const assignment of assigneesResult.results || []) assignmentMap.set(assignment.task_id, [...(assignmentMap.get(assignment.task_id) || []), assignment]);
  const temporaryMap = new Map<string, any[]>();
  for (const assignment of temporaryResult.results || []) temporaryMap.set(assignment.task_id, [...(temporaryMap.get(assignment.task_id) || []), assignment]);
  const contributionsMap = new Map<string, any[]>();
  for (const contribution of contributionsResult.results || []) contributionsMap.set(contribution.task_id, [...(contributionsMap.get(contribution.task_id) || []), contribution]);
  const completionMap = new Map<string, any>();
  for (const completion of completionResult.results || []) completionMap.set(completion.task_id, completion);
  const priorityMap = selectEffectiveProjectPriorities<any>(prioritiesResult.results || [], planningCutoffLocalDate);

  let candidateTasks = snapshot.tasks.filter((task: any) => {
    const project = snapshot.projects.find((item: any) => item.id === task.project_id);
    return project?.status === 'ACTIVE';
  });
  if (options.projectId) {
    candidateTasks = expandSharedEmployeeTaskClosure(candidateTasks, options.projectId, assignmentMap, temporaryMap);
  }
  const projectIds = new Set(candidateTasks.map((task: any) => task.project_id));
  const projects = snapshot.projects.filter((project: any) => projectIds.has(project.id)).map((project: any) => {
    const baseline = latestBaselineByProject.get(project.id);
    const version = latestVersionByProject.get(project.id);
    return {
      id: project.id, name: project.name, status: project.status,
      baselineStart: baseline?.baseline_start_date || project.baseline_start_date || project.start_date || null,
      baselineEnd: baseline?.baseline_end_date || project.baseline_end_date || project.end_date || null,
      officialStart: version?.project_forecast_start || project.start_date || null,
      officialEnd: version?.project_forecast_end || project.end_date || null,
      officialForecastVersionId: version?.id || null,
      priorityRank: Number(priorityMap.get(project.id)?.priority_rank || 999999),
    };
  });
  const tasks = candidateTasks.map((task: any) => {
    const forecast = versionTaskMap.get(task.id);
    const baseline = baselineTaskMap.get(task.id);
    const aggregate: any = aggregateMap.get(task.id);
    const assignments = assignmentMap.get(task.id) || [];
    const primary = assignments.find((assignment: any) => assignment.assignment_role === 'PRIMARY');
    const contributions = contributionsMap.get(task.id) || [];
    const completion = completionMap.get(task.id);
    const firstContribution = firstPositiveActualContribution(contributions);
    const completionContribution = [...contributions].reverse().find((contribution: any) => Number(contribution.completion_reported) === 1);
    const startEmployee = firstContribution ? employeeMap.get(firstContribution.employee_id) : null;
    const completionEmployee = completionContribution ? employeeMap.get(completionContribution.employee_id) : null;
    const completionReported = Number(aggregate?.completion_reported || 0) === 1;
    const completionConfirmed = Number(task.completion_confirmed || 0) === 1 || Boolean(completion);
    const effortStatus = forecast?.effort_status || baseline?.effort_status || 'PROPOSED';
    const plannedEffort = forecast?.planned_effort_minutes ?? baseline?.proposed_effort_minutes ?? null;
    return {
      id: task.id, projectId: task.project_id, groupId: task.task_group_id || null,
      wbsOrder: Number(task.task_sort_order || 0), name: task.task_name,
      status: completionConfirmed ? 'COMPLETED' : Number(aggregate?.current_progress || 0) > 0 ? 'IN_PROGRESS' : 'FUTURE',
      baselineStart: baseline?.baseline_start_date || task.baseline_start_date || null,
      baselineEnd: baseline?.baseline_end_date || task.baseline_end_date || null,
      officialStart: forecast?.forecast_start || task.start_date || null,
      officialEnd: forecast?.forecast_end || task.end_date || null,
      dueDate: forecast?.forecast_end || task.end_date || null,
      primaryEmployeeId: primary?.worker_id || task.primary_worker_id || null,
      temporaryPrimaries: (temporaryMap.get(task.id) || []).map((assignment: any) => ({
        employeeId: assignment.temporary_primary_employee_id,
        effectiveStartDate: assignment.effective_start_date, effectiveEndDate: assignment.effective_end_date,
      })),
      actualStarted: contributions.some((contribution: any) => Number(contribution.approved_actual_minutes || 0) > 0),
      actualStartUtc: recordedWorkTimestampUtc(firstContribution, startEmployee, 'START'),
      actualEndUtc: recordedWorkTimestampUtc(completionContribution, completionEmployee, 'END'),
      actualEndLocalDate: completion?.actual_end_date || completionContribution?.local_work_date || null,
      completed: completionConfirmed, completionReported,
      baselineWorkMinutes: null,
      remainingEstimatedMinutes: aggregate?.remaining_estimated_minutes === null || aggregate?.remaining_estimated_minutes === undefined
        ? null : Number(aggregate.remaining_estimated_minutes),
      confirmedEffortMinutes: effortStatus === 'CONFIRMED' && plannedEffort !== null ? Number(plannedEffort) : null,
      proposedEffortMinutes: effortStatus !== 'CONFIRMED' && plannedEffort !== null ? Number(plannedEffort) : null,
      approvedActualMinutes: Number(aggregate?.approved_actual_minutes || 0),
    };
  });

  const calendarDates = dateRange(planningCutoffLocalDate, 730);
  const holidays = holidaysResult.results || [];
  const overrides = overridesResult.results || [];
  const worklogByEmployeeDate = new Map<string, any>((worklogsResult.results || []).map((worklog: any) => [`${worklog.employee_id}|${worklog.local_work_date}`, worklog]));
  const categoriesByEmployeeDate = new Map<string, Set<string>>();
  for (const entry of effectiveEntriesResult.results || []) {
    const key = `${entry.employee_id}|${entry.local_work_date}`;
    const categories = categoriesByEmployeeDate.get(key) || new Set<string>();
    categories.add(entry.work_category);
    categoriesByEmployeeDate.set(key, categories);
  }
  const capacityEventsByEmployeeDate = new Map<string, any[]>();
  for (const event of capacityEventsResult.results || []) {
    const key = `${event.employee_id}|${event.local_work_date}`;
    capacityEventsByEmployeeDate.set(key, [...(capacityEventsByEmployeeDate.get(key) || []), event]);
  }
  const overtimeApprovedByEmployeeDate = new Map<string, number>();
  const pendingOvertimeTaskIds = new Set<string>();
  for (const overtime of overtimeResult.results || []) {
    const key = `${overtime.employee_id}|${overtime.local_work_date}`;
    if (overtime.approval_status === 'APPROVED') {
      overtimeApprovedByEmployeeDate.set(key, (overtimeApprovedByEmployeeDate.get(key) || 0) + Number(overtime.candidate_minutes || 0));
    } else {
      for (const contribution of contributionsResult.results || []) if (contribution.worklog_id === overtime.worklog_id) pendingOvertimeTaskIds.add(contribution.task_id);
    }
  }
  const capacityDays = employees.flatMap((employee) => calendarDates.map((localWorkDate) => {
    const worker = workers.find((item: any) => item.id === employee.id);
    const status = resolveWorkDayStatusServer(localWorkDate, worker, holidays, overrides);
    const key = `${employee.id}|${localWorkDate}`;
    const base = status.is_working_day ? employee.defaultCapacityMinutes : 0;
    const uniqueEvents = new Map<string, any>();
    for (const event of capacityEventsByEmployeeDate.get(key) || []) uniqueEvents.set(`${event.source_type}|${event.source_reference_id}`, event);
    const eventAdjustment = base === 0 ? 0 : [...uniqueEvents.values()].reduce((sum, event) => sum + Number(event.adjustment_minutes || 0), 0);
    const actualConsumed = Number(worklogByEmployeeDate.get(key)?.actual_recorded_minutes || 0);
    const approvedOvertime = overtimeApprovedByEmployeeDate.get(key) || 0;
    const workCategories = categoriesByEmployeeDate.get(key) || new Set<string>();
    return {
      employeeId: employee.id, localWorkDate, timezone: employee.timezone,
      availableCapacityMinutes: Math.max(0, base + eventAdjustment + approvedOvertime - actualConsumed),
      capacityWindowMinutes: Math.max(0, base + eventAdjustment + approvedOvertime),
      capacitySource: [
        status.day_type,
        uniqueEvents.size ? 'CAPACITY_EVENT' : null,
        workCategories.has('COMPANY_DUTY') ? 'COMPANY_DUTY' : null,
        workCategories.has('TRAINING') ? 'TRAINING' : null,
        workCategories.has('APPROVED_LEAVE') || workCategories.has('EMERGENCY_LEAVE') ? 'LEAVE' : null,
        actualConsumed ? 'ACTUAL_CONSUMED' : null,
        approvedOvertime ? 'APPROVED_OVERTIME' : null,
      ].filter(Boolean).join('+'),
    };
  }));

  for (const task of tasks) {
    if (!task.baselineStart || !task.baselineEnd) continue;
    const employeeId = task.primaryEmployeeId;
    const employee = employeeId ? employeeMap.get(employeeId) : null;
    const worker = employeeId ? workers.find((item: any) => item.id === employeeId) : null;
    if (!employee || !worker) continue;
    task.baselineWorkMinutes = dateSpan(task.baselineStart, task.baselineEnd).reduce((total, localWorkDate) => {
      const status = resolveWorkDayStatusServer(localWorkDate, worker, holidays, overrides);
      return total + (status.is_working_day ? employee.defaultCapacityMinutes : 0);
    }, 0);
  }

  const effectiveRevisionIds = new Set<string>((revisionsResult.results || [])
    .filter((revision: any) => Number(revision.is_effective) === 1)
    .map((revision: any) => String(revision.id)));
  const sourceRevisionId = options.sourceRevisionId || (options.sourceWorklogId
    ? (worklogsResult.results || []).find((worklog: any) => worklog.id === options.sourceWorklogId)?.current_eod_revision_id
    : null) || null;
  const sourceWorklog = options.sourceWorklogId ? (worklogsResult.results || []).find((worklog: any) => worklog.id === options.sourceWorklogId) : null;
  const sourceRevision = sourceRevisionId ? (revisionsResult.results || []).find((revision: any) => revision.id === sourceRevisionId) : null;
  validateSourceWorklogRevisionPair({
    requestedWorklogId: options.sourceWorklogId,
    requestedRevisionId: options.sourceRevisionId,
    sourceWorklog,
    sourceRevision,
    resolvedRevisionId: sourceRevisionId,
  });
  const dataGapEmployeeDates: Array<{ employeeId: string; localWorkDate: string }> = (worklogsResult.results || [])
    .filter((worklog: any) => worklog.local_work_date <= planningCutoffLocalDate && worklogHasShadowDataGap(worklog))
    .map((worklog: any) => ({ employeeId: worklog.employee_id, localWorkDate: worklog.local_work_date }));
  const configuredCutoverDate = (cutoverResult.results || [])[0]?.cutover_date;
  const firstReliableDate = configuredCutoverDate || [...(worklogsResult.results || []).map((worklog: any) => worklog.local_work_date), planningCutoffLocalDate].sort()[0];
  const gapEndDate = previousDate(planningCutoffLocalDate);
  const submittedWorklogKeys = new Set<string>((worklogsResult.results || [])
    .filter((worklog: any) => worklog.current_eod_revision_id || worklog.status === 'EOD_SUBMITTED')
    .map((worklog: any) => `${worklog.employee_id}|${worklog.local_work_date}`));
  dataGapEmployeeDates.push(...findMissingWorklogDates(
    employees.map((employee) => employee.id), firstReliableDate, gapEndDate,
    submittedWorklogKeys,
    (employeeId, localWorkDate) => resolveWorkDayStatusServer(
      localWorkDate, workers.find((item: any) => item.id === employeeId), holidays, overrides,
    ).is_working_day,
  ));
  if (sourceRevisionId && !effectiveRevisionIds.has(sourceRevisionId)) dataGapEmployeeDates.push({ employeeId: sourceWorklog?.employee_id || '', localWorkDate: sourceWorklog?.local_work_date || planningCutoffLocalDate });

  const uniqueBaselineVersions = [...new Set([...latestBaselineByProject.values()].map((baseline: any) => Number(baseline.version)))];
  const uniqueForecastVersions = [...new Set([...latestVersionByProject.values()].map((version: any) => Number(version.version_number)))];
  const candidateTaskIds = new Set<string>(tasks.map((task: any) => String(task.id)));
  const hasActualTrigger = hasShadowActualOrCapacityTrigger({
    candidateTaskIds,
    contributions: contributionsResult.results || [],
    sourceWorklog,
    sourceRevisionId,
    effectiveRevisionIds,
  });
  return normalizeEngineInput({
    engineVersion: SHADOW_ENGINE_VERSION,
    planningCutoffUtc: now.toISOString(), planningCutoffLocalDate,
    basedOnBaselineVersion: uniqueBaselineVersions.length === 1 ? uniqueBaselineVersions[0] : null,
    basedOnForecastVersion: uniqueForecastVersions.length === 1 ? uniqueForecastVersions[0] : null,
    sourceWorklogId: options.sourceWorklogId || null, sourceRevisionId,
    sourceEmployeeId: sourceWorklog?.employee_id || sourceEmployee || null,
    sourceProjectId: options.projectId || null,
    sourceWorklogRetroactive: Number(sourceWorklog?.retroactive_submission || 0) === 1,
    noActualTrigger: !hasActualTrigger,
    projects, tasks,
    dependencies: (dependenciesResult.results || []).filter((dependency: any) => projectIds.has(dependency.project_id)).map((dependency: any): DependencyInput => ({
      id: dependency.dependency_id, projectId: dependency.project_id,
      predecessorTaskId: dependency.predecessor_task_id, successorTaskId: dependency.successor_task_id,
      type: dependency.dependency_type, lagWorkMinutes: Number(dependency.lag_work_minutes || 0), status: dependency.status,
    })),
    constraints: (constraintsResult.results || []).filter((constraint: any) => tasks.some((task: any) => task.id === constraint.task_id)).map((constraint: any) => ({
      id: constraint.constraint_id, taskId: constraint.task_id, type: constraint.constraint_type,
      date: constraint.constraint_date || null, timestampUtc: constraint.constraint_timestamp_utc || null,
      minutes: constraint.constraint_minutes === null ? null : Number(constraint.constraint_minutes), status: constraint.status,
    })),
    employees, capacityDays, pendingOvertimeTaskIds: [...pendingOvertimeTaskIds].sort(),
    dataGapEmployeeDates: [...new Map<string, { employeeId: string; localWorkDate: string }>(
      dataGapEmployeeDates.map((gap) => [`${gap.employeeId}|${gap.localWorkDate}`, gap]),
    ).values()],
  });
}

async function readRun(db: any, runId: string, actor?: ShadowActor | null) {
  const [run, authorityGuard] = await Promise.all([
    db.prepare(`SELECT * FROM schedule_recalculation_runs WHERE run_id=?`).bind(runId).first(),
    db.prepare(`SELECT revision FROM shadow_schedule_authority_guard WHERE guard_id='GLOBAL'`).first(),
  ]);
  if (!run) throw new ShadowScheduleError('SHADOW_RUN_STALE', 404, { runId });
  const authorityStale = !authorityGuard || !shadowRunAuthorityIsCurrent(run.authority_revision, authorityGuard.revision);
  const [versions, tasks, allocations, impacts, diffs] = await Promise.all([
    db.prepare(`SELECT * FROM shadow_schedule_versions WHERE run_id=? ORDER BY project_id`).bind(runId).all(),
    db.prepare(`SELECT st.*,p.id AS project_id,t.task_name,t.task_name_ko,t.task_name_vi,t.task_sort_order,p.name AS project_name,p.name_ko AS project_name_ko,p.name_vi AS project_name_vi,w.name AS employee_name,
                COALESCE((SELECT current_progress FROM task_actual_aggregates WHERE task_id=st.task_id),
                         (SELECT actual_progress FROM task_actuals WHERE task_id=st.task_id ORDER BY created_at DESC LIMIT 1),
                         t.progress,0) AS current_progress
                FROM shadow_schedule_tasks st JOIN shadow_schedule_versions sv ON sv.shadow_version_id=st.shadow_version_id
                JOIN tasks t ON t.id=st.task_id JOIN projects p ON p.id=t.project_id LEFT JOIN workers w ON w.id=st.employee_id
                WHERE sv.run_id=? ORDER BY p.id,t.task_sort_order,t.id`).bind(runId).all(),
    db.prepare(`SELECT * FROM shadow_capacity_allocations WHERE run_id=? ORDER BY local_work_date,employee_id,priority_order,allocation_sequence`).bind(runId).all(),
    db.prepare(`SELECT * FROM shadow_impact_summaries WHERE run_id=?`).bind(runId).all(),
    db.prepare(`SELECT * FROM shadow_impact_task_diffs WHERE run_id=? ORDER BY project_id,task_id`).bind(runId).all(),
  ]);
  let taskRows = tasks.results || [];
  let allocationRows = allocations.results || [];
  let diffRows = diffs.results || [];
  let versionRows = versions.results || [];
  let impactRows = impacts.results || [];
  if (actor && !actor.isManager && actor.worker.access_role !== 'VIEWER') {
    const filtered = filterEmployeeShadowView({
      employeeId: actor.worker.id, tasks: taskRows, allocations: allocationRows,
      diffs: diffRows, versions: versionRows, impacts: impactRows,
    });
    taskRows = filtered.tasks;
    allocationRows = filtered.allocations;
    diffRows = filtered.diffs;
    versionRows = filtered.versions;
    impactRows = filtered.impacts;
  }
  if (authorityStale) versionRows = versionRows.map((version: any) => ({ ...version, status: 'STALE' }));
  return { run, versions: versionRows, tasks: taskRows, allocations: allocationRows, impacts: impactRows, diffs: diffRows, authorityStale };
}

function classifyProjectSummary(result: ShadowEngineResult, primaryProjectId: string | null) {
  const primaryProject = result.projects.find((project) => project.projectId === primaryProjectId) || result.projects[0];
  const summaryKo = result.crossProjectImpact
    ? `다른 프로젝트를 포함해 ${result.affectedProjectCount}개 프로젝트, ${result.affectedTaskCount}개 작업에 Shadow 일정 영향 후보가 있습니다.`
    : `${result.affectedProjectCount}개 프로젝트, ${result.affectedTaskCount}개 작업에 Shadow 일정 영향 후보가 있습니다.`;
  const summaryVi = result.crossProjectImpact
    ? `Có ảnh hưởng lịch Shadow dự kiến đến ${result.affectedProjectCount} dự án và ${result.affectedTaskCount} công việc, bao gồm dự án khác.`
    : `Có ảnh hưởng lịch Shadow dự kiến đến ${result.affectedProjectCount} dự án và ${result.affectedTaskCount} công việc.`;
  return { primaryProject, summaryKo, summaryVi };
}

export async function executeShadowRun(db: any, options: RunOptions) {
  if (!options.idempotencyKey) throw new ShadowScheduleError('IDEMPOTENCY_CONFLICT', 400);
  const requestShape = {
    projectId: options.projectId || null, sourceWorklogId: options.sourceWorklogId || null,
    sourceRevisionId: options.sourceRevisionId || null, triggerType: options.triggerType || 'MANUAL',
    planningCutoffUtc: options.planningCutoffUtc || null, planningCutoffLocalDate: options.planningCutoffLocalDate || null,
  };
  const requestFingerprint = await sha256Hex(canonicalJson(requestShape));
  let existingRequest = await db.prepare(`SELECT * FROM schedule_recalculation_requests WHERE idempotency_key=?`).bind(options.idempotencyKey).first();
  if (existingRequest && existingRequest.request_fingerprint !== requestFingerprint) throw new ShadowScheduleError('IDEMPOTENCY_CONFLICT', 409);
  if (existingRequest) {
    const run = await db.prepare(`SELECT run_id FROM schedule_recalculation_runs WHERE request_id=? ORDER BY started_at DESC LIMIT 1`).bind(existingRequest.request_id).first();
    if (run) return { ...(await readRun(db, run.run_id)), reused: true, officialForecastChanged: false };
  }
  let requestId = existingRequest?.request_id || uuid('srr');
  if (!existingRequest) {
    await db.prepare(
      `INSERT OR IGNORE INTO schedule_recalculation_requests
       (request_id,trigger_type,source_worklog_id,source_revision_id,project_id,employee_id,requested_by,requested_at,idempotency_key,request_fingerprint,status,attempt_count)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'PENDING',0)`
    ).bind(requestId, options.triggerType || 'MANUAL', options.sourceWorklogId || null, options.sourceRevisionId || null,
      options.projectId || null, null, options.requestedBy, new Date().toISOString(), options.idempotencyKey, requestFingerprint).run();
    existingRequest = await db.prepare(`SELECT * FROM schedule_recalculation_requests WHERE idempotency_key=?`).bind(options.idempotencyKey).first();
    if (!existingRequest || existingRequest.request_fingerprint !== requestFingerprint) {
      throw new ShadowScheduleError('IDEMPOTENCY_CONFLICT', 409);
    }
    requestId = existingRequest.request_id;
  }

  const reservation = await db.prepare(`UPDATE schedule_recalculation_requests
    SET status='RUNNING',attempt_count=attempt_count+1,updated_at=CURRENT_TIMESTAMP
    WHERE request_id=?1 AND status IN ('PENDING','FAILED_RETRYABLE')`).bind(existingRequest.request_id).run();
  if (Number(reservation.meta?.changes || 0) === 0) {
    const concurrentRun = await db.prepare(`SELECT run_id FROM schedule_recalculation_runs WHERE request_id=? ORDER BY started_at DESC LIMIT 1`)
      .bind(existingRequest.request_id).first();
    if (concurrentRun) return { ...(await readRun(db, concurrentRun.run_id)), reused: true, officialForecastChanged: false };
    throw new ShadowScheduleError('IDEMPOTENCY_CONFLICT', 409, { reason: 'REQUEST_IN_PROGRESS' });
  }

  try {
  const authorityGuard = await db.prepare(`SELECT revision FROM shadow_schedule_authority_guard WHERE guard_id='GLOBAL'`).first();
  if (!authorityGuard) throw new ShadowScheduleError('SHADOW_RUN_INPUT_CHANGED', 409, { reason: 'SHADOW_AUTHORITY_GUARD_MISSING' });
  const authorityRevision = Number(authorityGuard.revision);
  const input = await buildShadowEngineInput(db, options);
  const inputFingerprint = await fingerprintEngineInput(input);
  const existingRun = await db.prepare(`SELECT run_id FROM schedule_recalculation_runs WHERE engine_version=? AND input_fingerprint=?`).bind(SHADOW_ENGINE_VERSION, inputFingerprint).first();
  if (existingRun) {
    const reusedRun = await readRun(db, existingRun.run_id);
    const reusedVersions = reusedRun.versions || [];
    const activationToken = uuid('sag');
    const activationStatements = reusedVersions.flatMap((version: any) => [
      db.prepare(`UPDATE shadow_schedule_versions SET status='STALE'
        WHERE project_id=?1 AND status IN ('CURRENT','BLOCKED') AND run_id<>?2
          AND EXISTS (SELECT 1 FROM shadow_schedule_authority_guard WHERE guard_id='GLOBAL' AND revision=?3 AND lock_token=?4)`)
        .bind(version.project_id, existingRun.run_id, authorityRevision, activationToken),
      db.prepare(`UPDATE shadow_schedule_versions SET status=?1 WHERE shadow_version_id=?2
          AND EXISTS (SELECT 1 FROM shadow_schedule_authority_guard WHERE guard_id='GLOBAL' AND revision=?3 AND lock_token=?4)`)
        .bind(reusedRun.run.status === 'BLOCKED' ? 'BLOCKED' : 'CURRENT', version.shadow_version_id, authorityRevision, activationToken),
    ]);
    const activationResults = await db.batch([
      db.prepare(`UPDATE shadow_schedule_authority_guard SET lock_token=?1,updated_at=CURRENT_TIMESTAMP
        WHERE guard_id='GLOBAL' AND revision=?2`).bind(activationToken, authorityRevision),
      ...activationStatements,
      db.prepare(`UPDATE schedule_recalculation_runs SET authority_revision=?1
        WHERE run_id=?2 AND EXISTS (
          SELECT 1 FROM shadow_schedule_authority_guard WHERE guard_id='GLOBAL' AND revision=?1 AND lock_token=?3
        )`).bind(authorityRevision, existingRun.run_id, activationToken),
      db.prepare(`UPDATE schedule_recalculation_requests SET status=?1,updated_at=CURRENT_TIMESTAMP WHERE request_id=?2
          AND EXISTS (SELECT 1 FROM shadow_schedule_authority_guard WHERE guard_id='GLOBAL' AND revision=?3 AND lock_token=?4)`)
        .bind(reusedRun.run.status === 'BLOCKED' ? 'FAILED_BLOCKED' : 'COMPLETED', requestId, authorityRevision, activationToken),
    ]);
    if (Number(activationResults[0]?.meta?.changes || 0) !== 1 ||
        Number(activationResults.at(-2)?.meta?.changes || 0) !== 1 ||
        Number(activationResults.at(-1)?.meta?.changes || 0) !== 1) {
      throw new ShadowScheduleError('SHADOW_RUN_INPUT_CHANGED', 409, { reason: 'SHADOW_AUTHORITY_CHANGED' });
    }
    const reactivatedRun = await readRun(db, existingRun.run_id);
    return { ...reactivatedRun, reused: true, officialForecastChanged: false };
  }

  const officialBefore = await officialDataFingerprint(db);
  const result = runShadowScheduleEngine(input);
  const officialAfterCalculation = await officialDataFingerprint(db);
  if (officialAfterCalculation !== officialBefore) {
    await db.prepare(`UPDATE schedule_recalculation_requests SET status='FAILED_BLOCKED',last_error_code='OFFICIAL_FORECAST_MUTATION_DETECTED',updated_at=CURRENT_TIMESTAMP WHERE request_id=?`).bind(requestId).run();
    throw new ShadowScheduleError('OFFICIAL_FORECAST_MUTATION_DETECTED', 500);
  }
  const resultFingerprint = await sha256Hex(canonicalJson(result));
  const runId = uuid('srun');
  const now = new Date().toISOString();
  const statements: any[] = [];
  statements.push(db.prepare(
    `INSERT INTO schedule_recalculation_runs
     (run_id,request_id,engine_version,mode,input_fingerprint,result_fingerprint,based_on_baseline_version,based_on_forecast_version,
      planning_cutoff_utc,planning_cutoff_local_date,status,data_confidence,affected_project_count,affected_task_count,
      started_at,completed_at,created_by,validation_summary_json,official_data_before_hash,official_data_after_hash,authority_revision)
     VALUES (?1,?2,?3,'SHADOW',?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20)`
  ).bind(runId, requestId, SHADOW_ENGINE_VERSION, inputFingerprint, resultFingerprint,
    input.basedOnBaselineVersion, input.basedOnForecastVersion, input.planningCutoffUtc, input.planningCutoffLocalDate,
    result.status, result.dataConfidence, result.affectedProjectCount, result.affectedTaskCount, now, now,
    options.requestedBy, canonicalJson({ issues: result.validationIssues }), officialBefore, officialAfterCalculation, authorityRevision));
  statements.push(db.prepare(`INSERT INTO schedule_engine_input_snapshots (snapshot_id,run_id,input_fingerprint,canonical_input_json,created_at) VALUES (?1,?2,?3,?4,?5)`)
    .bind(uuid('ssis'), runId, inputFingerprint, canonicalJson(input), now));

  const versionIdByProject = new Map<string, string>();
  for (const project of result.projects) {
    const currentNumberRow = await db.prepare(`SELECT COALESCE(MAX(shadow_version_number),0) AS n FROM shadow_schedule_versions WHERE project_id=?`).bind(project.projectId).first();
    const versionId = uuid('ssv');
    versionIdByProject.set(project.projectId, versionId);
    statements.push(db.prepare(`UPDATE shadow_schedule_versions SET status='STALE' WHERE project_id=? AND status IN ('CURRENT','BLOCKED')`).bind(project.projectId));
    const sourceProject = input.projects.find((item) => item.id === project.projectId);
    statements.push(db.prepare(
      `INSERT INTO shadow_schedule_versions
       (shadow_version_id,run_id,project_id,based_on_forecast_version_id,shadow_version_number,baseline_start_date,baseline_end_date,
        official_forecast_start_date,official_forecast_end_date,shadow_forecast_start_date,shadow_forecast_end_date,
        schedule_variance_workdays,variance_calendar_employee_id,variance_calendar_timezone,variance_calendar_basis,
        approval_classification,approval_reasons_json,data_confidence,status,created_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20)`
    ).bind(versionId, runId, project.projectId, sourceProject?.officialForecastVersionId || null,
      Number(currentNumberRow?.n || 0) + 1, project.baselineStart, project.baselineEnd, project.officialStart, project.officialEnd,
      project.shadowStart, project.shadowEnd, project.scheduleVarianceWorkdays, project.varianceCalendarEmployeeId,
      project.varianceCalendarTimezone, project.varianceCalendarBasis, project.approvalClassification,
      canonicalJson(project.approvalReasons), project.dataConfidence, project.dataConfidence === 'BLOCKED' ? 'BLOCKED' : 'CURRENT', now));
    if (project.approvalClassification === 'APPROVAL_REQUIRED') {
      statements.push(db.prepare(`INSERT INTO forecast_approval_requests
        (approval_request_id,shadow_version_id,shadow_run_id,project_id,status,requested_by,requested_at,created_at,updated_at)
        VALUES (?1,?2,?3,?4,'PENDING',?5,?6,?6,?6)`)
        .bind(uuid('far'), versionId, runId, project.projectId, options.requestedBy, now));
    }
  }
  const taskRowsJson = canonicalJson(result.tasks.map((task) => ({
    shadow_task_id: uuid('sst'), shadow_version_id: versionIdByProject.get(task.projectId), task_id: task.taskId,
    employee_id: task.employeeId, baseline_start: task.baselineStart, baseline_end: task.baselineEnd,
    official_forecast_start: task.officialStart, official_forecast_end: task.officialEnd,
    shadow_start: task.shadowStart, shadow_end: task.shadowEnd, delta_start_workdays: task.deltaStartWorkdays,
    delta_end_workdays: task.deltaEndWorkdays, remaining_minutes: task.remainingMinutes,
    allocation_source: task.allocationSource, constraint_result: task.constraintResult,
    dependency_result: task.dependencyResult, priority_result: task.priorityResult,
    impact_reason_codes_json: canonicalJson(task.impactReasonCodes), approval_required: task.approvalRequired ? 1 : 0,
    data_confidence: task.dataConfidence,
  })));
  const diffRowsJson = canonicalJson(result.tasks.map((task) => ({
    diff_id: uuid('sid'), run_id: runId, shadow_version_id: versionIdByProject.get(task.projectId), project_id: task.projectId,
    task_id: task.taskId, official_start: task.officialStart, official_end: task.officialEnd,
    shadow_start: task.shadowStart, shadow_end: task.shadowEnd, delta_start_workdays: task.deltaStartWorkdays,
    delta_end_workdays: task.deltaEndWorkdays, change_direction: task.changeDirection,
    reason_codes_json: canonicalJson(task.impactReasonCodes), approval_required: task.approvalRequired ? 1 : 0,
  })));
  const allocationRowsJson = canonicalJson(result.allocations.map((allocation) => ({
    allocation_id: uuid('sca'), run_id: runId, shadow_version_id: versionIdByProject.get(allocation.projectId),
    task_id: allocation.taskId, employee_id: allocation.employeeId, local_work_date: allocation.localWorkDate,
    timezone: allocation.timezone, available_capacity_minutes: allocation.availableCapacityMinutes,
    allocated_minutes: allocation.allocatedMinutes, capacity_source: allocation.capacitySource,
    priority_order: allocation.priorityOrder, allocation_sequence: allocation.allocationSequence,
    starts_at_utc: allocation.startsAtUtc, ends_at_utc: allocation.endsAtUtc,
  })));
  if (result.tasks.length) {
    statements.push(db.prepare(`INSERT INTO shadow_schedule_tasks
      SELECT json_extract(value,'$.shadow_task_id'),json_extract(value,'$.shadow_version_id'),json_extract(value,'$.task_id'),
      json_extract(value,'$.employee_id'),json_extract(value,'$.baseline_start'),json_extract(value,'$.baseline_end'),
      json_extract(value,'$.official_forecast_start'),json_extract(value,'$.official_forecast_end'),json_extract(value,'$.shadow_start'),
      json_extract(value,'$.shadow_end'),json_extract(value,'$.delta_start_workdays'),json_extract(value,'$.delta_end_workdays'),
      json_extract(value,'$.remaining_minutes'),json_extract(value,'$.allocation_source'),json_extract(value,'$.constraint_result'),
      json_extract(value,'$.dependency_result'),json_extract(value,'$.priority_result'),json_extract(value,'$.impact_reason_codes_json'),
      json_extract(value,'$.approval_required'),json_extract(value,'$.data_confidence') FROM json_each(?1)`).bind(taskRowsJson));
    statements.push(db.prepare(`INSERT INTO shadow_impact_task_diffs
      SELECT json_extract(value,'$.diff_id'),json_extract(value,'$.run_id'),json_extract(value,'$.shadow_version_id'),
      json_extract(value,'$.project_id'),json_extract(value,'$.task_id'),json_extract(value,'$.official_start'),
      json_extract(value,'$.official_end'),json_extract(value,'$.shadow_start'),json_extract(value,'$.shadow_end'),
      json_extract(value,'$.delta_start_workdays'),json_extract(value,'$.delta_end_workdays'),json_extract(value,'$.change_direction'),
      json_extract(value,'$.reason_codes_json'),json_extract(value,'$.approval_required') FROM json_each(?1)`).bind(diffRowsJson));
  }
  if (result.allocations.length) {
    statements.push(db.prepare(`INSERT INTO shadow_capacity_allocations
      SELECT json_extract(value,'$.allocation_id'),json_extract(value,'$.run_id'),json_extract(value,'$.shadow_version_id'),
      json_extract(value,'$.task_id'),json_extract(value,'$.employee_id'),json_extract(value,'$.local_work_date'),
      json_extract(value,'$.timezone'),json_extract(value,'$.available_capacity_minutes'),json_extract(value,'$.allocated_minutes'),
      json_extract(value,'$.capacity_source'),json_extract(value,'$.priority_order'),json_extract(value,'$.allocation_sequence'),
      json_extract(value,'$.starts_at_utc'),json_extract(value,'$.ends_at_utc') FROM json_each(?1)`).bind(allocationRowsJson));
  }
  const summary = classifyProjectSummary(result, options.projectId || null);
  statements.push(db.prepare(
    `INSERT INTO shadow_impact_summaries
     (impact_summary_id,run_id,source_worklog_id,employee_id,primary_project_id,affected_project_count,affected_task_count,
      tasks_advanced_count,tasks_delayed_count,unchanged_task_count,primary_project_end_before,primary_project_end_after,
      cross_project_impact,approval_required,approval_reason_codes_json,summary_ko,summary_vi,created_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)`
  ).bind(uuid('sis'), runId, options.sourceWorklogId || null, input.sourceEmployeeId, summary.primaryProject?.projectId || null,
    result.affectedProjectCount, result.affectedTaskCount, result.tasksAdvancedCount, result.tasksDelayedCount,
    result.unchangedTaskCount, summary.primaryProject?.officialEnd || null, summary.primaryProject?.shadowEnd || null,
    result.crossProjectImpact ? 1 : 0, result.approvalRequired ? 1 : 0, canonicalJson(result.approvalReasonCodes),
    summary.summaryKo, summary.summaryVi, now));
  statements.push(await auditStatement(db, options.actor || null, {
    eventType: 'SHADOW_RUN_COMPLETED', entityType: 'SCHEDULE_RECALCULATION_RUN', entityId: runId,
    after: { inputFingerprint, resultFingerprint, status: result.status, officialForecastChanged: false }, requestId,
  }));
  statements.push(db.prepare(`UPDATE schedule_recalculation_requests SET status=?1,updated_at=CURRENT_TIMESTAMP WHERE request_id=?2`)
    .bind(result.status === 'BLOCKED' ? 'FAILED_BLOCKED' : 'COMPLETED', requestId));
  await db.batch(statements);

  const officialAfterPersistence = await officialDataFingerprint(db);
  if (officialAfterPersistence !== officialBefore) {
    await db.prepare(`UPDATE schedule_recalculation_runs SET status='FAILED',official_data_after_hash=? WHERE run_id=?`).bind(officialAfterPersistence, runId).run();
    throw new ShadowScheduleError('OFFICIAL_FORECAST_MUTATION_DETECTED', 500);
  }
  return { ...(await readRun(db, runId)), reused: false, officialForecastChanged: false };
  } catch (error) {
    const normalizedError = !(error instanceof ShadowScheduleError) &&
      String(error instanceof Error ? error.message : error).includes('SHADOW_RUN_INPUT_CHANGED')
      ? new ShadowScheduleError('SHADOW_RUN_INPUT_CHANGED', 409, { reason: 'SHADOW_AUTHORITY_CHANGED' })
      : error;
    await db.prepare(`UPDATE schedule_recalculation_requests
      SET status='FAILED_RETRYABLE',last_error_code=?1,last_error_message=?2,updated_at=CURRENT_TIMESTAMP
      WHERE request_id=?3 AND status='RUNNING'`)
      .bind(normalizedError instanceof ShadowScheduleError ? normalizedError.code : 'SHADOW_ENGINE_FAILED', normalizedError instanceof Error ? normalizedError.message : String(normalizedError), requestId).run();
    throw normalizedError;
  }
}

export async function enqueueShadowRecalculation(db: any, input: {
  worklogId: string;
  revisionId: string;
  projectId?: string | null;
  employeeId: string;
  requestedBy: string;
  idempotencyKey: string;
}) {
  const requestFingerprint = await sha256Hex(canonicalJson(input));
  const existing = await db.prepare(`SELECT * FROM schedule_recalculation_requests WHERE idempotency_key=?`).bind(input.idempotencyKey).first();
  if (existing) {
    if (existing.request_fingerprint !== requestFingerprint) throw new ShadowScheduleError('IDEMPOTENCY_CONFLICT', 409);
    return { requestId: existing.request_id, status: existing.status };
  }
  const requestId = uuid('srr');
  await db.batch([
    db.prepare(`UPDATE shadow_schedule_versions AS sv SET status='STALE'
      WHERE sv.status IN ('CURRENT','BLOCKED') AND (
        (?1 IS NOT NULL AND sv.project_id=?1)
        OR EXISTS (
          SELECT 1 FROM shadow_schedule_tasks st
          WHERE st.shadow_version_id=sv.shadow_version_id AND st.employee_id=?2
        )
        OR EXISTS (
          SELECT 1 FROM shadow_capacity_allocations a
          WHERE a.shadow_version_id=sv.shadow_version_id AND a.employee_id=?2
        )
        OR sv.run_id IN (
          SELECT run_id FROM schedule_recalculation_runs WHERE request_id IN (
            SELECT request_id FROM schedule_recalculation_requests
            WHERE source_worklog_id=?3 AND source_revision_id<>?4
          )
        )
      )`).bind(input.projectId || null, input.employeeId, input.worklogId, input.revisionId),
    db.prepare(`UPDATE forecast_approval_requests SET status='STALE',updated_at=CURRENT_TIMESTAMP
      WHERE status='PENDING' AND shadow_version_id IN (
        SELECT sv.shadow_version_id FROM shadow_schedule_versions sv
        WHERE sv.status='STALE' AND (
          (?1 IS NOT NULL AND sv.project_id=?1)
          OR EXISTS (
            SELECT 1 FROM shadow_schedule_tasks st
            WHERE st.shadow_version_id=sv.shadow_version_id AND st.employee_id=?2
          )
          OR EXISTS (
            SELECT 1 FROM shadow_capacity_allocations a
            WHERE a.shadow_version_id=sv.shadow_version_id AND a.employee_id=?2
          )
          OR sv.run_id IN (
            SELECT run_id FROM schedule_recalculation_runs WHERE request_id IN (
              SELECT request_id FROM schedule_recalculation_requests
              WHERE source_worklog_id=?3 AND source_revision_id<>?4
            )
          )
        )
      )`).bind(input.projectId || null, input.employeeId, input.worklogId, input.revisionId),
    db.prepare(
      `INSERT INTO schedule_recalculation_requests
       (request_id,trigger_type,source_worklog_id,source_revision_id,project_id,employee_id,requested_by,requested_at,
        idempotency_key,request_fingerprint,status,attempt_count)
       VALUES (?1,'WORKLOG_EOD',?2,?3,?4,?5,?6,?7,?8,?9,'PENDING',0)`
    ).bind(requestId, input.worklogId, input.revisionId, input.projectId || null, input.employeeId,
      input.requestedBy, new Date().toISOString(), input.idempotencyKey, requestFingerprint),
  ]);
  return { requestId, status: 'PENDING' };
}

export async function generateDependencyCandidates(db: any, actorContext: ActorContextServer, projectId: string, commit?: ShadowMutationCommit) {
  const actor = await resolveShadowActor(db, actorContext, true);
  requireManager(actor);
  const graphGuard = await db.prepare(`SELECT revision FROM dependency_graph_guard WHERE guard_id='GLOBAL'`).first();
  if (!graphGuard) throw new ShadowScheduleError('SHADOW_RUN_INPUT_CHANGED', 409, { reason: 'DEPENDENCY_GRAPH_GUARD_MISSING' });
  const expectedRevision = Number(graphGuard.revision);
  const project = projectId ? await db.prepare(`SELECT id FROM projects WHERE id=?`).bind(projectId).first() : null;
  if (!project) throw new ShadowScheduleError('DEPENDENCY_TASK_NOT_FOUND', 404, { projectId });
  const [tasksResult, groupsResult, assigneesResult] = await Promise.all([
    db.prepare(`SELECT t.*,svt.forecast_start,svt.forecast_end,tb.baseline_start_date AS snapshot_baseline_start,tb.baseline_end_date AS snapshot_baseline_end
      FROM tasks t
      LEFT JOIN schedule_version_tasks svt ON svt.task_id=t.id AND svt.version_id=(SELECT id FROM schedule_versions WHERE project_id=t.project_id ORDER BY version_number DESC LIMIT 1)
      LEFT JOIN task_baselines tb ON tb.task_id=t.id AND tb.baseline_id=(SELECT id FROM project_baselines WHERE project_id=t.project_id ORDER BY version DESC LIMIT 1)
      WHERE t.project_id=? ORDER BY t.task_sort_order,t.id`).bind(projectId).all(),
    db.prepare(`SELECT * FROM task_groups WHERE project_id=? AND deleted_at IS NULL ORDER BY sort_order,id`).bind(projectId).all(),
    db.prepare(`SELECT * FROM task_assignees WHERE deleted_at IS NULL ORDER BY task_id,sort_order`).all(),
  ]);
  const groupOrder = new Map((groupsResult.results || []).map((group: any) => [group.id, Number(group.sort_order || 0)]));
  const primaryMap = new Map((assigneesResult.results || []).filter((assignment: any) => assignment.assignment_role === 'PRIMARY').map((assignment: any) => [assignment.task_id, assignment.worker_id]));
  const tasks: DependencyProposalTask[] = (tasksResult.results || []).map((task: any) => ({
    id: task.id, projectId: task.project_id, groupId: task.task_group_id || null,
    groupOrder: Number(groupOrder.get(task.task_group_id) || 0), taskOrder: Number(task.task_sort_order || 0), name: task.task_name,
    baselineStart: task.snapshot_baseline_start || task.baseline_start_date || null,
    baselineEnd: task.snapshot_baseline_end || task.baseline_end_date || null,
    officialStart: task.forecast_start || task.start_date || null, officialEnd: task.forecast_end || task.end_date || null,
    primaryEmployeeId: primaryMap.get(task.id) || task.primary_worker_id || null,
  }));
  const generated = generateDependencyProposals(tasks);
  const existingResult = generated.proposals.length ? await db.prepare(`SELECT predecessor_task_id,successor_task_id,dependency_type
    FROM task_dependencies WHERE project_id=?`).bind(projectId).all() : { results: [] };
  const existingKeys = new Set((existingResult.results || []).map((row: any) =>
    `${row.predecessor_task_id}|${row.successor_task_id}|${row.dependency_type}`));
  const expectedSavedCount = generated.proposals.filter((proposal) =>
    !existingKeys.has(`${proposal.predecessorTaskId}|${proposal.successorTaskId}|FINISH_TO_START`)).length;
  const response = { ...generated, savedCount: expectedSavedCount, existingCount: generated.proposals.length - expectedSavedCount, projectId };
  const statements: any[] = [];
  const now = new Date().toISOString();
  const lockToken = uuid('dgl');
  const guardRevision = expectedRevision + 1;
  statements.push(db.prepare(`UPDATE dependency_graph_guard SET revision=revision+1,lock_token=?1,updated_at=?2
    WHERE guard_id='GLOBAL' AND revision=?3`).bind(lockToken, now, expectedRevision));
  for (const proposal of generated.proposals) {
    statements.push(db.prepare(
      `INSERT OR IGNORE INTO task_dependencies
       (dependency_id,project_id,predecessor_task_id,successor_task_id,dependency_type,lag_work_minutes,status,
        confidence_score,confidence_level,proposal_source,proposal_evidence_json,proposed_at,proposed_by,created_at,updated_at)
       SELECT ?1,?2,?3,?4,'FINISH_TO_START',0,'PROPOSED',?5,?6,'AUTOMATIC_WBS',?7,?8,?9,?8,?8
       WHERE EXISTS (SELECT 1 FROM dependency_graph_guard WHERE guard_id='GLOBAL' AND lock_token=?10 AND revision=?11)`
    ).bind(uuid('dep'), proposal.projectId, proposal.predecessorTaskId, proposal.successorTaskId,
      proposal.confidenceScore, proposal.confidenceLevel, canonicalJson(proposal.evidence), now, actor.worker.id,
      lockToken, guardRevision));
  }
  statements.push(await auditStatement(db, actor, {
    eventType: 'DEPENDENCY_PROPOSALS_GENERATED', entityType: 'PROJECT', entityId: projectId,
    after: { proposed: generated.proposals.length, parallelTaskIds: generated.parallelTaskIds },
    dependencyGraphGuard: { lockToken, revision: guardRevision },
  }));
  if (commit) statements.push(commit(response, { lockToken, revision: guardRevision }));
  const results = statements.length ? await db.batch(statements) : [];
  const savedCount = results.slice(1, generated.proposals.length + 1).reduce((sum: number, result: any) => sum + Number(result.meta?.changes || 0), 0);
  const auditResult = results[generated.proposals.length + 1];
  const commitResult = commit ? results.at(-1) : null;
  if (Number(results[0]?.meta?.changes || 0) !== 1 || savedCount !== expectedSavedCount ||
      Number(auditResult?.meta?.changes || 0) !== 1 || (commit && Number(commitResult?.meta?.changes || 0) !== 1)) {
    throw new ShadowScheduleError('SHADOW_RUN_INPUT_CHANGED', 409, { reason: 'DEPENDENCY_PROPOSALS_CHANGED' });
  }
  return commit ? response : { ...generated, savedCount, existingCount: generated.proposals.length - savedCount, projectId };
}

export async function listDependencies(db: any, actorContext: ActorContextServer, filters: Record<string, string>) {
  const actor = await resolveShadowActor(db, actorContext);
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (filters.project_id) { conditions.push(`d.project_id=?`); values.push(filters.project_id); }
  if (filters.status) { conditions.push(`d.status=?`); values.push(filters.status); }
  if (!actor.isManager && actor.worker.access_role !== 'VIEWER') {
    conditions.push(`(EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id=d.predecessor_task_id AND ta.worker_id=? AND ta.deleted_at IS NULL)
      OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id=d.successor_task_id AND ta.worker_id=? AND ta.deleted_at IS NULL)
      OR pre.primary_worker_id=? OR succ.primary_worker_id=?
      OR EXISTS (SELECT 1 FROM temporary_primary_assignments tpa
        WHERE tpa.task_id IN (d.predecessor_task_id,d.successor_task_id)
          AND tpa.temporary_primary_employee_id=? AND tpa.status='ACTIVE'))`);
    values.push(actor.worker.id, actor.worker.id, actor.worker.id, actor.worker.id, actor.worker.id);
  }
  let statement = db.prepare(`SELECT d.*,p.name AS project_name,pre.task_name AS predecessor_name,pre.task_sort_order AS predecessor_wbs,
    succ.task_name AS successor_name,succ.task_sort_order AS successor_wbs,c.name AS confirmed_by_name,r.name AS rejected_by_name
    FROM task_dependencies d JOIN projects p ON p.id=d.project_id JOIN tasks pre ON pre.id=d.predecessor_task_id
    JOIN tasks succ ON succ.id=d.successor_task_id LEFT JOIN workers c ON c.id=d.confirmed_by LEFT JOIN workers r ON r.id=d.rejected_by
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY d.project_id,pre.task_sort_order,succ.task_sort_order,d.dependency_id`);
  if (values.length) statement = statement.bind(...values);
  const result = await statement.all();
  return { dependencies: result.results || [], permissions: { canReview: actor.isManager, readOnly: !actor.isManager } };
}

export async function reviewDependencies(db: any, actorContext: ActorContextServer, ids: string[], action: 'CONFIRM' | 'REJECT', input: { lagWorkMinutes?: number; reason?: string }, commit?: ShadowMutationCommit) {
  action = validateDependencyReviewAction(action);
  const actor = await resolveShadowActor(db, actorContext, true);
  requireManager(actor);
  const uniqueIds = [...new Set(ids)].sort();
  if (!uniqueIds.length) throw new ShadowScheduleError('DEPENDENCY_TASK_NOT_FOUND', 404);
  const placeholders = uniqueIds.map(() => '?').join(',');
  const dependenciesResult = await db.prepare(`SELECT * FROM task_dependencies WHERE dependency_id IN (${placeholders})`).bind(...uniqueIds).all();
  const dependencies = dependenciesResult.results || [];
  if (dependencies.length !== uniqueIds.length) throw new ShadowScheduleError('DEPENDENCY_TASK_NOT_FOUND', 404);
  const now = new Date().toISOString();
  if (action === 'CONFIRM') {
    const guard = await db.prepare(`SELECT revision FROM dependency_graph_guard WHERE guard_id='GLOBAL'`).first();
    if (!guard) throw new ShadowScheduleError('SHADOW_RUN_INPUT_CHANGED', 409, { reason: 'DEPENDENCY_GRAPH_GUARD_MISSING' });
    const expectedRevision = Number(guard.revision);
    const affectedProjectIds = [...new Set(dependencies.map((dependency: any) => String(dependency.project_id)))].sort();
    const projectPlaceholders = affectedProjectIds.map(() => '?').join(',');
    const allResult = await db.prepare(`SELECT * FROM task_dependencies
      WHERE (status='CONFIRMED' AND project_id IN (${projectPlaceholders})) OR dependency_id IN (${placeholders})`)
      .bind(...affectedProjectIds, ...uniqueIds).all();
    const taskResult = await db.prepare(`SELECT * FROM tasks WHERE project_id IN (${projectPlaceholders}) ORDER BY project_id,task_sort_order,id`)
      .bind(...affectedProjectIds).all();
    const inputForValidation: ShadowEngineInput = {
      engineVersion: SHADOW_ENGINE_VERSION, planningCutoffUtc: now, planningCutoffLocalDate: now.slice(0, 10),
      basedOnBaselineVersion: null, basedOnForecastVersion: null, sourceWorklogId: null, sourceRevisionId: null,
      sourceEmployeeId: null, sourceProjectId: null, projects: [], employees: [], capacityDays: [], constraints: [], pendingOvertimeTaskIds: [], dataGapEmployeeDates: [],
      tasks: (taskResult.results || []).map((task: any) => ({
        id: task.id, projectId: task.project_id, groupId: task.task_group_id, wbsOrder: Number(task.task_sort_order || 0), name: task.task_name,
        status: 'FUTURE', baselineStart: task.baseline_start_date, baselineEnd: task.baseline_end_date,
        officialStart: task.start_date, officialEnd: task.end_date, dueDate: task.end_date,
        primaryEmployeeId: task.primary_worker_id, temporaryPrimaries: [], actualStarted: false, actualStartUtc: null, actualEndUtc: null, actualEndLocalDate: null,
        completed: false, completionReported: false, remainingEstimatedMinutes: 0, confirmedEffortMinutes: null,
        proposedEffortMinutes: null, approvedActualMinutes: 0,
      })),
      dependencies: (allResult.results || []).map((dependency: any) => ({
        id: dependency.dependency_id, projectId: dependency.project_id, predecessorTaskId: dependency.predecessor_task_id,
        successorTaskId: dependency.successor_task_id, type: dependency.dependency_type,
        lagWorkMinutes: uniqueIds.includes(dependency.dependency_id) ? Number(input.lagWorkMinutes ?? dependency.lag_work_minutes ?? 0) : Number(dependency.lag_work_minutes || 0),
        status: 'CONFIRMED',
      })),
    };
    const validation = validateDependencyGraph(inputForValidation);
    const graphError = validation.find((issue) => issue.code.startsWith('DEPENDENCY_') || issue.code === 'INVALID_DEPENDENCY_LAG');
    if (graphError) throw new ShadowScheduleError(graphError.code, 409, graphError.details);
    const lockToken = uuid('dgl');
    const guardRevision = expectedRevision + 1;
    const guardedAudits = await Promise.all(dependencies.map((dependency: any) => auditStatement(db, actor, {
      eventType: 'DEPENDENCY_CONFIRMED', entityType: 'TASK_DEPENDENCY', entityId: dependency.dependency_id,
      before: dependency, after: { status: 'CONFIRMED', lagWorkMinutes: input.lagWorkMinutes }, reason: input.reason,
      dependencyGraphGuard: { lockToken, revision: guardRevision },
    })));
    const response = { action, dependencyIds: uniqueIds, count: uniqueIds.length };
    const guardedConfirmResults = await db.batch([
      db.prepare(`UPDATE dependency_graph_guard SET revision=revision+1,lock_token=?1,updated_at=?2
        WHERE guard_id='GLOBAL' AND revision=?3`).bind(lockToken, now, expectedRevision),
      ...dependencies.map((dependency: any) => db.prepare(`UPDATE task_dependencies
        SET status='CONFIRMED',lag_work_minutes=?1,confirmed_at=?2,confirmed_by=?3,
            rejected_at=NULL,rejected_by=NULL,rejection_reason=NULL,updated_at=?2
        WHERE dependency_id=?4 AND EXISTS (
          SELECT 1 FROM dependency_graph_guard WHERE guard_id='GLOBAL' AND lock_token=?5 AND revision=?6
        ) AND status=?7 AND updated_at=?8`).bind(Number(input.lagWorkMinutes ?? dependency.lag_work_minutes ?? 0), now, actor.worker.id,
          dependency.dependency_id, lockToken, guardRevision, dependency.status, dependency.updated_at)),
      ...guardedAudits,
      ...(commit ? [commit(response, { lockToken, revision: guardRevision })] : []),
    ]);
    if (!dependencyGraphGuardAcquired(guardedConfirmResults, dependencies.length, commit ? 1 : 0)) {
      throw new ShadowScheduleError('SHADOW_RUN_INPUT_CHANGED', 409, { reason: 'DEPENDENCY_GRAPH_CHANGED' });
    }
  }
  const response = { action, dependencyIds: uniqueIds, count: uniqueIds.length };
  if (action === 'REJECT') {
    const guard = await db.prepare(`SELECT revision FROM dependency_graph_guard WHERE guard_id='GLOBAL'`).first();
    if (!guard) throw new ShadowScheduleError('SHADOW_RUN_INPUT_CHANGED', 409, { reason: 'DEPENDENCY_GRAPH_GUARD_MISSING' });
    const expectedRevision = Number(guard.revision);
    const guardRevision = expectedRevision + 1;
    const lockToken = uuid('dgl');
    const guardedAudits = await Promise.all(dependencies.map((dependency: any) => auditStatement(db, actor, {
      eventType: 'DEPENDENCY_REJECTED', entityType: 'TASK_DEPENDENCY', entityId: dependency.dependency_id,
      before: dependency, after: { status: 'REJECTED', lagWorkMinutes: input.lagWorkMinutes }, reason: input.reason,
      dependencyGraphGuard: { lockToken, revision: guardRevision },
    })));
    const results = await db.batch([
      db.prepare(`UPDATE dependency_graph_guard SET revision=revision+1,lock_token=?1,updated_at=?2
        WHERE guard_id='GLOBAL' AND revision=?3`).bind(lockToken, now, expectedRevision),
      ...dependencies.map((dependency: any) => db.prepare(`UPDATE task_dependencies
        SET status='REJECTED',rejected_at=?1,rejected_by=?2,rejection_reason=?3,
            confirmed_at=NULL,confirmed_by=NULL,updated_at=?1
        WHERE dependency_id=?4 AND status=?5 AND updated_at=?6 AND EXISTS (
          SELECT 1 FROM dependency_graph_guard WHERE guard_id='GLOBAL' AND lock_token=?7 AND revision=?8
        )`).bind(now, actor.worker.id, input.reason || null, dependency.dependency_id,
          dependency.status, dependency.updated_at, lockToken, guardRevision)),
      ...guardedAudits,
      ...(commit ? [commit(response, { lockToken, revision: guardRevision })] : []),
    ]);
    if (!dependencyGraphGuardAcquired(results, dependencies.length, commit ? 1 : 0)) {
      throw new ShadowScheduleError('SHADOW_RUN_INPUT_CHANGED', 409, { reason: 'DEPENDENCY_GRAPH_CHANGED' });
    }
  }
  return response;
}

export async function getTaskConstraints(db: any, actorContext: ActorContextServer, taskId: string) {
  await resolveShadowActor(db, actorContext);
  const result = await db.prepare(`SELECT c.*,w.name AS created_by_name FROM task_constraints c LEFT JOIN workers w ON w.id=c.created_by WHERE task_id=? ORDER BY created_at DESC`).bind(taskId).all();
  return result.results || [];
}

export async function setTaskConstraint(db: any, actorContext: ActorContextServer, taskId: string, input: any, commit?: ShadowMutationCommit) {
  const actor = await resolveShadowActor(db, actorContext, true);
  requireManager(actor);
  const validTypes = ['AS_SOON_AS_POSSIBLE','NOT_BEFORE','FIXED_START','FIXED_END','MILESTONE'];
  if (!validTypes.includes(input.constraint_type)) throw new ShadowScheduleError('CONSTRAINT_CONFLICT', 400);
  const date = input.constraint_date ?? null;
  const timestampUtc = input.constraint_timestamp_utc ?? null;
  const minutes = input.constraint_minutes ?? null;
  const validDate = date === null || isValidIsoLocalDate(date);
  const validTimestamp = timestampUtc === null || isValidUtcTimestamp(timestampUtc);
  const validMinutes = minutes === null || (Number.isInteger(minutes) && minutes >= 0);
  const boundaryCount = Number(Boolean(date)) + Number(Boolean(timestampUtc));
  const asapClean = input.constraint_type !== 'AS_SOON_AS_POSSIBLE' || (!date && !timestampUtc && minutes === null);
  if (!validDate || !validTimestamp || !validMinutes ||
      (input.constraint_type !== 'AS_SOON_AS_POSSIBLE' && boundaryCount !== 1) || !asapClean) {
    throw new ShadowScheduleError('CONSTRAINT_CONFLICT', 400);
  }
  const task = await db.prepare(`SELECT * FROM tasks WHERE id=?`).bind(taskId).first();
  if (!task) throw new ShadowScheduleError('DEPENDENCY_TASK_NOT_FOUND', 404);
  const constraintId = uuid('con');
  const now = new Date().toISOString();
  const response = { constraintId, taskId, ...input, status: 'ACTIVE' };
  const results = await db.batch([
    db.prepare(`UPDATE task_constraints SET status='SUPERSEDED',updated_by=?1,updated_at=?2 WHERE task_id=?3 AND status='ACTIVE'`).bind(actor.worker.id, now, taskId),
    db.prepare(`INSERT INTO task_constraints (constraint_id,task_id,constraint_type,constraint_date,constraint_timestamp_utc,constraint_minutes,reason,status,created_by,created_at,updated_by,updated_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,'ACTIVE',?8,?9,?8,?9)`).bind(constraintId, taskId, input.constraint_type,
      input.constraint_date || null, input.constraint_timestamp_utc || null, input.constraint_minutes ?? null, input.reason || null, actor.worker.id, now),
    await auditStatement(db, actor, { eventType: 'TASK_CONSTRAINT_SET', entityType: 'TASK_CONSTRAINT', entityId: constraintId, after: input, reason: input.reason }),
    ...(commit ? [commit(response)] : []),
  ]);
  if (commit && Number(results[results.length - 1]?.meta?.changes || 0) !== 1) {
    throw new ShadowScheduleError('IDEMPOTENCY_CONFLICT', 409, { reason: 'FINALIZE_FAILED' });
  }
  return response;
}

export async function listProjectPriorities(db: any, actorContext: ActorContextServer) {
  const actor = await resolveShadowActor(db, actorContext);
  const result = await db.prepare(`SELECT pp.*,p.name AS project_name,w.name AS set_by_name FROM project_priorities pp JOIN projects p ON p.id=pp.project_id LEFT JOIN workers w ON w.id=pp.set_by ORDER BY pp.priority_rank,pp.project_id`).all();
  return { priorities: result.results || [], permissions: { canEdit: actor.isManager, readOnly: !actor.isManager } };
}

export async function setProjectPriority(db: any, actorContext: ActorContextServer, input: any, commit?: ShadowMutationCommit) {
  const actor = await resolveShadowActor(db, actorContext, true);
  requireManager(actor);
  const rank = Number(input.priority_rank);
  if (!input.project_id || !Number.isInteger(rank) || rank <= 0) throw new ShadowScheduleError('PROJECT_PRIORITY_REQUIRED', 400);
  const effectiveFrom = input.effective_from || new Date().toISOString().slice(0, 10);
  const effectiveTo = input.effective_to || null;
  if (!isValidIsoLocalDate(effectiveFrom) || (effectiveTo !== null && !isValidIsoLocalDate(effectiveTo)) ||
      (effectiveTo !== null && effectiveFrom > effectiveTo)) {
    throw new ShadowScheduleError('PROJECT_PRIORITY_REQUIRED', 400);
  }
  const project = await db.prepare(`SELECT id FROM projects WHERE id=?`).bind(input.project_id).first();
  if (!project) throw new ShadowScheduleError('PROJECT_PRIORITY_REQUIRED', 404);
  const now = new Date().toISOString();
  const before = await db.prepare(`SELECT * FROM project_priorities WHERE project_id=?`).bind(input.project_id).first();
  const response = { projectId: input.project_id, priorityRank: rank };
  const results = await db.batch([
    db.prepare(`INSERT INTO project_priorities (project_id,priority_rank,priority_label,effective_from,effective_to,set_by,reason,created_at,updated_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8)
      ON CONFLICT(project_id) DO UPDATE SET priority_rank=excluded.priority_rank,priority_label=excluded.priority_label,
      effective_from=excluded.effective_from,effective_to=excluded.effective_to,set_by=excluded.set_by,reason=excluded.reason,updated_at=excluded.updated_at`)
      .bind(input.project_id, rank, input.priority_label || null, effectiveFrom, effectiveTo, actor.worker.id, input.reason || null, now),
    await auditStatement(db, actor, { eventType: 'PROJECT_PRIORITY_SET', entityType: 'PROJECT_PRIORITY', entityId: input.project_id, before, after: input, reason: input.reason }),
    ...(commit ? [commit(response)] : []),
  ]);
  if (commit && Number(results[results.length - 1]?.meta?.changes || 0) !== 1) {
    throw new ShadowScheduleError('IDEMPOTENCY_CONFLICT', 409, { reason: 'FINALIZE_FAILED' });
  }
  return response;
}

export async function validateShadowRun(db: any, actorContext: ActorContextServer, input: any) {
  const actor = await resolveShadowActor(db, actorContext);
  if (!actor.isManager && actor.worker.access_role !== 'VIEWER') throw new ShadowScheduleError('DEPENDENCY_PERMISSION_DENIED', 403);
  const engineInput = await buildShadowEngineInput(db, {
    projectId: input.project_id || null, sourceWorklogId: input.source_worklog_id || null,
    sourceRevisionId: input.source_revision_id || null, planningCutoffUtc: input.planning_cutoff_utc,
    planningCutoffLocalDate: input.planning_cutoff_local_date, idempotencyKey: 'validation-only', requestedBy: actor.worker.id,
  });
  const result = runShadowScheduleEngine(engineInput);
  return { inputFingerprint: await fingerprintEngineInput(engineInput), result, officialForecastChanged: false, persisted: false };
}

export async function runShadowForActor(db: any, actorContext: ActorContextServer, input: any, idempotencyKey: string) {
  const actor = await resolveShadowActor(db, actorContext, true);
  requireManager(actor);
  return executeShadowRun(db, {
    projectId: input.project_id || null, sourceWorklogId: input.source_worklog_id || null,
    sourceRevisionId: input.source_revision_id || null, triggerType: input.trigger_type || 'MANUAL',
    planningCutoffUtc: input.planning_cutoff_utc, planningCutoffLocalDate: input.planning_cutoff_local_date,
    idempotencyKey, requestedBy: actor.worker.id, actor,
  });
}

export async function getShadowRun(db: any, actorContext: ActorContextServer, runId: string) {
  const actor = await resolveShadowActor(db, actorContext);
  return { ...(await readRun(db, runId, actor)), officialForecastChanged: false };
}

export async function getCurrentProjectShadow(db: any, actorContext: ActorContextServer, projectId: string) {
  const actor = await resolveShadowActor(db, actorContext);
  // A persisted output is only a current preview while its exact authority
  // revision and based-on Official Forecast are still current.  Otherwise a
  // Project Detail page could render a stale tentative bar after 3B applied
  // another Forecast Version.
  const current = await db.prepare(`SELECT sv.run_id FROM shadow_schedule_versions sv
    JOIN schedule_recalculation_runs sr ON sr.run_id=sv.run_id
    WHERE sv.project_id=?1 AND sv.status IN ('CURRENT','BLOCKED')
      AND COALESCE(sv.apply_status,'NOT_APPLIED')='NOT_APPLIED'
      AND sr.authority_revision=(SELECT revision FROM shadow_schedule_authority_guard WHERE guard_id='GLOBAL')
      AND sv.based_on_forecast_version_id=(SELECT id FROM schedule_versions WHERE project_id=sv.project_id ORDER BY version_number DESC LIMIT 1)
    ORDER BY CASE sv.status WHEN 'CURRENT' THEN 0 ELSE 1 END, sv.shadow_version_number DESC LIMIT 1`).bind(projectId).first();
  if (!current) return { run: null, versions: [], tasks: [], allocations: [], impacts: [], diffs: [], officialForecastChanged: false };
  return { ...(await readRun(db, current.run_id, actor)), officialForecastChanged: false };
}

export async function getShadowImpacts(db: any, actorContext: ActorContextServer, runId: string) {
  const actor = await resolveShadowActor(db, actorContext);
  const [summary, diffs] = await Promise.all([
    db.prepare(`SELECT * FROM shadow_impact_summaries WHERE run_id=?`).bind(runId).all(),
    db.prepare(`SELECT d.*,t.task_name,p.name AS project_name FROM shadow_impact_task_diffs d JOIN tasks t ON t.id=d.task_id JOIN projects p ON p.id=d.project_id WHERE d.run_id=? ORDER BY d.project_id,t.task_sort_order,t.id`).bind(runId).all(),
  ]);
  let summaries = summary.results || [];
  let taskDiffs = diffs.results || [];
  if (!actor.isManager && actor.worker.access_role !== 'VIEWER') {
    const visible = await db.prepare(`
      SELECT st.task_id,sv.project_id
      FROM shadow_schedule_tasks st JOIN shadow_schedule_versions sv ON sv.shadow_version_id=st.shadow_version_id
      WHERE sv.run_id=?1 AND st.employee_id=?2
      UNION
      SELECT a.task_id,a.project_id FROM shadow_capacity_allocations a WHERE a.run_id=?1 AND a.employee_id=?2
    `).bind(runId, actor.worker.id).all();
    const taskIds = new Set((visible.results || []).map((row: any) => row.task_id));
    const projectIds = new Set((visible.results || []).map((row: any) => row.project_id));
    taskDiffs = taskDiffs.filter((diff: any) => taskIds.has(diff.task_id));
    summaries = summaries.filter((item: any) => item.employee_id === actor.worker.id || projectIds.has(item.primary_project_id));
  }
  return { summaries, diffs: taskDiffs };
}

export async function getShadowAllocations(db: any, actorContext: ActorContextServer, runId: string) {
  const actor = await resolveShadowActor(db, actorContext);
  let statement = db.prepare(`SELECT a.*,t.task_name,w.name AS employee_name FROM shadow_capacity_allocations a JOIN tasks t ON t.id=a.task_id JOIN workers w ON w.id=a.employee_id WHERE a.run_id=?1 ${!actor.isManager && actor.worker.access_role !== 'VIEWER' ? 'AND a.employee_id=?2' : ''} ORDER BY a.local_work_date,a.employee_id,a.priority_order,a.allocation_sequence`);
  statement = !actor.isManager && actor.worker.access_role !== 'VIEWER' ? statement.bind(runId, actor.worker.id) : statement.bind(runId);
  const result = await statement.all();
  return result.results || [];
}
