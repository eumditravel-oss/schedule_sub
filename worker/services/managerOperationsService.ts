import { ActorContextServer } from './v3FoundationService';
import { ShadowScheduleError, enqueueShadowRecalculation } from './shadowScheduleService';

type ManagerActor = { worker: any; canManage: boolean; canRead: boolean };

async function queryStage(stage: string, operation: () => Promise<any>): Promise<any> {
  try { return await operation(); }
  catch { throw new ShadowScheduleError('MANAGER_DASHBOARD_QUERY_FAILED', 500, { stage }); }
}

function json(value: unknown, fallback: any = {}) {
  if (typeof value !== 'string' || !value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

async function resolveManagerActor(db: any, actorContext: ActorContextServer, write = false): Promise<ManagerActor> {
  const id = actorContext.actorEmployeeId;
  const worker = id ? await db.prepare(`SELECT * FROM workers WHERE id=? AND is_active=1`).bind(id).first() : null;
  if (!worker) throw new ShadowScheduleError('MANAGER_PERMISSION_DENIED', 403);
  const canManage = worker.access_role === 'EDITOR' && Number(worker.can_manage_schedule_engine) === 1;
  const canRead = canManage || worker.access_role === 'VIEWER';
  if (!canRead || (write && !canManage)) throw new ShadowScheduleError('MANAGER_PERMISSION_DENIED', 403);
  return { worker, canManage, canRead };
}

function localDate(value?: string | null) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

async function recipients(db: any, projectId?: string | null, employeeId?: string | null) {
  const params: any[] = [];
  const scope: string[] = [`s.enabled=1`, `w.is_active=1`, `w.access_role='EDITOR'`, `w.can_manage_schedule_engine=1`];
  if (projectId) { scope.push(`(s.scope_type IN ('OFFICE','TEAM') OR (s.scope_type='PROJECT' AND s.scope_value=?))`); params.push(projectId); }
  if (employeeId) { scope.push(`(s.scope_type IN ('OFFICE','TEAM') OR (s.scope_type='EMPLOYEE' AND s.scope_value=?))`); params.push(employeeId); }
  const rows = await db.prepare(`SELECT DISTINCT w.id FROM workers w JOIN notification_subscriptions s ON s.recipient_employee_id=w.id WHERE ${scope.join(' AND ')}`).bind(...params).all();
  return (rows.results || []).map((r: any) => r.id);
}

async function visibleEmployeeIds(db: any, actor: ManagerActor): Promise<Set<string> | null> {
  if (actor.worker.access_role === 'VIEWER') return null;
  const supervised = await queryStage('scope.supervision', () => db.prepare(`SELECT employee_id FROM pilot_employee_supervision WHERE manager_employee_id=? AND is_active=1`).bind(actor.worker.id).all());
  const ids = new Set<string>([actor.worker.id, ...(supervised.results || []).map((r: any) => String(r.employee_id))]);
  if ((supervised.results || []).length) return ids;
  const subscriptions = await queryStage('scope.subscriptions', () => db.prepare(`SELECT scope_type,scope_value FROM notification_subscriptions WHERE recipient_employee_id=? AND enabled=1`).bind(actor.worker.id).all());
  for (const subscription of subscriptions.results || []) {
    if (subscription.scope_type === 'EMPLOYEE') ids.add(String(subscription.scope_value));
    if (subscription.scope_type === 'OFFICE') {
      const workers = await queryStage('scope.office', () => db.prepare(`SELECT id FROM workers WHERE is_active=1 AND country_code=?`).bind(subscription.scope_value).all());
      for (const worker of workers.results || []) ids.add(String(worker.id));
    }
  }
  return ids;
}

async function createNotification(db: any, input: any) {
  const ids = await recipients(db, input.project_id, input.employee_id);
  if (!ids.length) return { created: false, recipients: 0 };
  const eventId = `nte_${crypto.randomUUID()}`;
  const event = db.prepare(`INSERT OR IGNORE INTO notification_events
    (event_id,event_type,severity,source_type,source_id,correlation_id,worklog_id,adjustment_id,employee_id,project_id,local_work_date,dedupe_key,payload_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      eventId, input.event_type, input.severity, input.source_type, input.source_id || null,
      input.correlation_id || null, input.worklog_id || null, input.adjustment_id || null,
      input.employee_id || null, input.project_id || null, input.local_work_date || null,
      input.dedupe_key, JSON.stringify(input.payload || {}),
    );
  const rows = ids.map((id: string) => db.prepare(`INSERT OR IGNORE INTO notification_recipients(event_id,recipient_employee_id) VALUES (?,?)`).bind(eventId, id));
  const result = await db.batch([event, ...rows]);
  const inserted = Number(result[0]?.meta?.changes || 0) === 1;
  return { created: inserted, recipients: inserted ? ids.length : 0 };
}

export async function syncManagerNotifications(db: any, options: { localDate?: string } = {}) {
  const date = localDate(options.localDate);
  const summaries = await db.prepare(`SELECT s.*,req.source_worklog_id,req.source_revision_id
    FROM shadow_impact_summaries s JOIN schedule_recalculation_runs r ON r.run_id=s.run_id
    LEFT JOIN schedule_recalculation_requests req ON req.request_id=r.request_id
    WHERE (s.created_at>=? OR req.source_worklog_id IN (SELECT id FROM daily_worklogs WHERE local_work_date=?))
    ORDER BY s.created_at DESC LIMIT 100`).bind(`${date}T00:00:00`, date).all();
  let created = 0;
  for (const row of summaries.results || []) {
    const changed = Number(row.tasks_advanced_count || 0) + Number(row.tasks_delayed_count || 0);
    if (!changed && !Number(row.approval_required) && !Number(row.cross_project_impact)) continue;
    const type = Number(row.cross_project_impact) ? 'CROSS_PROJECT_IMPACT' : Number(row.tasks_delayed_count || 0) ? 'SCHEDULE_DELAYED' : 'SCHEDULE_ADVANCED';
    const result = await createNotification(db, {
      event_type: type, severity: Number(row.approval_required) ? 'ACTION_REQUIRED' : 'INFO', source_type: 'SHADOW_SUMMARY', source_id: row.impact_summary_id,
      correlation_id: row.run_id, worklog_id: row.source_worklog_id, employee_id: row.employee_id, project_id: row.primary_project_id,
      local_work_date: date, dedupe_key: `${type}:${row.source_worklog_id || 'run'}:${row.source_revision_id || 'none'}:${row.run_id}`,
      payload: { affected_task_count: row.affected_task_count, advanced: row.tasks_advanced_count, delayed: row.tasks_delayed_count, project_end_before: row.primary_project_end_before, project_end_after: row.primary_project_end_after, approval_required: row.approval_required },
    });
    if (result.created) created++;
  }
  const [approvals, overtime, corrections] = await Promise.all([
    db.prepare(`SELECT * FROM forecast_approval_requests WHERE status='PENDING' ORDER BY requested_at DESC LIMIT 100`).all(),
    db.prepare(`SELECT * FROM overtime_candidates WHERE approval_status='PENDING_REVIEW' ORDER BY created_at DESC LIMIT 100`).all(),
    db.prepare(`SELECT * FROM worklog_correction_requests WHERE status='PENDING_REVIEW' ORDER BY created_at DESC LIMIT 100`).all(),
  ]);
  for (const row of approvals.results || []) {
    const result = await createNotification(db, { event_type: 'APPROVAL_REQUIRED', severity: 'ACTION_REQUIRED', source_type: 'FORECAST_APPROVAL', source_id: row.approval_request_id, correlation_id: row.shadow_run_id, project_id: row.project_id, dedupe_key: `APPROVAL_REQUIRED:${row.shadow_version_id}`, payload: row });
    if (result.created) created++;
  }
  for (const row of overtime.results || []) {
    const result = await createNotification(db, { event_type: 'OVERTIME_REVIEW_REQUIRED', severity: 'ACTION_REQUIRED', source_type: 'OVERTIME_CANDIDATE', source_id: row.id, worklog_id: row.worklog_id, employee_id: row.employee_id, local_work_date: row.local_work_date, dedupe_key: `OVERTIME_REVIEW_REQUIRED:${row.id}`, payload: row });
    if (result.created) created++;
  }
  for (const row of corrections.results || []) {
    const result = await createNotification(db, { event_type: 'CORRECTION_REQUESTED', severity: 'ACTION_REQUIRED', source_type: 'CORRECTION_REQUEST', source_id: row.id, worklog_id: row.worklog_id, dedupe_key: `CORRECTION_REQUESTED:${row.id}`, payload: row });
    if (result.created) created++;
  }
  return { created, date };
}

export async function getManagerOperations(db: any, actorContext: ActorContextServer, requestedDate?: string) {
  const actor = await resolveManagerActor(db, actorContext);
  const date = localDate(requestedDate);
  const visibleIds = await visibleEmployeeIds(db, actor);
  await queryStage('notifications.sync', () => syncManagerNotifications(db, { localDate: date }));
  const [workers, worklogs, capacities, actuals, shadows, approvals, overtime, corrections, unread] = await Promise.all([
    queryStage('workers', () => db.prepare(`SELECT id,name,country_code,access_role,ui_language FROM workers WHERE is_active=1 ORDER BY sort_order,name`).all()),
    queryStage('worklogs', () => db.prepare(`SELECT * FROM daily_worklogs WHERE local_work_date=?`).bind(date).all()),
    queryStage('capacity', () => db.prepare(`SELECT employee_id,SUM(adjustment_minutes) AS adjustment_minutes FROM employee_capacity_events WHERE local_work_date=? AND approval_status IN ('EFFECTIVE','APPROVED') GROUP BY employee_id`).bind(date).all()),
    queryStage('actuals', () => db.prepare(`SELECT employee_id,SUM(approved_actual_minutes) AS actual_minutes,MAX(progress_after) AS progress FROM task_actual_contributions WHERE local_work_date=? AND is_effective=1 GROUP BY employee_id`).bind(date).all()),
    queryStage('shadow', () => db.prepare(`SELECT st.employee_id,sv.project_id,sv.approval_classification,sv.status,sv.schedule_variance_workdays,sv.shadow_forecast_end_date,sv.official_forecast_end_date
      FROM shadow_schedule_tasks st JOIN shadow_schedule_versions sv ON sv.shadow_version_id=st.shadow_version_id
      WHERE sv.status='CURRENT'`).all()),
    queryStage('approvals', () => db.prepare(`SELECT * FROM forecast_approval_requests WHERE status='PENDING' ORDER BY requested_at DESC`).all()),
    queryStage('overtime', () => db.prepare(`SELECT * FROM overtime_candidates WHERE approval_status='PENDING_REVIEW' ORDER BY created_at DESC`).all()),
    queryStage('corrections', () => db.prepare(`SELECT * FROM worklog_correction_requests WHERE status='PENDING_REVIEW' ORDER BY created_at DESC`).all()),
    queryStage('unread', () => db.prepare(`SELECT COUNT(*) AS count FROM notification_recipients WHERE recipient_employee_id=? AND read_at IS NULL`).bind(actor.worker.id).first()),
  ]);
  const by = (rows: any[], key: string) => new Map((rows || []).map((r: any) => [r[key], r]));
  const wl = by(worklogs.results || [], 'employee_id'); const cap = by(capacities.results || [], 'employee_id'); const actual = by(actuals.results || [], 'employee_id');
  const shadow = by(shadows.results || [], 'employee_id');
  const employees = (workers.results || []).filter((worker: any) => !visibleIds || visibleIds.has(String(worker.id))).map((worker: any) => {
    const w = wl.get(worker.id); const s = shadow.get(worker.id); const a = actual.get(worker.id);
    return { ...worker, capacity_adjustment_minutes: Number(cap.get(worker.id)?.adjustment_minutes || 0), morning: w?.morning_submitted_at_utc ? (Number(w.morning_late) ? 'LATE' : 'COMPLETE') : (Number(w.morning_missing) ? 'MISSING' : 'PENDING'), eod: w?.eod_submitted_at_utc ? 'COMPLETE' : (w?.status ? 'MISSING' : 'PENDING'), actual_minutes: Number(a?.actual_minutes || 0), progress: a?.progress == null ? null : Number(a.progress), shadow_status: s?.status || 'NO_SHADOW', schedule_variance_workdays: Number(s?.schedule_variance_workdays || 0), approval_required: s?.approval_classification === 'APPROVAL_REQUIRED' || Number(w?.requires_manager_review || 0) === 1 };
  });
  const count = (field: string, value: string) => employees.filter((e: any) => e[field] === value).length;
  return { scope: { actor_employee_id: actor.worker.id, office: actor.worker.country_code, can_manage: actor.canManage, read_only: !actor.canManage }, local_date: date, employees, worklogSummary: { employee_count: employees.length, morning_complete: count('morning','COMPLETE'), morning_late: count('morning','LATE'), morning_missing: count('morning','MISSING'), eod_complete: count('eod','COMPLETE'), eod_missing: count('eod','MISSING') }, scheduleSummary: { advanced: employees.filter((e: any) => e.schedule_variance_workdays < 0).length, delayed: employees.filter((e: any) => e.schedule_variance_workdays > 0).length, blocked: employees.filter((e: any) => e.shadow_status === 'BLOCKED').length }, approvalSummary: { pending: (approvals.results || []).length, overtime: (overtime.results || []).length, corrections: (corrections.results || []).length }, notifications: { unread: Number(unread?.count || 0) }, approvals: approvals.results || [], overtime: overtime.results || [], corrections: corrections.results || [] };
}

export async function listManagerNotifications(db: any, actorContext: ActorContextServer, filters: any = {}) {
  const actor = await resolveManagerActor(db, actorContext);
  const where = ['nr.recipient_employee_id=?']; const params: any[] = [actor.worker.id];
  if (filters.unread === 'true' || filters.unread === true) where.push('nr.read_at IS NULL');
  if (filters.severity) { where.push('ne.severity=?'); params.push(filters.severity); }
  if (filters.event_type) { where.push('ne.event_type=?'); params.push(filters.event_type); }
  const rows = await db.prepare(`SELECT ne.*,nr.read_at,nr.acknowledged_at FROM notification_events ne JOIN notification_recipients nr ON nr.event_id=ne.event_id WHERE ${where.join(' AND ')} ORDER BY ne.created_at DESC LIMIT 200`).bind(...params).all();
  return { notifications: (rows.results || []).map((r: any) => ({ ...r, payload: json(r.payload_json) })) };
}

export async function markManagerNotificationRead(db: any, actorContext: ActorContextServer, eventId: string, all = false) {
  const actor = await resolveManagerActor(db, actorContext, true);
  if (all) await db.prepare(`UPDATE notification_recipients SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE recipient_employee_id=?`).bind(actor.worker.id).run();
  else await db.prepare(`UPDATE notification_recipients SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE event_id=? AND recipient_employee_id=?`).bind(eventId, actor.worker.id).run();
  return { marked: all ? 'all' : eventId };
}

export async function reviewOvertime(db: any, actorContext: ActorContextServer, candidateId: string, status: 'APPROVED'|'REJECTED', reason?: string) {
  const actor = await resolveManagerActor(db, actorContext, true);
  if (!reason?.trim() && status === 'REJECTED') throw new ShadowScheduleError('REJECT_REASON_REQUIRED', 400);
  const candidate = await db.prepare(`SELECT * FROM overtime_candidates WHERE id=? AND approval_status='PENDING_REVIEW'`).bind(candidateId).first();
  if (!candidate) throw new ShadowScheduleError('OVERTIME_NOT_FOUND', 404);
  await db.batch([
    db.prepare(`UPDATE overtime_candidates SET approval_status=?,reviewed_by_employee_id=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=? AND approval_status='PENDING_REVIEW'`).bind(status, actor.worker.id, candidateId),
    db.prepare(`UPDATE daily_worklogs SET overtime_approval_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status, candidate.worklog_id),
    db.prepare(`INSERT INTO worklog_audit_events(id,worklog_id,revision_id,event_type,actor_mode,actor_user_id,actor_employee_id,subject_employee_id,local_work_date,event_time_utc,reason) SELECT ?,worklog_id,revision_id,?, 'PILOT',?,?,employee_id,local_work_date,CURRENT_TIMESTAMP,? FROM overtime_candidates WHERE id=?`).bind(`wla_${crypto.randomUUID()}`, `OVERTIME_${status}`, actor.worker.id, actor.worker.id, reason || null, candidateId),
  ]);
  try {
    await enqueueShadowRecalculation(db, {
      worklogId: candidate.worklog_id,
      revisionId: candidate.revision_id,
      projectId: null,
      employeeId: candidate.employee_id,
      requestedBy: actor.worker.id,
      idempotencyKey: `manager-overtime:${candidateId}:${status}`,
    });
  } catch (error: any) {
    if (error?.code !== 'IDEMPOTENCY_CONFLICT') throw error;
  }
  return { candidate_id: candidateId, status, official_forecast_changed: false };
}

export async function getManagerDigest(db: any, actorContext: ActorContextServer, date?: string) {
  const snapshot = await getManagerOperations(db, actorContext, date);
  return { local_date: snapshot.local_date, scope: snapshot.scope, worklog: snapshot.worklogSummary, schedule: snapshot.scheduleSummary, approvals: snapshot.approvalSummary, notifications: snapshot.notifications, projects: [] };
}

export async function listManagerHistory(db: any, actorContext: ActorContextServer, projectId?: string) {
  await resolveManagerActor(db, actorContext);
  const [adjustments, forecasts] = await Promise.all([
    projectId ? db.prepare(`SELECT * FROM schedule_adjustment_events WHERE project_id=? ORDER BY created_at DESC LIMIT 200`).bind(projectId).all() : db.prepare(`SELECT * FROM schedule_adjustment_events ORDER BY created_at DESC LIMIT 200`).all(),
    projectId ? db.prepare(`SELECT * FROM schedule_versions WHERE project_id=? ORDER BY version_number DESC`).bind(projectId).all() : db.prepare(`SELECT * FROM schedule_versions ORDER BY created_at DESC LIMIT 200`).all(),
  ]);
  return { adjustments: adjustments.results || [], forecasts: forecasts.results || [] };
}
