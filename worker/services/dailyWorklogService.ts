import { resolveWorkDayStatusServer } from './workCalendar';
import type { ActorContextServer } from './v3FoundationService';
import { enqueueShadowRecalculation, runShadowForActor } from './shadowScheduleService';

export const WORK_CATEGORIES = [
  'NORMAL_ASSIGNED_TASK', 'UNPLANNED_SAME_PROJECT_TASK', 'OTHER_PROJECT_TASK',
  'OUTSIDE_WORK_SAME_PROJECT', 'OUTSIDE_WORK_OTHER_PROJECT', 'COMPANY_DUTY',
  'TRAINING', 'MEETING', 'ADMINISTRATION', 'INTERNAL_COMMUNICATION', 'WAITING',
  'NO_WORK_TECHNICAL_BLOCKER', 'NO_WORK_EXTERNAL_DEPENDENCY', 'APPROVED_LEAVE',
  'EMERGENCY_LEAVE',
] as const;

const GAP_CODES = new Set([
  'ADMINISTRATION', 'INTERNAL_COMMUNICATION', 'WAITING', 'TECHNICAL_BLOCKER',
  'EXTERNAL_DEPENDENCY', 'RECORDING_OMISSION', 'PERSONAL_EXCEPTION', 'OTHER',
]);
const OTHER_PROJECT = new Set(['OTHER_PROJECT_TASK', 'OUTSIDE_WORK_OTHER_PROJECT']);
const MEETING_CATEGORIES = new Set(['MEETING', 'OUTSIDE_WORK_SAME_PROJECT', 'OUTSIDE_WORK_OTHER_PROJECT']);
const LEAVE_CATEGORIES = new Set(['APPROVED_LEAVE', 'EMERGENCY_LEAVE']);
const TASK_SCOPED_CATEGORIES = new Set([
  'NORMAL_ASSIGNED_TASK', 'UNPLANNED_SAME_PROJECT_TASK', 'OTHER_PROJECT_TASK',
  'OUTSIDE_WORK_SAME_PROJECT', 'OUTSIDE_WORK_OTHER_PROJECT',
]);
const PROGRESS_FIELDS = ['progress_after', 'remaining_estimated_minutes', 'completion_reported'] as const;

export class WorklogError extends Error {
  constructor(public code: string, public status = 400, public details?: unknown, message?: string) {
    super(message || code);
  }
}

export interface WorklogActor extends ActorContextServer {
  worker: any;
  isManager: boolean;
}

export type WorklogApprovalAction = 'APPROVE' | 'RETURN' | 'REJECT';

function canApproveWorklogs(actor: WorklogActor): boolean {
  return actor.worker.access_role === 'EDITOR' && Number(actor.worker.can_manage_schedule_engine) === 1;
}

async function requireWorklogApprovalManager(db: any, actorContext: ActorContextServer): Promise<WorklogActor> {
  const actor = await resolveReadActor(db, actorContext);
  if (!canApproveWorklogs(actor)) throw new WorklogError('WORKLOG_APPROVAL_PERMISSION_DENIED', 403);
  return actor;
}

async function canManageWorklogSubject(db: any, actor: WorklogActor, employeeId: string): Promise<boolean> {
  if (actor.worker.access_role === 'VIEWER') return true;
  if (actor.worker.id === employeeId) return true;
  if (!canApproveWorklogs(actor)) return false;
  const relation = await db.prepare(
    `SELECT 1 AS allowed FROM pilot_employee_supervision
     WHERE manager_employee_id=? AND employee_id=? AND is_active=1 LIMIT 1`,
  ).bind(actor.worker.id, employeeId).first();
  if (relation) return true;
  const scoped = await db.prepare(`SELECT 1 AS scoped FROM pilot_employee_supervision WHERE manager_employee_id=? AND is_active=1 LIMIT 1`).bind(actor.worker.id).first();
  return !scoped;
}

async function resolveReadActor(db: any, actorContext: ActorContextServer): Promise<WorklogActor> {
  if (!actorContext.actorEmployeeId) throw new WorklogError('WORKLOG_PERMISSION_DENIED', 403);
  const worker = await db.prepare(`SELECT * FROM workers WHERE id = ? AND is_active = 1`).bind(actorContext.actorEmployeeId).first();
  if (!worker) throw new WorklogError('WORKLOG_PERMISSION_DENIED', 403);
  return {
    ...actorContext,
    worker,
    isManager:
      Number(worker.can_manage_country_calendar) === 1 ||
      Number(worker.can_manage_integrations) === 1 ||
      Number(worker.can_manage_schedule_engine) === 1,
  };
}

function canReadSubject(actor: WorklogActor, employeeId: string): boolean {
  return actor.worker.id === employeeId || actor.selectedViewEmployeeId === employeeId || actor.worker.access_role === 'VIEWER';
}

const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const asBool = (value: unknown) => value === true || value === 1 || value === '1';
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const isoTime = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidLocalDate(value: unknown): value is string {
  if (typeof value !== 'string' || !isoDate.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function rejectDuplicateTaskEntries(entries: any[]) {
  const taskIds = entries.map((entry) => entry.task_id).filter(Boolean);
  if (new Set(taskIds).size !== taskIds.length) {
    throw new WorklogError('WORKLOG_ALREADY_EXISTS', 409, { reason: 'DUPLICATE_TASK_ENTRY' });
  }
}

function stableValue(value: any): any {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stableValue(value[key]);
      return result;
    }, {} as Record<string, unknown>);
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

async function payloadHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value || 0);
  return { year: part('year'), month: part('month'), day: part('day'), hour: part('hour'), minute: part('minute'), second: part('second') };
}

export function utcToLocalDateTime(utc: Date, timezone: string): { date: string; time: string } {
  const p = localParts(utc, timezone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

export function zonedLocalToUtc(localDate: string, localTime: string, timezone: string): Date {
  const target = Date.parse(`${localDate}T${localTime}:00Z`);
  let guess = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const p = localParts(new Date(guess), timezone);
    const represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    guess += target - represented;
  }
  return new Date(guess);
}

export function isMorningLate(submittedAtUtc: Date, localWorkDate: string, timezone: string, deadlineLocal: string): boolean {
  return submittedAtUtc.getTime() > zonedLocalToUtc(localWorkDate, deadlineLocal, timezone).getTime();
}

export function validateIncrement(minutes: unknown, increment: 15 | 30): number {
  const value = Number(minutes);
  if (!Number.isInteger(value) || value < 0 || value % increment !== 0) {
    throw new WorklogError('INVALID_TIME_INCREMENT', 400, { increment_minutes: increment, received: minutes });
  }
  return value;
}

export function validatePrimaryProgress(entry: any, progressBefore: number, isCorrection = false) {
  if (entry.progress_after === undefined || entry.progress_after === null ||
      entry.remaining_estimated_minutes === undefined || entry.remaining_estimated_minutes === null ||
      !String(entry.work_result || '').trim()) {
    throw new WorklogError('PRIMARY_PROGRESS_REQUIRED');
  }
  const progress = Number(entry.progress_after);
  const remaining = Number(entry.remaining_estimated_minutes);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100 || !Number.isFinite(remaining) || remaining < 0) {
    throw new WorklogError('PRIMARY_PROGRESS_REQUIRED');
  }
  if (!isCorrection && progress < progressBefore) throw new WorklogError('PROGRESS_DECREASE_REQUIRES_CORRECTION', 409);
  if (progress === 100 && remaining !== 0) throw new WorklogError('PROGRESS_100_REQUIRES_ZERO_REMAINING');
  if (remaining === 0 && (progress !== 100 || !asBool(entry.completion_reported))) {
    throw new WorklogError('ZERO_REMAINING_REQUIRES_COMPLETION');
  }
  if (progress === 100 && !asBool(entry.completion_reported)) {
    throw new WorklogError('ZERO_REMAINING_REQUIRES_COMPLETION');
  }
  if (progress < 100 && remaining <= 0) throw new WorklogError('PRIMARY_PROGRESS_REQUIRED');
}

export function validateTimeRanges(entries: any[], policy: any) {
  const ranges: Array<{ start: number; end: number; index: number }> = [];
  entries.forEach((entry, index) => {
    if (!entry.local_start_time && !entry.local_end_time) return;
    if (!isoTime.test(entry.local_start_time || '') || !isoTime.test(entry.local_end_time || '')) {
      throw new WorklogError('ENTRY_TIME_OVERLAP', 400, { entry_index: index, reason: 'INVALID_TIME_RANGE' });
    }
    const toMin = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    const start = toMin(entry.local_start_time);
    const end = toMin(entry.local_end_time);
    if (end <= start || end - start > 24 * 60) throw new WorklogError('ENTRY_TIME_OVERLAP', 400, { entry_index: index, reason: 'INVALID_TIME_RANGE' });
    const lunchStart = toMin(policy.lunch_start_local);
    const lunchEnd = toMin(policy.lunch_end_local);
    if (start < lunchEnd && end > lunchStart) throw new WorklogError('ENTRY_TIME_OVERLAP', 400, { entry_index: index, reason: 'LUNCH_OVERLAP' });
    if (entry.actual_minutes !== undefined && Number(entry.actual_minutes) !== end - start) {
      throw new WorklogError('INVALID_TIME_INCREMENT', 400, { entry_index: index, reason: 'DURATION_MISMATCH' });
    }
    ranges.push({ start, end, index });
  });
  ranges.sort((a, b) => a.start - b.start);
  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index].start < ranges[index - 1].end) {
      throw new WorklogError('ENTRY_TIME_OVERLAP', 400, { entry_indexes: [ranges[index - 1].index, ranges[index].index] });
    }
  }
}

async function getPolicyAndWorker(db: any, employeeId: string) {
  const worker = await db.prepare(`SELECT * FROM workers WHERE id = ? AND is_active = 1`).bind(employeeId).first();
  if (!worker) throw new WorklogError('WORKLOG_PERMISSION_DENIED', 403);
  const policy = await db.prepare(`SELECT * FROM office_work_policies WHERE country_code = ?`).bind(worker.country_code).first();
  if (!policy) throw new WorklogError('INVALID_LOCAL_WORK_DATE', 400, { reason: 'OFFICE_POLICY_NOT_FOUND' });
  return { worker, policy };
}

export async function resolveActor(db: any, actorContext: ActorContextServer): Promise<WorklogActor> {
  if (!actorContext.actorEmployeeId) throw new WorklogError('WORKLOG_PERMISSION_DENIED', 403);
  const worker = await db.prepare(`SELECT * FROM workers WHERE id = ? AND is_active = 1`).bind(actorContext.actorEmployeeId).first();
  if (!worker) throw new WorklogError('WORKLOG_PERMISSION_DENIED', 403);
  if (worker.access_role !== 'EDITOR') throw new WorklogError('WORKLOG_READ_ONLY_ACTOR', 403);
  return {
    ...actorContext,
    worker,
    isManager:
      Number(worker.can_manage_country_calendar) === 1 ||
      Number(worker.can_manage_integrations) === 1 ||
      Number(worker.can_manage_schedule_engine) === 1,
  };
}

function requireSubject(actor: WorklogActor, employeeId: string) {
  if (actor.worker.id !== employeeId) {
    throw new WorklogError('WORKLOG_SUBJECT_MISMATCH', 403, {
      actor_employee_id: actor.worker.id,
      selected_view_employee_id: actor.selectedViewEmployeeId,
      subject_employee_id: employeeId,
    });
  }
}

async function calendarData(db: any) {
  const [holidays, overrides] = await Promise.all([
    db.prepare(`SELECT * FROM country_holidays`).all(),
    db.prepare(`SELECT * FROM calendar_overrides`).all(),
  ]);
  return { holidays: holidays.results || [], overrides: overrides.results || [] };
}

export async function getDailyCapacity(db: any, employeeId: string, localWorkDate: string, excludeWorklogId?: string) {
  if (!isValidLocalDate(localWorkDate)) throw new WorklogError('INVALID_LOCAL_WORK_DATE');
  const { worker, policy } = await getPolicyAndWorker(db, employeeId);
  const { holidays, overrides } = await calendarData(db);
  const day = resolveWorkDayStatusServer(localWorkDate, worker, holidays, overrides);
  const base = day.is_working_day ? Number(policy.schedulable_minutes) : 0;
  const events = await db.prepare(
    `SELECT e.* FROM employee_capacity_events e
     LEFT JOIN daily_worklog_revisions r ON r.id=e.revision_id
     WHERE e.employee_id = ? AND e.local_work_date = ? AND e.approval_status IN ('EFFECTIVE','APPROVED')
       AND (e.revision_id IS NULL OR r.is_effective=1)
       AND (? IS NULL OR e.worklog_id IS NULL OR e.worklog_id <> ?)
     ORDER BY e.created_at, e.id`
  ).bind(employeeId, localWorkDate, excludeWorklogId || null, excludeWorklogId || null).all();
  const uniqueEvents = new Map<string, any>();
  for (const event of events.results || []) uniqueEvents.set(`${event.source_type}:${event.source_reference_id}`, event);
  const adjustment = base === 0 ? 0 : Array.from(uniqueEvents.values()).reduce((sum, event) => sum + Number(event.adjustment_minutes || 0), 0);
  const effective = Math.max(0, base + adjustment);
  return {
    employee_id: employeeId, local_work_date: localWorkDate, office_code: policy.office_code,
    timezone: policy.timezone, work_start_local: policy.work_start_local, work_end_local: policy.work_end_local,
    lunch_start_local: policy.lunch_start_local, lunch_end_local: policy.lunch_end_local,
    morning_normal_deadline_local: policy.morning_normal_deadline_local,
    default_capacity_minutes: Number(policy.schedulable_minutes), base_capacity_minutes: base,
    adjustment_minutes: adjustment, effective_capacity_minutes: effective,
    day_status: day, events: Array.from(uniqueEvents.values()),
  };
}

export async function getSelfEditDeadline(db: any, employeeId: string, localWorkDate: string): Promise<string> {
  const { worker, policy } = await getPolicyAndWorker(db, employeeId);
  const { holidays, overrides } = await calendarData(db);
  const cursor = new Date(`${localWorkDate}T00:00:00Z`);
  for (let attempt = 0; attempt < 366; attempt += 1) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const next = cursor.toISOString().slice(0, 10);
    if (resolveWorkDayStatusServer(next, worker, holidays, overrides).is_working_day) {
      return zonedLocalToUtc(next, '09:00', policy.timezone).toISOString();
    }
  }
  throw new WorklogError('INVALID_LOCAL_WORK_DATE', 400, { reason: 'NEXT_VALID_WORKDAY_NOT_FOUND' });
}

async function idempotentResult(db: any, key: string, operation: string, payload: any) {
  if (!key) throw new WorklogError('IDEMPOTENCY_CONFLICT', 409, { reason: 'IDEMPOTENCY_KEY_REQUIRED' });
  const hash = await payloadHash(payload);
  const existing = await db.prepare(`SELECT * FROM worklog_idempotency_keys WHERE idempotency_key = ?`).bind(key).first();
  if (!existing) return { hash, response: null as any };
  if (existing.operation !== operation || existing.payload_hash !== hash) throw new WorklogError('IDEMPOTENCY_CONFLICT', 409);
  return { hash, response: JSON.parse(existing.response_json) };
}

async function assignmentForEntry(db: any, employeeId: string, localDate: string, entry: any) {
  if (!entry.task_id) return null;
  const task = await db.prepare(`SELECT * FROM tasks WHERE id = ?`).bind(entry.task_id).first();
  if (!task) throw new WorklogError('WORKLOG_PERMISSION_DENIED', 403, { task_id: entry.task_id });
  const temporary = await db.prepare(
    `SELECT * FROM temporary_primary_assignments WHERE task_id = ? AND temporary_primary_employee_id = ?
     AND status = 'ACTIVE' AND effective_start_date <= ? AND effective_end_date >= ? LIMIT 1`
  ).bind(entry.task_id, employeeId, localDate, localDate).first();
  const assignment = await db.prepare(
    `SELECT * FROM task_assignees WHERE task_id = ? AND worker_id = ? AND deleted_at IS NULL LIMIT 1`
  ).bind(entry.task_id, employeeId).first();
  if (!assignment && !temporary) throw new WorklogError('WORKLOG_PERMISSION_DENIED', 403, { task_id: entry.task_id });
  return { task, assignment, role: temporary ? 'PRIMARY' : assignment.assignment_role, assignmentId: temporary?.id || assignment.id };
}

async function currentTaskActual(db: any, taskId: string) {
  const aggregate = await db.prepare(`SELECT * FROM task_actual_aggregates WHERE task_id = ?`).bind(taskId).first();
  if (aggregate) return {
    ...aggregate,
    raw_actual_minutes: Number(aggregate.raw_actual_minutes || 0),
    approved_actual_minutes: Number(aggregate.approved_actual_minutes || 0),
    current_progress: Number(aggregate.current_progress || 0),
    remaining_estimated_minutes: Number(aggregate.remaining_estimated_minutes || 0),
    completion_reported: Number(aggregate.completion_reported || 0),
  };
  const legacy = await db.prepare(
    `SELECT actual_progress AS current_progress, remaining_effort_minutes AS remaining_estimated_minutes,
            actual_minutes AS raw_actual_minutes, CASE WHEN actual_progress >= 100 THEN 1 ELSE 0 END AS completion_reported,
            'LEGACY_BOOTSTRAP' AS progress_source
     FROM task_actuals WHERE task_id = ? ORDER BY created_at DESC LIMIT 1`
  ).bind(taskId).first();
  return {
    raw_actual_minutes: Number(legacy?.raw_actual_minutes || 0),
    approved_actual_minutes: Number(legacy?.raw_actual_minutes || 0),
    current_progress: Number(legacy?.current_progress || 0),
    remaining_estimated_minutes: Number(legacy?.remaining_estimated_minutes || 0),
    completion_reported: Number(legacy?.completion_reported || 0),
    actual_status: Number(legacy?.completion_reported || 0) === 1 ? 'COMPLETION_REPORTED' : 'IN_PROGRESS',
    last_actual_work_date: null,
    last_effective_worklog_id: null,
    progress_source: legacy?.progress_source || 'TASK_FALLBACK',
    updated_at: null,
  };
}

export function validateEntryAssignmentShape(entry: any) {
  const hasProgress = PROGRESS_FIELDS.some((field) => entry[field] !== undefined && entry[field] !== null);
  if (!entry.task_id && (TASK_SCOPED_CATEGORIES.has(entry.work_category) || hasProgress)) {
    throw new WorklogError('ASSIGNMENT_REQUIRED', 403, { work_category: entry.work_category });
  }
}

export function validateMorningAssignmentRole(entry: any, assignment: any) {
  if (assignment?.role !== 'PRIMARY' && entry.target_progress !== undefined && entry.target_progress !== null) {
    throw new WorklogError('SUPPORT_PROGRESS_FORBIDDEN', 403);
  }
}

export function collectAggregateRefreshTargets(previous: any[], current: any[]) {
  const targets = new Map<string, string>();
  for (const row of [...previous, ...current]) {
    const taskId = row?.task_id || row?.task?.id;
    const projectId = row?.project_id || row?.task?.project_id;
    if (taskId && projectId) targets.set(taskId, projectId);
  }
  return targets;
}

export function resolveEffectiveRevision(worklog: any, revisions: any[]) {
  const effectiveRows = revisions.filter((row) => Number(row.is_effective) === 1);
  const effectiveRevision = effectiveRows[0] || null;
  return {
    effectiveRevision,
    effectiveRevisionCount: effectiveRows.length,
    integrity: effectiveRows.length === 1 && Number(worklog.current_revision_number) === Number(effectiveRevision?.revision_number)
      ? 'PASS' : worklog.status === 'NOT_CREATED' || worklog.status === 'VOIDED' ? 'NOT_APPLICABLE' : 'FAIL',
  };
}

export function buildTaskActualView(taskId: string, projectId: string, aggregate: any, contributionRows: any[]) {
  const lastEffective = [...contributionRows].reverse().find((row: any) => Number(row.is_effective) === 1) || null;
  const normalized = {
    task_id: taskId,
    project_id: aggregate.project_id || projectId,
    raw_actual_minutes: Number(aggregate.raw_actual_minutes || 0),
    approved_actual_minutes: Number(aggregate.approved_actual_minutes || 0),
    current_progress: Number(aggregate.current_progress || 0),
    remaining_estimated_minutes: Number(aggregate.remaining_estimated_minutes || 0),
    completion_reported: Number(aggregate.completion_reported || 0) === 1,
    last_actual_work_date: aggregate.last_actual_work_date || null,
    last_effective_worklog_id: aggregate.last_effective_worklog_id || null,
    last_effective_revision_id: lastEffective?.revision_id || null,
    progress_source: aggregate.progress_source || 'TASK_FALLBACK',
    updated_at: aggregate.updated_at || null,
  };
  return {
    aggregate: normalized,
    taskActual: {
      taskId: normalized.task_id,
      rawActualMinutes: normalized.raw_actual_minutes,
      approvedActualMinutes: normalized.approved_actual_minutes,
      currentProgress: normalized.current_progress,
      remainingEstimatedMinutes: normalized.remaining_estimated_minutes,
      completionReported: normalized.completion_reported,
      lastActualWorkDate: normalized.last_actual_work_date,
      lastEffectiveWorklogId: normalized.last_effective_worklog_id,
      lastEffectiveRevisionId: normalized.last_effective_revision_id,
      progressSource: normalized.progress_source,
      updatedAt: normalized.updated_at,
    },
  };
}

function aggregateStatement(db: any, taskId: string, projectId: string) {
  return db.prepare(
    `INSERT INTO task_actual_aggregates (
       task_id, project_id, raw_actual_minutes, approved_actual_minutes, current_progress,
       remaining_estimated_minutes, completion_reported, actual_status, last_actual_work_date,
       last_effective_worklog_id, progress_source, updated_at
     )
     SELECT ?, ?,
       COALESCE((SELECT SUM(raw_actual_minutes) FROM task_actual_contributions WHERE task_id = ? AND is_effective = 1), 0),
       COALESCE((SELECT SUM(approved_actual_minutes) FROM task_actual_contributions WHERE task_id = ? AND is_effective = 1), 0),
       COALESCE((SELECT progress_after FROM task_actual_contributions WHERE task_id = ? AND is_effective = 1 AND assignment_role = 'PRIMARY' AND progress_after IS NOT NULL ORDER BY local_work_date DESC, created_at DESC, id DESC LIMIT 1),
                (SELECT actual_progress FROM task_actuals WHERE task_id = ? ORDER BY created_at DESC LIMIT 1), 0),
       (SELECT remaining_estimated_minutes FROM task_actual_contributions WHERE task_id = ? AND is_effective = 1 AND assignment_role = 'PRIMARY' AND progress_after IS NOT NULL ORDER BY local_work_date DESC, created_at DESC, id DESC LIMIT 1),
       COALESCE((SELECT completion_reported FROM task_actual_contributions WHERE task_id = ? AND is_effective = 1 AND assignment_role = 'PRIMARY' AND progress_after IS NOT NULL ORDER BY local_work_date DESC, created_at DESC, id DESC LIMIT 1), 0),
       CASE WHEN COALESCE((SELECT completion_reported FROM task_actual_contributions WHERE task_id = ? AND is_effective = 1 AND assignment_role = 'PRIMARY' ORDER BY local_work_date DESC, created_at DESC, id DESC LIMIT 1),0)=1 THEN 'COMPLETION_REPORTED' ELSE 'IN_PROGRESS' END,
       (SELECT MAX(local_work_date) FROM task_actual_contributions WHERE task_id = ? AND is_effective = 1),
       (SELECT worklog_id FROM task_actual_contributions WHERE task_id = ? AND is_effective = 1 ORDER BY local_work_date DESC, created_at DESC, id DESC LIMIT 1),
       CASE WHEN EXISTS(SELECT 1 FROM task_actual_contributions WHERE task_id = ? AND is_effective = 1) THEN 'DAILY_WORKLOG_EOD' ELSE 'LEGACY_BOOTSTRAP' END,
       CURRENT_TIMESTAMP
     ON CONFLICT(task_id) DO UPDATE SET
       project_id=excluded.project_id, raw_actual_minutes=excluded.raw_actual_minutes,
       approved_actual_minutes=excluded.approved_actual_minutes, current_progress=excluded.current_progress,
       remaining_estimated_minutes=excluded.remaining_estimated_minutes,
       completion_reported=excluded.completion_reported, actual_status=excluded.actual_status,
       last_actual_work_date=excluded.last_actual_work_date, last_effective_worklog_id=excluded.last_effective_worklog_id,
       progress_source=excluded.progress_source, updated_at=CURRENT_TIMESTAMP`
  ).bind(taskId, projectId, taskId, taskId, taskId, taskId, taskId, taskId, taskId, taskId, taskId, taskId);
}

async function worklogResponse(db: any, worklogId: string) {
  const worklog = await db.prepare(`SELECT * FROM daily_worklogs WHERE id = ?`).bind(worklogId).first();
  if (!worklog) throw new WorklogError('INVALID_LOCAL_WORK_DATE', 404, { worklog_id: worklogId });
  const [revisions, entries, audit, corrections] = await Promise.all([
    db.prepare(`SELECT * FROM daily_worklog_revisions WHERE worklog_id = ? ORDER BY revision_number`).bind(worklogId).all(),
    db.prepare(`SELECT e.*,t.task_name,p.name AS project_name
      FROM daily_worklog_entries e
      LEFT JOIN tasks t ON t.id=e.task_id
      LEFT JOIN projects p ON p.id=e.project_id
      WHERE e.worklog_id = ? ORDER BY e.created_at, e.id`).bind(worklogId).all(),
    db.prepare(
      `SELECT a.*, r.revision_number, r.change_type AS revision_change_type
       FROM worklog_audit_events a
       LEFT JOIN daily_worklog_revisions r ON r.id = a.revision_id AND r.worklog_id = a.worklog_id
       WHERE a.worklog_id = ? ORDER BY a.event_time_utc, a.id`
    ).bind(worklogId).all(),
    db.prepare(`SELECT * FROM worklog_correction_requests WHERE worklog_id = ? ORDER BY created_at, id`).bind(worklogId).all(),
  ]);
  const revisionRows = revisions.results || [];
  const { effectiveRevision, effectiveRevisionCount, integrity } = resolveEffectiveRevision(worklog, revisionRows);
  let effectivePayload = null;
  if (effectiveRevision?.payload_snapshot) {
    try { effectivePayload = JSON.parse(effectiveRevision.payload_snapshot); } catch { effectivePayload = null; }
  }
  return {
    ...worklog,
    effective_revision_id: effectiveRevision?.id || null,
    effective_revision_number: effectiveRevision?.revision_number || 0,
    effective_revision_payload: effectivePayload,
    effective_change_type: effectiveRevision?.change_type || null,
    effective_status: worklog.status,
    effective_revision_count: effectiveRevisionCount,
    revision_integrity: integrity,
    revisions: revisionRows,
    entries: entries.results || [],
    audit_events: audit.results || [],
    correction_requests: corrections.results || [],
  };
}

export async function getWorklog(db: any, worklogId: string) { return worklogResponse(db, worklogId); }

export async function getWorklogForActor(db: any, actorContext: ActorContextServer, worklogId: string) {
  const actor = await resolveReadActor(db, actorContext);
  const worklog = await db.prepare(`SELECT employee_id FROM daily_worklogs WHERE id=?`).bind(worklogId).first();
  if (!worklog) throw new WorklogError('INVALID_LOCAL_WORK_DATE', 404, { worklog_id: worklogId });
  if (!canReadSubject(actor, worklog.employee_id)) throw new WorklogError('WORKLOG_PERMISSION_DENIED', 403);
  return worklogResponse(db, worklogId);
}

export async function listWorklogApprovals(db: any, actorContext: ActorContextServer, filters: Record<string, string> = {}) {
  const actor = await requireWorklogApprovalManager(db, actorContext);
  const where = [`w.current_eod_revision_id IS NOT NULL`];
  const params: any[] = [];
  if (filters.status && filters.status !== 'ALL') { where.push('w.approval_status=?'); params.push(filters.status); }
  else where.push(`w.approval_status IN ('PENDING','RETURNED','APPROVED','REJECTED')`);
  if (filters.date) { where.push('w.local_work_date=?'); params.push(filters.date); }
  if (filters.date_from) { where.push('w.local_work_date>=?'); params.push(filters.date_from); }
  if (filters.date_to) { where.push('w.local_work_date<=?'); params.push(filters.date_to); }
  if (filters.employee) { where.push('w.employee_id=?'); params.push(filters.employee); }
  if (filters.project) { where.push(`EXISTS(SELECT 1 FROM daily_worklog_entries pe WHERE pe.worklog_id=w.id AND pe.project_id=?)`); params.push(filters.project); }
  if (actor.worker.access_role !== 'VIEWER') {
    const scoped = await db.prepare(`SELECT 1 AS scoped FROM pilot_employee_supervision WHERE manager_employee_id=? AND is_active=1 LIMIT 1`).bind(actor.worker.id).first();
    if (scoped) {
      where.push(`(w.employee_id=? OR EXISTS(SELECT 1 FROM pilot_employee_supervision s WHERE s.manager_employee_id=? AND s.employee_id=w.employee_id AND s.is_active=1))`);
      params.push(actor.worker.id, actor.worker.id);
    }
  }
  const result = await db.prepare(
    `SELECT w.*, subject.name AS employee_name, subject.country_code AS employee_country,
       r.revision_number AS eod_revision_number,
       (SELECT COUNT(*) FROM daily_worklog_entries e WHERE e.worklog_id=w.id AND e.revision_id=w.current_eod_revision_id) AS entry_count,
       (SELECT COUNT(*) FROM daily_worklog_entries e WHERE e.worklog_id=w.id AND e.revision_id=w.current_eod_revision_id AND e.progress_after IS NOT NULL) AS progress_change_count
     FROM daily_worklogs w
     JOIN workers subject ON subject.id=w.employee_id
     LEFT JOIN daily_worklog_revisions r ON r.id=w.current_eod_revision_id
     WHERE ${where.join(' AND ')}
     ORDER BY CASE w.approval_status WHEN 'PENDING' THEN 0 WHEN 'RETURNED' THEN 1 ELSE 2 END,
       w.local_work_date DESC,w.eod_submitted_at_utc DESC,w.employee_id`
  ).bind(...params).all();
  return result.results || [];
}

export async function getWorklogApprovalDetail(db: any, actorContext: ActorContextServer, worklogId: string) {
  const actor = await requireWorklogApprovalManager(db, actorContext);
  const worklog = await db.prepare(`SELECT employee_id FROM daily_worklogs WHERE id=?`).bind(worklogId).first();
  if (!worklog || !(await canManageWorklogSubject(db, actor, String(worklog.employee_id)))) {
    throw new WorklogError('WORKLOG_APPROVAL_NOT_FOUND', 404);
  }
  return worklogResponse(db, worklogId);
}

export async function reviewWorklogApproval(
  db: any,
  actorContext: ActorContextServer,
  worklogId: string,
  revisionId: string,
  action: WorklogApprovalAction,
  reason: string | undefined,
  key: string,
  now = new Date(),
  shadowEnabled = false,
) {
  const actor = await requireWorklogApprovalManager(db, actorContext);
  if ((action === 'RETURN' || action === 'REJECT') && !String(reason || '').trim()) {
    throw new WorklogError(`${action}_REASON_REQUIRED`, 400);
  }
  const operation = `WORKLOG_APPROVAL_${action}`;
  const body = { worklog_id: worklogId, revision_id: revisionId, action, reason: String(reason || '').trim() };
  const idem = await idempotentResult(db, key, operation, body);
  if (idem.response) return idem.response;
  const worklog = await db.prepare(`SELECT * FROM daily_worklogs WHERE id=?`).bind(worklogId).first();
  if (!worklog || !(await canManageWorklogSubject(db, actor, String(worklog.employee_id)))) {
    throw new WorklogError('WORKLOG_APPROVAL_NOT_FOUND', 404);
  }
  if (String(worklog.current_eod_revision_id) !== revisionId || worklog.approval_status !== 'PENDING') {
    throw new WorklogError('WORKLOG_ALREADY_RESOLVED', 409, { worklog_id: worklogId, revision_id: revisionId });
  }
  const revision = await db.prepare(`SELECT * FROM daily_worklog_revisions WHERE id=? AND worklog_id=?`).bind(revisionId, worklogId).first();
  if (!revision) throw new WorklogError('WORKLOG_APPROVAL_NOT_FOUND', 404);
  const affected = await db.prepare(
    `SELECT DISTINCT task_id,project_id FROM task_actual_contributions
     WHERE worklog_id=? AND (is_effective=1 OR revision_id=?) AND task_id IS NOT NULL`,
  ).bind(worklogId, revisionId).all();
  const targets = collectAggregateRefreshTargets(affected.results || [], affected.results || []);
  const approved = action === 'APPROVE';
  const nextWorklogStatus = action === 'RETURN' ? 'CORRECTION_REQUESTED' : worklog.status;
  const response = {
    worklog_id: worklogId, revision_id: revisionId, action,
    approval_status: approved ? 'APPROVED' : action === 'RETURN' ? 'RETURNED' : 'REJECTED',
    actualUpdated: approved, officialForecastChanged: false,
    shadowRecalculation: shadowEnabled && approved
      ? { requestId: null as string | null, status: 'PENDING', errorCode: null as string | null }
      : { requestId: null as string | null, status: approved ? 'DISABLED' : 'NOT_STARTED', errorCode: null as string | null },
  };
  const nextStatus = response.approval_status;
  const statements: any[] = [
    db.prepare(
      `UPDATE daily_worklogs SET status=?,approval_status=?,approved_revision_id=?,approved_by_employee_id=?,approved_at=?,approval_reason=?,requires_manager_review=0,updated_at=CURRENT_TIMESTAMP
       WHERE id=? AND current_eod_revision_id=? AND approval_status='PENDING'`,
    ).bind(nextWorklogStatus, nextStatus, approved ? revisionId : null, approved ? actor.worker.id : null, approved ? now.toISOString() : null, String(reason || '').trim() || null, worklogId, revisionId),
    db.prepare(
      `UPDATE daily_worklog_revisions SET approval_status=?,approval_action=?,approval_reason=?,approved_by_employee_id=?,approved_at=?
       WHERE id=? AND worklog_id=? AND approval_status='PENDING'`,
    ).bind(nextStatus, action, String(reason || '').trim() || null, approved ? actor.worker.id : null, approved ? now.toISOString() : null, revisionId, worklogId),
    db.prepare(
      `INSERT OR IGNORE INTO worklog_approval_events(id,worklog_id,revision_id,employee_id,work_date,manager_employee_id,action,reason,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(id('wlae'), worklogId, revisionId, worklog.employee_id, worklog.local_work_date, actor.worker.id, action, String(reason || '').trim() || null, now.toISOString()),
    db.prepare(
      `INSERT INTO worklog_audit_events(id,worklog_id,revision_id,event_type,actor_mode,actor_user_id,actor_employee_id,subject_employee_id,local_work_date,event_time_utc,reason,test_session_id,request_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(id('wla'), worklogId, revisionId, `WORKLOG_${action}`, actor.actorMode, actor.actorUserId, actor.worker.id, worklog.employee_id, worklog.local_work_date, now.toISOString(), String(reason || '').trim() || null, actor.testSessionId, key),
  ];
  if (approved) {
    statements.push(
      db.prepare(`UPDATE task_actual_contributions SET is_effective=0 WHERE worklog_id=? AND revision_id<>? AND is_effective=1 AND EXISTS(SELECT 1 FROM daily_worklogs WHERE id=? AND approval_status='APPROVED' AND approved_revision_id=?)`).bind(worklogId, revisionId, worklogId, revisionId),
      db.prepare(`UPDATE task_actual_contributions SET is_effective=1,approved_actual_minutes=raw_actual_minutes WHERE worklog_id=? AND revision_id=? AND EXISTS(SELECT 1 FROM daily_worklogs WHERE id=? AND approval_status='APPROVED' AND approved_revision_id=?)`).bind(worklogId, revisionId, worklogId, revisionId),
      db.prepare(`UPDATE employee_capacity_events SET approval_status='EFFECTIVE' WHERE worklog_id=? AND revision_id=? AND approval_status='PENDING_REVIEW'`).bind(worklogId, revisionId),
    );
    for (const [taskId, projectId] of targets) statements.push(aggregateStatement(db, taskId, projectId));
  }
  statements.push(db.prepare(`INSERT INTO worklog_idempotency_keys (idempotency_key,operation,payload_hash,worklog_id,revision_id,response_json,created_at) VALUES (?,?,?,?,?,?,?)`)
    .bind(key, operation, idem.hash, worklogId, revisionId, stableStringify(response), now.toISOString()));
  const results = await db.batch(statements);
  if (Number(results[0]?.meta?.changes || 0) !== 1) {
    // D1 remote batch metadata may report zero changes even when the batch
    // committed. The idempotency row is the authoritative commit marker; a
    // second request with another key still fails the current-state guard.
    const committed = await db.prepare(`SELECT response_json FROM worklog_idempotency_keys WHERE idempotency_key=? AND operation=?`).bind(key, operation).first();
    if (!committed?.response_json) throw new WorklogError('WORKLOG_ALREADY_RESOLVED', 409, { worklog_id: worklogId, revision_id: revisionId });
  }
  if (shadowEnabled && approved) {
    try {
      const projectIds = [...targets.values()];
      const queued = await enqueueShadowRecalculation(db, {
        worklogId, revisionId, projectId: projectIds.length === 1 ? String(projectIds[0]) : null,
        employeeId: worklog.employee_id, requestedBy: actor.worker.id,
        idempotencyKey: `shadow:approved-worklog:${worklogId}:${revisionId}`,
      });
      const run = await runShadowForActor(db, actor, {
        project_id: projectIds.length === 1 ? String(projectIds[0]) : null,
        source_worklog_id: worklogId,
        source_revision_id: revisionId,
        trigger_type: 'WORKLOG_APPROVAL',
        planning_cutoff_utc: now.toISOString(),
        planning_cutoff_local_date: worklog.local_work_date,
      }, `shadow-run:approved-worklog:${worklogId}:${revisionId}`);
      response.shadowRecalculation = { requestId: queued.requestId, status: run.run?.status || queued.status, errorCode: null };
    } catch (error: any) {
      response.shadowRecalculation = { requestId: null, status: 'FAILED_RETRYABLE', errorCode: error?.code || 'SHADOW_REQUEST_CREATE_FAILED' };
    }
    await db.prepare(`UPDATE worklog_idempotency_keys SET response_json=? WHERE idempotency_key=? AND operation=?`)
      .bind(stableStringify(response), key, operation).run();
  }
  return response;
}

// The recalculation request is asynchronous.  The employee UI needs a
// bounded, read-only status endpoint so a successful EOD never has to infer
// schedule success from the worklog itself.  It deliberately exposes no
// manager action and no Official Forecast mutation path.
export async function getWorklogShadowStatus(db: any, actorContext: ActorContextServer, worklogId: string) {
  const actor = await resolveReadActor(db, actorContext);
  const worklog = await db.prepare(`SELECT id,employee_id,approval_status FROM daily_worklogs WHERE id=?`).bind(worklogId).first();
  if (!worklog) throw new WorklogError('INVALID_LOCAL_WORK_DATE', 404, { worklog_id: worklogId });
  if (!canReadSubject(actor, worklog.employee_id)) throw new WorklogError('WORKLOG_PERMISSION_DENIED', 403);
  if (worklog.approval_status === 'PENDING' || worklog.approval_status === 'RETURNED' || worklog.approval_status === 'REJECTED') {
    return { request: null, run: null, versions: [], impacts: [], officialForecastChanged: false, status: worklog.approval_status === 'PENDING' ? 'PENDING_APPROVAL' : worklog.approval_status };
  }
  const request = await db.prepare(`SELECT * FROM schedule_recalculation_requests WHERE source_worklog_id=? ORDER BY requested_at DESC LIMIT 1`)
    .bind(worklogId).first();
  if (!request) return { request: null, run: null, versions: [], impacts: [], officialForecastChanged: false };
  const run = await db.prepare(`SELECT * FROM schedule_recalculation_runs WHERE request_id=? ORDER BY started_at DESC LIMIT 1`)
    .bind(request.request_id).first();
  if (!run) return { request, run: null, versions: [], impacts: [], officialForecastChanged: false };
  const [versions, impacts] = await Promise.all([
    db.prepare(`SELECT shadow_version_id,project_id,status,approval_classification,shadow_forecast_start_date,shadow_forecast_end_date,official_forecast_start_date,official_forecast_end_date
      FROM shadow_schedule_versions WHERE run_id=? ORDER BY project_id`).bind(run.run_id).all(),
    db.prepare(`SELECT primary_project_id,employee_id,affected_task_count,affected_project_count,cross_project_impact,approval_required,approval_reason_codes_json AS reason_codes_json
      FROM shadow_impact_summaries WHERE run_id=?`).bind(run.run_id).all(),
  ]);
  return {
    request: { request_id: request.request_id, status: request.status, error_code: request.last_error_code || null },
    run: { run_id: run.run_id, status: run.status, error_code: null },
    versions: versions.results || [], impacts: impacts.results || [], officialForecastChanged: false,
  };
}

export async function getWorklogContext(db: any, actorContext: ActorContextServer, employeeId: string, localDate: string) {
  const actor = await resolveReadActor(db, actorContext);
  if (!isValidLocalDate(localDate)) throw new WorklogError('INVALID_LOCAL_WORK_DATE');
  if (!canReadSubject(actor, employeeId)) throw new WorklogError('WORKLOG_PERMISSION_DENIED', 403);
  const capacity = await getDailyCapacity(db, employeeId, localDate);
  const deadline = await getSelfEditDeadline(db, employeeId, localDate);
  const worklogHeader = await db.prepare(`SELECT * FROM daily_worklogs WHERE employee_id = ? AND local_work_date = ?`).bind(employeeId, localDate).first();
  const [subject, worklog] = await Promise.all([
    db.prepare(`SELECT id,name,country_code,ui_language,access_role FROM workers WHERE id=?`).bind(employeeId).first(),
    worklogHeader ? worklogResponse(db, worklogHeader.id) : Promise.resolve(null),
  ]);
  // The employee-facing worklog must be driven by the current Official
  // Forecast, never the original task dates (nor a Shadow candidate).  A
  // temporary primary is also an authorised PRIMARY for its effective dates.
  const tasks = await db.prepare(
    `SELECT DISTINCT t.id AS task_id, t.project_id, t.task_name, t.start_date, t.end_date,
            COALESCE(svt.forecast_start, t.start_date) AS official_forecast_start,
            COALESCE(svt.forecast_end, t.end_date) AS official_forecast_end,
            COALESCE(tpa.id, ta.id) AS assignment_id,
            CASE WHEN tpa.id IS NOT NULL THEN 'PRIMARY' ELSE ta.assignment_role END AS assignment_role,
            p.name AS project_name
     FROM tasks t
     JOIN projects p ON p.id = t.project_id
     LEFT JOIN task_assignees ta ON ta.task_id = t.id AND ta.worker_id = ? AND ta.deleted_at IS NULL
     LEFT JOIN temporary_primary_assignments tpa ON tpa.task_id = t.id
       AND tpa.temporary_primary_employee_id = ? AND tpa.status = 'ACTIVE'
       AND tpa.effective_start_date <= ? AND tpa.effective_end_date >= ?
     LEFT JOIN schedule_version_tasks svt ON svt.task_id = t.id
       AND svt.version_id = (SELECT id FROM schedule_versions WHERE project_id = t.project_id ORDER BY version_number DESC LIMIT 1)
     WHERE (ta.id IS NOT NULL OR tpa.id IS NOT NULL)
       AND (COALESCE(svt.forecast_start, t.start_date) IS NULL OR COALESCE(svt.forecast_start, t.start_date) <= ?)
       AND (COALESCE(svt.forecast_end, t.end_date) IS NULL OR COALESCE(svt.forecast_end, t.end_date) >= ?)
     ORDER BY p.name, t.task_sort_order, t.id`
  ).bind(employeeId, employeeId, localDate, localDate, localDate, localDate).all();
  const eligibleTasks = await db.prepare(
    `SELECT DISTINCT t.id AS task_id, t.project_id, t.task_name, t.start_date, t.end_date,
            COALESCE(svt.forecast_start, t.start_date) AS official_forecast_start,
            COALESCE(svt.forecast_end, t.end_date) AS official_forecast_end,
            COALESCE(tpa.id, ta.id) AS assignment_id,
            CASE WHEN tpa.id IS NOT NULL THEN 'PRIMARY' ELSE ta.assignment_role END AS assignment_role,
            p.name AS project_name
     FROM tasks t
     JOIN projects p ON p.id = t.project_id
     LEFT JOIN task_assignees ta ON ta.task_id = t.id AND ta.worker_id = ? AND ta.deleted_at IS NULL
     LEFT JOIN temporary_primary_assignments tpa ON tpa.task_id = t.id
       AND tpa.temporary_primary_employee_id = ? AND tpa.status = 'ACTIVE'
       AND tpa.effective_start_date <= ? AND tpa.effective_end_date >= ?
     LEFT JOIN schedule_version_tasks svt ON svt.task_id = t.id
       AND svt.version_id = (SELECT id FROM schedule_versions WHERE project_id = t.project_id ORDER BY version_number DESC LIMIT 1)
     WHERE (ta.id IS NOT NULL OR tpa.id IS NOT NULL)
     ORDER BY p.name, t.task_sort_order, t.id`
  ).bind(employeeId, employeeId, localDate, localDate).all();
  const uniqueTaskRows = (rows: any[]) => Array.from(new Map(rows.map((row) => [row.task_id, row])).values());
  const scheduledTaskRows = uniqueTaskRows(tasks.results || []);
  const eligibleTaskRows = uniqueTaskRows(eligibleTasks.results || []);
  return {
    actor: { employee_id: actor.worker.id, name: actor.worker.name, access_role: actor.worker.access_role, is_manager: actor.isManager },
    selected_view_employee_id: actorContext.selectedViewEmployeeId,
    subject: subject ? { id: subject.id, name: subject.name, country_code: subject.country_code, ui_language: subject.ui_language } : null,
    subject_employee_id: employeeId, local_work_date: localDate, capacity, self_edit_deadline_utc: deadline,
    permissions: {
      can_read: actor.worker.id === employeeId || actor.selectedViewEmployeeId === employeeId || actor.worker.access_role === 'VIEWER',
      can_write_self: actor.worker.id === employeeId && actor.worker.access_role === 'EDITOR',
      can_manager_correct: actor.isManager,
      is_read_only: actor.worker.access_role !== 'EDITOR',
    },
    scheduled_tasks: scheduledTaskRows, eligible_tasks: eligibleTaskRows,
    worklog: worklog || { status: 'NOT_CREATED', current_revision_number: 0 },
    checkpoint_notice_code: 'CHECKPOINT2_ACTUAL_CAPACITY_ONLY_FORECAST_UNCHANGED',
  };
}

export async function submitMorning(db: any, actorContext: ActorContextServer, body: any, key: string, now = new Date()) {
  const operation = 'WORKLOG_MORNING';
  const idem = await idempotentResult(db, key, operation, body);
  if (idem.response) return idem.response;
  const actor = await resolveActor(db, actorContext);
  const employeeId = body.employee_id || actor.worker.id;
  requireSubject(actor, employeeId);
  if (!isValidLocalDate(body.local_work_date)) throw new WorklogError('INVALID_LOCAL_WORK_DATE');
  const { policy } = await getPolicyAndWorker(db, employeeId);
  const entries = Array.isArray(body.entries) ? body.entries : [];
  if (entries.length === 0) throw new WorklogError('PRIMARY_PROGRESS_REQUIRED', 400, { reason: 'MORNING_ENTRY_REQUIRED' });
  rejectDuplicateTaskEntries(entries);
  for (const entry of entries) {
    if (!(WORK_CATEGORIES as readonly string[]).includes(entry.work_category)) throw new WorklogError('INVALID_LOCAL_WORK_DATE', 400, { reason: 'INVALID_WORK_CATEGORY' });
    validateEntryAssignmentShape(entry);
    validateIncrement(entry.planned_minutes, 30);
    if (entry.task_id) {
      const assignment = await assignmentForEntry(db, employeeId, body.local_work_date, entry);
      validateMorningAssignmentRole(entry, assignment);
      const actual = await currentTaskActual(db, entry.task_id);
      if (Number(actual.current_progress || 0) >= 100) throw new WorklogError('TASK_ALREADY_COMPLETED', 409, { task_id: entry.task_id });
    }
  }
  const existing = await db.prepare(`SELECT * FROM daily_worklogs WHERE employee_id = ? AND local_work_date = ?`).bind(employeeId, body.local_work_date).first();
  if (existing?.current_morning_revision_id) throw new WorklogError('WORKLOG_ALREADY_EXISTS', 409);
  if (existing?.current_eod_revision_id) throw new WorklogError('WORKLOG_ALREADY_EXISTS', 409, { reason: 'EOD_ALREADY_SUBMITTED' });
  const worklogId = existing?.id || id('wl');
  const revisionNumber = Number(existing?.current_revision_number || 0) + 1;
  const revisionId = id('wlr');
  const auditId = id('wla');
  const late = isMorningLate(now, body.local_work_date, policy.timezone, policy.morning_normal_deadline_local);
  const deadline = await getSelfEditDeadline(db, employeeId, body.local_work_date);
  const response = { worklog_id: worklogId, revision_id: revisionId, revision_number: revisionNumber, status: 'MORNING_SUBMITTED', morning_late: late, morning_missing: false };
  const statements: any[] = [];
  if (existing) statements.push(db.prepare(`UPDATE daily_worklog_revisions SET is_effective=0 WHERE worklog_id=? AND is_effective=1`).bind(worklogId));
  if (existing) {
    statements.push(db.prepare(
      `UPDATE daily_worklogs SET status='MORNING_SUBMITTED', current_revision_number=?, current_morning_revision_id=?,
       morning_submitted_at_utc=?, morning_late=?, self_edit_deadline_utc=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(revisionNumber, revisionId, now.toISOString(), late ? 1 : 0, deadline, worklogId));
  } else {
    statements.push(db.prepare(
      `INSERT INTO daily_worklogs (id,employee_id,local_work_date,office_code,timezone,status,current_revision_number,
       current_morning_revision_id,morning_submitted_at_utc,morning_late,self_edit_deadline_utc,actor_mode,actor_user_id,
       subject_employee_id,test_session_id) VALUES (?,?,?,?,?,'MORNING_SUBMITTED',?,?,?,?,?,?,?,?,?)`
    ).bind(worklogId, employeeId, body.local_work_date, policy.office_code, policy.timezone, revisionNumber, revisionId,
      now.toISOString(), late ? 1 : 0, deadline, actor.actorMode, actor.actorUserId, employeeId, actor.testSessionId));
  }
  statements.push(db.prepare(
    `INSERT INTO daily_worklog_revisions (id,worklog_id,revision_number,phase,previous_revision_id,created_by_employee_id,
     created_at,reason,change_type,payload_snapshot,is_effective,actor_mode,actor_user_id,subject_employee_id,test_session_id,request_fingerprint)
     VALUES (?,?,?,'MORNING',?,?,?,?,'INITIAL_MORNING',?,1,?,?,?,?,?)`
  ).bind(revisionId, worklogId, revisionNumber, existing?.current_morning_revision_id || null, actor.worker.id, now.toISOString(), body.reason || null,
    stableStringify(body), actor.actorMode, actor.actorUserId, employeeId, actor.testSessionId, idem.hash));
  for (const entry of entries) {
    const assignment = entry.task_id ? await assignmentForEntry(db, employeeId, body.local_work_date, entry) : null;
    statements.push(db.prepare(
      `INSERT INTO daily_worklog_entries (id,worklog_id,revision_id,phase,employee_id,project_id,task_id,assignment_id,
       assignment_role,work_category,planned_minutes,target_progress,expected_deliverable,known_blocker,created_at)
       VALUES (?,?,?,'MORNING',?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(id('wle'), worklogId, revisionId, employeeId, entry.project_id || assignment?.task.project_id || null, entry.task_id || null,
      entry.assignment_id || assignment?.assignmentId || null, assignment?.role || null, entry.work_category, Number(entry.planned_minutes),
      entry.target_progress ?? null, entry.expected_deliverable || null, entry.known_blocker || null, now.toISOString()));
  }
  statements.push(db.prepare(
    `INSERT INTO worklog_audit_events (id,worklog_id,revision_id,event_type,actor_mode,actor_user_id,actor_employee_id,
     subject_employee_id,local_work_date,event_time_utc,after_json,reason,test_session_id,request_id)
     VALUES (?,?,?,'MORNING_SUBMITTED',?,?,?,?,?,?,?,?,?,?)`
  ).bind(auditId, worklogId, revisionId, actor.actorMode, actor.actorUserId, actor.worker.id, employeeId, body.local_work_date,
    now.toISOString(), stableStringify(response), body.reason || null, actor.testSessionId, key));
  statements.push(db.prepare(
    `INSERT INTO worklog_idempotency_keys (idempotency_key,operation,payload_hash,worklog_id,revision_id,response_json,created_at)
     VALUES (?,?,?,?,?,?,?)`
  ).bind(key, operation, idem.hash, worklogId, revisionId, stableStringify(response), now.toISOString()));
  try { await db.batch(statements); } catch (error: any) {
    if (String(error?.message || error).includes('UNIQUE')) throw new WorklogError('VERSION_CONFLICT', 409);
    throw error;
  }
  return response;
}

async function validateEodEntries(db: any, employeeId: string, localDate: string, entries: any[], correction: boolean, increment: 15 | 30) {
  const { policy } = await getPolicyAndWorker(db, employeeId);
  validateTimeRanges(entries, policy);
  rejectDuplicateTaskEntries(entries);
  const validated: any[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!(WORK_CATEGORIES as readonly string[]).includes(entry.work_category)) throw new WorklogError('INVALID_LOCAL_WORK_DATE', 400, { entry_index: index, reason: 'INVALID_WORK_CATEGORY' });
    validateEntryAssignmentShape(entry);
    const minutes = validateIncrement(entry.actual_minutes, increment);
    if (OTHER_PROJECT.has(entry.work_category) && (!entry.related_project_id || !entry.reason_source)) {
      throw new WorklogError('WORKLOG_PERMISSION_DENIED', 400, { entry_index: index, reason: 'OTHER_PROJECT_REFERENCE_REQUIRED' });
    }
    if (MEETING_CATEGORIES.has(entry.work_category) && (!entry.meeting_record || !entry.meeting_record.purpose || !entry.meeting_record.local_start_time || !entry.meeting_record.local_end_time)) {
      throw new WorklogError('MEETING_RECORD_REQUIRED', 400, { entry_index: index });
    }
    if (entry.work_category === 'APPROVED_LEAVE' && !entry.leave_link_id) throw new WorklogError('LEAVE_LINK_REQUIRED', 400, { entry_index: index });
    const assignment = entry.task_id ? await assignmentForEntry(db, employeeId, localDate, entry) : null;
    let actual = null;
    if (assignment) {
      actual = await currentTaskActual(db, entry.task_id);
      const progressFieldsSent = PROGRESS_FIELDS.some((field) => entry[field] !== undefined && entry[field] !== null);
      if (assignment.role !== 'PRIMARY' && progressFieldsSent) throw new WorklogError('SUPPORT_PROGRESS_FORBIDDEN', 403, { entry_index: index });
      if (Number(actual.current_progress || 0) >= 100 && !correction) throw new WorklogError('TASK_ALREADY_COMPLETED', 409, { task_id: entry.task_id });
      if (assignment.role === 'PRIMARY') validatePrimaryProgress(entry, Number(actual.current_progress || 0), correction);
    }
    validated.push({ ...entry, actual_minutes: minutes, assignment, progress_before: Number(actual?.current_progress || 0) });
  }
  return { validated, policy };
}

async function submitEodRevision(
  db: any,
  actor: WorklogActor,
  worklog: any,
  body: any,
  key: string,
  now: Date,
  mode: 'INITIAL_EOD'|'SELF_REVISION'|'MANAGER_CORRECTION',
  shadowEnabled = false,
) {
  const operation = mode === 'INITIAL_EOD' ? 'WORKLOG_EOD' : 'WORKLOG_REVISION';
  const idem = await idempotentResult(db, key, operation, body);
  if (idem.response) return idem.response;
  if (mode === 'INITIAL_EOD' && worklog.current_eod_revision_id) throw new WorklogError('WORKLOG_ALREADY_EXISTS', 409);
  const isManager = mode === 'MANAGER_CORRECTION';
  const increment: 15 | 30 = isManager ? 15 : 30;
  const entries = Array.isArray(body.entries) ? body.entries : [];
  if (entries.length === 0) throw new WorklogError('PRIMARY_PROGRESS_REQUIRED', 400, { reason: 'EOD_ENTRY_REQUIRED' });
  const { validated, policy } = await validateEodEntries(db, worklog.employee_id, worklog.local_work_date, entries, isManager, increment);
  const leaveMinutes = validated.filter((entry) => LEAVE_CATEGORIES.has(entry.work_category)).reduce((sum, entry) => sum + entry.actual_minutes, 0);
  const actualMinutes = validated.filter((entry) => !LEAVE_CATEGORIES.has(entry.work_category)).reduce((sum, entry) => sum + entry.actual_minutes, 0);
  const capacityBeforeLeave = await getDailyCapacity(
    db,
    worklog.employee_id,
    worklog.local_work_date,
    mode === 'INITIAL_EOD' ? undefined : worklog.id,
  );
  const effectiveCapacity = capacityBeforeLeave.base_capacity_minutes === 0
    ? 0 : Math.max(0, capacityBeforeLeave.effective_capacity_minutes - leaveMinutes);
  const variance = actualMinutes - effectiveCapacity;
  const hasGap = actualMinutes < effectiveCapacity - 30;
  const overtime = Math.max(0, variance);
  if (hasGap && (!GAP_CODES.has(body.gap_reason_code) || !String(body.gap_reason_text || '').trim())) throw new WorklogError('GAP_REASON_REQUIRED');
  if (overtime > 0 && (!String(body.overtime_reason || '').trim() || !body.overtime_evidence)) throw new WorklogError('OVERTIME_REASON_REQUIRED');
  const revisionMax = await db.prepare(`SELECT id, revision_number FROM daily_worklog_revisions WHERE worklog_id=? ORDER BY revision_number DESC LIMIT 1`).bind(worklog.id).first();
  const latestRevisionNumber = Number(revisionMax?.revision_number || 0);
  const nextRevisionNumber = latestRevisionNumber + 1;
  if (mode !== 'INITIAL_EOD' && Number(body.expected_revision) !== Number(worklog.current_revision_number || 0)) throw new WorklogError('VERSION_CONFLICT', 409);
  const revisionId = id('wlr');
  const previousRevisionId = revisionMax?.id || worklog.current_eod_revision_id || worklog.current_morning_revision_id || null;
  const deadline = worklog.self_edit_deadline_utc || await getSelfEditDeadline(db, worklog.employee_id, worklog.local_work_date);
  const retroactive = mode === 'INITIAL_EOD' && now.getTime() > new Date(deadline).getTime();
  const status = isManager ? 'MANAGER_CORRECTED' : mode === 'SELF_REVISION' ? 'SELF_REVISED' : retroactive ? 'RETROACTIVE_PENDING_REVIEW' : 'EOD_SUBMITTED';
  const approvalStatus = isManager ? 'APPROVED' : 'PENDING';
  const authoritativeNow = approvalStatus === 'APPROVED';
  const selfReview = retroactive || validated.some((entry) => entry.work_category === 'EMERGENCY_LEAVE' || (OTHER_PROJECT.has(entry.work_category) && entry.reason_source === 'SELF_DECISION'));
  const response = {
    worklog_id: worklog.id, revision_id: revisionId, revision_number: nextRevisionNumber, status,
    morning_missing: !worklog.current_morning_revision_id, capacity_minutes: effectiveCapacity,
    actual_recorded_minutes: actualMinutes, capacity_variance_minutes: variance,
    has_gap: hasGap, overtime_candidate_minutes: overtime,
    overtime_approval_status: overtime > 0 ? 'PENDING_REVIEW' : 'NOT_APPLICABLE',
    requires_manager_review: !authoritativeNow || selfReview || hasGap || overtime > 0,
    approval_status: approvalStatus,
    actualUpdated: authoritativeNow,
    officialForecastChanged: false,
    forecast_date_change_count: 0, schedule_adjustment_event_count: 0,
    shadowRecalculation: shadowEnabled
      ? { requestId: null as string | null, status: authoritativeNow ? 'PENDING' : 'PENDING_APPROVAL', errorCode: null as string | null }
      : { requestId: null as string | null, status: 'DISABLED', errorCode: null as string | null },
  };
  const statements: any[] = [];
  statements.push(db.prepare(`UPDATE daily_worklog_revisions SET is_effective=0 WHERE worklog_id=? AND is_effective=1`).bind(worklog.id));
  const previousContributions = mode !== 'INITIAL_EOD' && worklog.current_eod_revision_id
    ? await db.prepare(`SELECT task_id,project_id FROM task_actual_contributions WHERE worklog_id=? AND is_effective=1`).bind(worklog.id).all()
    : { results: [] };
  if (authoritativeNow && mode !== 'INITIAL_EOD' && worklog.current_eod_revision_id) {
    statements.push(db.prepare(`UPDATE task_actual_contributions SET is_effective=0 WHERE worklog_id=? AND is_effective=1`).bind(worklog.id));
    statements.push(db.prepare(`UPDATE employee_capacity_events SET approval_status='SUPERSEDED' WHERE worklog_id=? AND approval_status IN ('EFFECTIVE','APPROVED')`).bind(worklog.id));
  }
  const commonValues = [status, approvalStatus, nextRevisionNumber, revisionId, now.toISOString(), worklog.current_morning_revision_id ? 0 : 1,
    retroactive ? 1 : 0, effectiveCapacity, actualMinutes, variance, hasGap ? body.gap_reason_code : null,
    hasGap ? body.gap_reason_text : null, overtime, overtime > 0 ? 'PENDING_REVIEW' : 'NOT_APPLICABLE', hasGap ? 1 : 0,
    overtime > 0 ? 1 : 0, response.requires_manager_review ? 1 : 0,
    validated.some((entry) => OTHER_PROJECT.has(entry.work_category)) ? 1 : 0,
    validated.some((entry) => entry.work_category === 'COMPANY_DUTY') ? 1 : 0,
    validated.some((entry) => entry.work_category === 'EMERGENCY_LEAVE') ? 1 : 0, deadline];
  if (worklog._isNew) {
    statements.push(db.prepare(
      `INSERT INTO daily_worklogs (id,employee_id,local_work_date,office_code,timezone,status,approval_status,current_revision_number,
       current_eod_revision_id,eod_submitted_at_utc,morning_missing,retroactive_submission,capacity_minutes,
       actual_recorded_minutes,capacity_variance_minutes,gap_reason_code,gap_reason_text,overtime_candidate_minutes,
       overtime_approval_status,has_gap,has_overtime_candidate,requires_manager_review,contains_other_project_work,
       contains_company_duty,contains_emergency_leave,self_edit_deadline_utc,actor_mode,actor_user_id,subject_employee_id,
       test_session_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(worklog.id, worklog.employee_id, worklog.local_work_date, worklog.office_code, worklog.timezone,
      ...commonValues, actor.actorMode, actor.actorUserId, worklog.employee_id, actor.testSessionId));
  } else {
    statements.push(db.prepare(
      `UPDATE daily_worklogs SET status=?,approval_status=?,current_revision_number=?,current_eod_revision_id=?,eod_submitted_at_utc=?,
       morning_missing=?,retroactive_submission=?,capacity_minutes=?,actual_recorded_minutes=?,capacity_variance_minutes=?,
       gap_reason_code=?,gap_reason_text=?,overtime_candidate_minutes=?,overtime_approval_status=?,has_gap=?,
       has_overtime_candidate=?,requires_manager_review=?,contains_other_project_work=?,contains_company_duty=?,
       contains_emergency_leave=?,self_edit_deadline_utc=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(...commonValues, worklog.id));
  }
  statements.push(db.prepare(
    `INSERT INTO daily_worklog_revisions (id,worklog_id,revision_number,phase,previous_revision_id,created_by_employee_id,
     created_at,reason,change_type,payload_snapshot,is_effective,approval_status,actor_mode,actor_user_id,subject_employee_id,test_session_id,request_fingerprint)
     VALUES (?,?,?,'EOD',?,?,?,?,?,?,1,?,?,?,?,?,?)`
  ).bind(revisionId, worklog.id, nextRevisionNumber, previousRevisionId, actor.worker.id, now.toISOString(), body.reason || null,
    mode, stableStringify(body), approvalStatus, actor.actorMode, actor.actorUserId, worklog.employee_id, actor.testSessionId, idem.hash));
  const affectedTasks = collectAggregateRefreshTargets(previousContributions.results || [], []);
  for (const entry of validated) {
    const entryId = id('wle');
    statements.push(db.prepare(
      `INSERT INTO daily_worklog_entries (id,worklog_id,revision_id,phase,employee_id,project_id,task_id,assignment_id,
       assignment_role,work_category,actual_minutes,work_result,deliverable,blocker,progress_before,progress_after,
       remaining_estimated_minutes,completion_reported,exception_reason,related_project_id,related_task_id,reason_source,
       local_start_time,local_end_time,meeting_record_json,attachment_reference,leave_link_id,created_at)
       VALUES (?,?,?,'EOD',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(entryId, worklog.id, revisionId, worklog.employee_id, entry.project_id || entry.assignment?.task.project_id || null,
      entry.task_id || null, entry.assignment_id || entry.assignment?.assignmentId || null, entry.assignment?.role || null,
      entry.work_category, entry.actual_minutes, entry.work_result || null, entry.deliverable || null, entry.blocker || null,
      entry.assignment ? entry.progress_before : null, entry.progress_after ?? null, entry.remaining_estimated_minutes ?? null,
      asBool(entry.completion_reported) ? 1 : 0, entry.exception_reason || null, entry.related_project_id || null,
      entry.related_task_id || null, entry.reason_source || null, entry.local_start_time || null, entry.local_end_time || null,
      entry.meeting_record ? stableStringify(entry.meeting_record) : null, entry.attachment_reference || null,
      entry.leave_link_id || null, now.toISOString()));
    if (entry.assignment) {
      const projectId = entry.assignment.task.project_id;
      for (const [taskId, targetProjectId] of collectAggregateRefreshTargets([], [{ task_id: entry.task_id, project_id: projectId }])) {
        affectedTasks.set(taskId, targetProjectId);
      }
      statements.push(db.prepare(
        `INSERT INTO task_actual_contributions (id,task_id,project_id,employee_id,worklog_id,revision_id,local_work_date,
         assignment_role,raw_actual_minutes,approved_actual_minutes,progress_before,progress_after,remaining_estimated_minutes,
         completion_reported,source_type,is_effective,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'DAILY_WORKLOG_EOD',?,?)`
      ).bind(id('tac'), entry.task_id, projectId, worklog.employee_id, worklog.id, revisionId, worklog.local_work_date,
        entry.assignment.role, entry.actual_minutes, authoritativeNow ? entry.actual_minutes : 0, entry.progress_before,
        entry.assignment.role === 'PRIMARY' ? entry.progress_after : null,
        entry.assignment.role === 'PRIMARY' ? entry.remaining_estimated_minutes : null,
        entry.assignment.role === 'PRIMARY' && asBool(entry.completion_reported) ? 1 : 0, authoritativeNow ? 1 : 0, now.toISOString()));
    }
    if (LEAVE_CATEGORIES.has(entry.work_category) && capacityBeforeLeave.base_capacity_minutes > 0) {
      statements.push(db.prepare(
        `INSERT INTO employee_capacity_events (id,employee_id,local_work_date,event_type,adjustment_minutes,source_type,
         source_reference_id,worklog_id,revision_id,approval_status,requires_manager_review,reason,created_at,actor_mode,actor_user_id,test_session_id)
         VALUES (?,?,?,?,?,?,?,?,?,? ,?,?,?,?,?,?)`
      ).bind(id('cap'), worklog.employee_id, worklog.local_work_date, entry.work_category, -entry.actual_minutes,
        'WORKLOG_ENTRY', entryId, worklog.id, revisionId, authoritativeNow ? 'EFFECTIVE' : 'PENDING_REVIEW', entry.work_category === 'EMERGENCY_LEAVE' ? 1 : 0,
        entry.exception_reason || null, now.toISOString(), actor.actorMode, actor.actorUserId, actor.testSessionId));
    }
  }
  if (overtime > 0) {
    statements.push(db.prepare(
      `INSERT INTO overtime_candidates (id,worklog_id,revision_id,employee_id,local_work_date,raw_actual_minutes,
       effective_capacity_minutes,candidate_minutes,reason,evidence_json,approval_status,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,'PENDING_REVIEW',?)`
    ).bind(id('ot'), worklog.id, revisionId, worklog.employee_id, worklog.local_work_date, actualMinutes, effectiveCapacity,
      overtime, body.overtime_reason, stableStringify(body.overtime_evidence), now.toISOString()));
  }
  statements.push(db.prepare(
    `INSERT INTO worklog_audit_events (id,worklog_id,revision_id,event_type,actor_mode,actor_user_id,actor_employee_id,
     subject_employee_id,local_work_date,event_time_utc,before_json,after_json,reason,test_session_id,request_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(id('wla'), worklog.id, revisionId, mode, actor.actorMode, actor.actorUserId, actor.worker.id, worklog.employee_id,
    worklog.local_work_date, now.toISOString(), mode === 'INITIAL_EOD' ? null : stableStringify(worklog), stableStringify(response),
    body.reason || null, actor.testSessionId, key));
  for (const [taskId, projectId] of affectedTasks) statements.push(aggregateStatement(db, taskId, projectId));
  statements.push(db.prepare(
    `INSERT INTO worklog_idempotency_keys (idempotency_key,operation,payload_hash,worklog_id,revision_id,response_json,created_at)
     VALUES (?,?,?,?,?,?,?)`
  ).bind(key, operation, idem.hash, worklog.id, revisionId, stableStringify(response), now.toISOString()));
  try { await db.batch(statements); } catch (error: any) {
    if (String(error?.message || error).includes('UNIQUE')) throw new WorklogError('VERSION_CONFLICT', 409);
    throw error;
  }
  if (shadowEnabled && authoritativeNow) {
    try {
      const projectIds = [...new Set(validated.map((entry) => entry.project_id || entry.assignment?.task?.project_id).filter(Boolean))];
      const queued = await enqueueShadowRecalculation(db, {
        worklogId: worklog.id,
        revisionId,
        projectId: projectIds.length === 1 ? String(projectIds[0]) : null,
        employeeId: worklog.employee_id,
        requestedBy: actor.worker.id,
        idempotencyKey: `shadow:${worklog.id}:${revisionId}`,
      });
      response.shadowRecalculation = { requestId: queued.requestId, status: queued.status, errorCode: null };
    } catch (error: any) {
      response.shadowRecalculation = {
        requestId: null,
        status: 'FAILED_RETRYABLE',
        errorCode: error?.code || 'SHADOW_REQUEST_CREATE_FAILED',
      };
    }
    await db.prepare(`UPDATE worklog_idempotency_keys SET response_json=? WHERE idempotency_key=? AND operation=?`)
      .bind(stableStringify(response), key, operation)
      .run();
  } else if (shadowEnabled) {
    await db.prepare(`UPDATE worklog_idempotency_keys SET response_json=? WHERE idempotency_key=? AND operation=?`)
      .bind(stableStringify(response), key, operation)
      .run();
  }
  return response;
}

export async function submitEod(db: any, actorContext: ActorContextServer, worklogId: string, body: any, key: string, now = new Date(), shadowEnabled = false) {
  const actor = await resolveActor(db, actorContext);
  const employeeId = body.employee_id || actor.worker.id;
  requireSubject(actor, employeeId);
  if (!isValidLocalDate(body.local_work_date)) throw new WorklogError('INVALID_LOCAL_WORK_DATE');
  let worklog = await db.prepare(`SELECT * FROM daily_worklogs WHERE id = ?`).bind(worklogId).first();
  if (!worklog) worklog = await db.prepare(`SELECT * FROM daily_worklogs WHERE employee_id=? AND local_work_date=?`).bind(employeeId, body.local_work_date).first();
  if (!worklog) {
    const { policy } = await getPolicyAndWorker(db, employeeId);
    const newId = worklogId && worklogId !== 'new' ? worklogId : id('wl');
    const deadline = await getSelfEditDeadline(db, employeeId, body.local_work_date);
    worklog = {
      id: newId, employee_id: employeeId, local_work_date: body.local_work_date,
      office_code: policy.office_code, timezone: policy.timezone, status: 'EOD_DRAFT',
      current_revision_number: 0, current_morning_revision_id: null, current_eod_revision_id: null,
      self_edit_deadline_utc: deadline, _isNew: true,
    };
  }
  return submitEodRevision(db, actor, worklog, body, key, now, 'INITIAL_EOD', shadowEnabled);
}

export async function reviseWorklog(db: any, actorContext: ActorContextServer, worklogId: string, body: any, key: string, now = new Date(), shadowEnabled = false) {
  const replay = await idempotentResult(db, key, 'WORKLOG_REVISION', body);
  if (replay.response) return replay.response;
  const actor = await resolveActor(db, actorContext);
  const worklog = await db.prepare(`SELECT * FROM daily_worklogs WHERE id=?`).bind(worklogId).first();
  if (!worklog?.current_eod_revision_id) throw new WorklogError('INVALID_LOCAL_WORK_DATE', 404, { worklog_id: worklogId });
  requireSubject(actor, worklog.employee_id);
  if (now.getTime() > new Date(worklog.self_edit_deadline_utc).getTime()) throw new WorklogError('RETROACTIVE_REVIEW_REQUIRED', 409);
  return submitEodRevision(db, actor, worklog, body, key, now, 'SELF_REVISION', shadowEnabled);
}

export async function createCorrectionRequest(db: any, actorContext: ActorContextServer, worklogId: string, body: any, key: string, now = new Date()) {
  const operation = 'WORKLOG_CORRECTION_REQUEST';
  const idem = await idempotentResult(db, key, operation, body);
  if (idem.response) return idem.response;
  const actor = await resolveActor(db, actorContext);
  const worklog = await db.prepare(`SELECT * FROM daily_worklogs WHERE id=?`).bind(worklogId).first();
  if (!worklog) throw new WorklogError('INVALID_LOCAL_WORK_DATE', 404);
  requireSubject(actor, worklog.employee_id);
  if (!String(body.reason || '').trim()) throw new WorklogError('RETROACTIVE_REVIEW_REQUIRED');
  const requestId = id('wcr');
  const revisionMax = await db.prepare(`SELECT COALESCE(MAX(revision_number),0) AS max_revision FROM daily_worklog_revisions WHERE worklog_id=?`).bind(worklogId).first();
  const revisionNumber = Number(revisionMax?.max_revision || 0) + 1;
  const revisionId = id('wlr');
  const response = { correction_request_id: requestId, worklog_id: worklogId, status: 'PENDING_REVIEW', revision_number: revisionNumber };
  const statements = [
    db.prepare(`UPDATE daily_worklogs SET status='CORRECTION_REQUESTED',requires_manager_review=1,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(worklogId),
    db.prepare(
      `INSERT INTO daily_worklog_revisions (id,worklog_id,revision_number,phase,previous_revision_id,created_by_employee_id,
       created_at,reason,change_type,payload_snapshot,is_effective,actor_mode,actor_user_id,subject_employee_id,test_session_id,request_fingerprint)
       VALUES (?,?,?,'EOD',?,?,?,?, 'CORRECTION_REQUEST',?,0,?,?,?,?,?)`
    ).bind(revisionId, worklogId, revisionNumber, worklog.current_eod_revision_id, actor.worker.id, now.toISOString(), body.reason,
      stableStringify(body.proposed_payload || {}), actor.actorMode, actor.actorUserId, worklog.employee_id, actor.testSessionId, idem.hash),
    db.prepare(
      `INSERT INTO worklog_correction_requests (id,worklog_id,requested_revision_id,requested_by_employee_id,reason,
       proposed_payload_json,status,created_at,actor_mode,test_session_id) VALUES (?,?,?,?,?,?,'PENDING_REVIEW',?,?,?)`
    ).bind(requestId, worklogId, worklog.current_eod_revision_id, actor.worker.id, body.reason,
      stableStringify(body.proposed_payload || {}), now.toISOString(), actor.actorMode, actor.testSessionId),
    db.prepare(
      `INSERT INTO worklog_audit_events (id,worklog_id,revision_id,event_type,actor_mode,actor_user_id,actor_employee_id,
       subject_employee_id,local_work_date,event_time_utc,after_json,reason,test_session_id,request_id)
       VALUES (?,?,?,'CORRECTION_REQUEST',?,?,?,?,?,?,?,?,?,?)`
    ).bind(id('wla'), worklogId, revisionId, actor.actorMode, actor.actorUserId, actor.worker.id, worklog.employee_id,
      worklog.local_work_date, now.toISOString(), stableStringify(response), body.reason, actor.testSessionId, key),
    db.prepare(`INSERT INTO worklog_idempotency_keys (idempotency_key,operation,payload_hash,worklog_id,revision_id,response_json,created_at) VALUES (?,?,?,?,?,?,?)`)
      .bind(key, operation, idem.hash, worklogId, revisionId, stableStringify(response), now.toISOString()),
  ];
  try { await db.batch(statements); } catch (error: any) {
    if (String(error?.message || error).includes('UNIQUE')) throw new WorklogError('VERSION_CONFLICT', 409);
    throw error;
  }
  return response;
}

export async function reviewCorrectionRequest(
  db: any,
  actorContext: ActorContextServer,
  requestId: string,
  decision: 'APPROVED' | 'REJECTED',
  reason?: string,
  key = `manager-correction:${requestId}:${decision}`,
  now = new Date(),
) {
  const actor = await resolveActor(db, actorContext);
  if (!actor.isManager) throw new WorklogError('WORKLOG_PERMISSION_DENIED', 403);
  const request = await db.prepare(`SELECT * FROM worklog_correction_requests WHERE id=? AND status='PENDING_REVIEW'`).bind(requestId).first();
  if (!request) throw new WorklogError('CORRECTION_REQUEST_NOT_FOUND', 404);
  if (decision === 'REJECTED') {
    if (!String(reason || '').trim()) throw new WorklogError('REJECT_REASON_REQUIRED', 400);
    await db.batch([
      db.prepare(`UPDATE worklog_correction_requests SET status='REJECTED',reviewed_by_employee_id=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING_REVIEW'`).bind(actor.worker.id, requestId),
      db.prepare(`UPDATE daily_worklogs SET status='EOD_SUBMITTED',requires_manager_review=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(request.worklog_id),
      db.prepare(`INSERT INTO worklog_audit_events(id,worklog_id,revision_id,event_type,actor_mode,actor_user_id,actor_employee_id,subject_employee_id,local_work_date,event_time_utc,reason,request_id) SELECT ?,worklog_id,requested_revision_id,'CORRECTION_REJECTED',?,?,?,?,local_work_date,?,?,? FROM daily_worklogs WHERE id=?`).bind(`wla_${crypto.randomUUID()}`, actor.actorMode, actor.actorUserId, actor.worker.id, request.requested_by_employee_id, now.toISOString(), String(reason).trim(), key, request.worklog_id),
    ]);
    return { correction_request_id: requestId, status: 'REJECTED', official_forecast_changed: false };
  }
  const worklog = await db.prepare(`SELECT * FROM daily_worklogs WHERE id=?`).bind(request.worklog_id).first();
  if (!worklog) throw new WorklogError('INVALID_LOCAL_WORK_DATE', 404);
  const proposed = typeof request.proposed_payload_json === 'string' ? JSON.parse(request.proposed_payload_json || '{}') : (request.proposed_payload_json || {});
  const revision = await submitEodRevision(db, actor, worklog, { ...proposed, reason: reason || proposed.reason || 'MANAGER_CORRECTION' }, key, now, 'MANAGER_CORRECTION', true);
  await db.prepare(`UPDATE worklog_correction_requests SET status='APPROVED',reviewed_by_employee_id=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND status='PENDING_REVIEW'`).bind(actor.worker.id, requestId).run();
  return { correction_request_id: requestId, status: 'APPROVED', revision, official_forecast_changed: false };
}

export async function listWorklogs(db: any, actorContext: ActorContextServer, filters: Record<string, string>) {
  const actor = await resolveReadActor(db, actorContext);
  const scopedFilters = { ...filters };
  if (actor.worker.access_role !== 'VIEWER') {
    // The route has already authorized selectedViewEmployeeId against the session
    // actor's supervision relation. A query parameter alone must never confer it.
    const visibleEmployeeId = actor.selectedViewEmployeeId || actor.worker.id;
    if (scopedFilters.employee && scopedFilters.employee !== visibleEmployeeId) throw new WorklogError('WORKLOG_PERMISSION_DENIED', 403);
    scopedFilters.employee = visibleEmployeeId;
  }
  const where: string[] = ['1=1'];
  const params: any[] = [];
  const add = (sql: string, value?: any) => { where.push(sql); if (value !== undefined) params.push(value); };
  if (scopedFilters.employee) add('w.employee_id=?', scopedFilters.employee);
  if (scopedFilters.date_from) add('w.local_work_date>=?', scopedFilters.date_from);
  if (scopedFilters.date_to) add('w.local_work_date<=?', scopedFilters.date_to);
  if (scopedFilters.status) add('w.status=?', scopedFilters.status);
  if (scopedFilters.requires_review === 'true') add('w.requires_manager_review=1');
  if (scopedFilters.project) add(`EXISTS(SELECT 1 FROM daily_worklog_entries e WHERE e.worklog_id=w.id AND e.project_id=?)`, scopedFilters.project);
  const result = await db.prepare(`SELECT w.* FROM daily_worklogs w WHERE ${where.join(' AND ')} ORDER BY w.local_work_date DESC,w.employee_id`).bind(...params).all();
  return result.results || [];
}

export async function getTaskActual(db: any, taskId: string, actorContext?: ActorContextServer) {
  const task = await db.prepare(`SELECT id, project_id FROM tasks WHERE id=?`).bind(taskId).first();
  if (!task) throw new WorklogError('INVALID_LOCAL_WORK_DATE', 404, { task_id: taskId, reason: 'TASK_NOT_FOUND' });
  if (actorContext) {
    const actor = await resolveReadActor(db, actorContext);
    if (actor.worker.access_role !== 'VIEWER') {
      const visibleEmployeeId = actor.selectedViewEmployeeId || actor.worker.id;
      const assignment = await db.prepare(
        `SELECT 1 AS allowed FROM task_assignees WHERE task_id=? AND worker_id=? AND deleted_at IS NULL
         UNION SELECT 1 AS allowed FROM temporary_primary_assignments WHERE task_id=? AND temporary_primary_employee_id=?
           AND status='ACTIVE' LIMIT 1`
      ).bind(taskId, visibleEmployeeId, taskId, visibleEmployeeId).first();
      if (!assignment) throw new WorklogError('WORKLOG_PERMISSION_DENIED', 403, { task_id: taskId });
    }
  }
  const aggregate = await currentTaskActual(db, taskId);
  const contributions = await db.prepare(`SELECT * FROM task_actual_contributions WHERE task_id=? ORDER BY local_work_date,created_at,id`).bind(taskId).all();
  const contributionRows = contributions.results || [];
  const effectiveRows = contributionRows.filter((row: any) => Number(row.is_effective) === 1);
  const pendingRows = contributionRows.filter((row: any) => Number(row.is_effective) !== 1);
  const view = buildTaskActualView(taskId, task.project_id, aggregate, effectiveRows);
  return {
    task_id: taskId,
    ...view,
    contributions: effectiveRows,
    pending_contributions: pendingRows,
    effective_contribution_count: effectiveRows.length,
  };
}
