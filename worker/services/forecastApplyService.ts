import { ActorContextServer } from './v3FoundationService';
import { ShadowScheduleError, idempotentShadowMutation, officialDataFingerprint } from './shadowScheduleService';
import { canonicalJson, isValidIsoLocalDate, isValidUtcTimestamp, sha256Hex } from './shadowScheduleEngine';

type ForecastActor = {
  worker: any;
  isManager: boolean;
  actorMode: string;
  actorUserId: string | null;
  testSessionId: string | null;
};

type ForecastFlags = {
  officialApplyEnabled: boolean;
  approvalEnabled: boolean;
  restoreEnabled: boolean;
  autoApplyEnabled: boolean;
};

type ApplyMode = 'DIRECT' | 'APPROVE';

const uuid = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

async function resolveActor(db: any, actorContext: ActorContextServer, write = false): Promise<ForecastActor> {
  const id = actorContext.actorEmployeeId;
  if (!id) throw new ShadowScheduleError('APPROVAL_PERMISSION_DENIED', 403);
  const worker = await db.prepare(`SELECT * FROM workers WHERE id=? AND is_active=1`).bind(id).first();
  if (!worker || (write && worker.access_role !== 'EDITOR')) throw new ShadowScheduleError('APPROVAL_PERMISSION_DENIED', 403);
  return {
    worker,
    isManager: worker.access_role === 'EDITOR' && Number(worker.can_manage_schedule_engine) === 1,
    actorMode: actorContext.actorMode,
    actorUserId: actorContext.actorUserId,
    testSessionId: actorContext.testSessionId,
  };
}

function requireManager(actor: ForecastActor, code = 'APPROVAL_PERMISSION_DENIED') {
  if (!actor.isManager) throw new ShadowScheduleError(code, 403);
}

function requireFlag(enabled: boolean, code: string) {
  if (!enabled) throw new ShadowScheduleError(code, 503);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function latestByProject(rows: any[]): Map<string, any> {
  const result = new Map<string, any>();
  for (const row of rows) {
    const current = result.get(row.project_id);
    if (!current || Number(row.version_number) > Number(current.version_number)) result.set(row.project_id, row);
  }
  return result;
}

function applicationStatus(value: any): string {
  return value?.apply_status || 'NOT_APPLIED';
}

function normalizeForecastDbError(error: unknown): never {
  const message = String((error as any)?.message || error);
  for (const code of ['FORECAST_VERSION_CONFLICT', 'SHADOW_AUTHORITY_STALE', 'SHADOW_STALE', 'OFFICIAL_FORECAST_HISTORY_PROTECTED']) {
    if (message.includes(code)) throw new ShadowScheduleError(code, 409);
  }
  throw error;
}

async function loadShadowBundle(db: any, shadowVersionId: string) {
  const version = await db.prepare(`
    SELECT sv.*,sr.input_fingerprint,sr.official_data_before_hash,sr.authority_revision,
           sr.run_id,sr.status AS run_status,req.source_worklog_id,req.source_revision_id,
           sr.data_confidence AS run_confidence
    FROM shadow_schedule_versions sv
    JOIN schedule_recalculation_runs sr ON sr.run_id=sv.run_id
    JOIN schedule_recalculation_requests req ON req.request_id=sr.request_id
    WHERE sv.shadow_version_id=?1
  `).bind(shadowVersionId).first();
  if (!version) throw new ShadowScheduleError('SHADOW_NOT_FOUND', 404);
  const [runVersions, tasks, application, approval] = await Promise.all([
    db.prepare(`SELECT * FROM shadow_schedule_versions WHERE run_id=? ORDER BY project_id`).bind(version.run_id).all(),
    db.prepare(`SELECT st.*,t.project_id FROM shadow_schedule_tasks st JOIN tasks t ON t.id=st.task_id
      WHERE st.shadow_version_id=? ORDER BY t.project_id,t.id`).bind(shadowVersionId).all(),
    db.prepare(`SELECT * FROM shadow_forecast_applications WHERE shadow_version_id=?`).bind(shadowVersionId).first(),
    db.prepare(`SELECT * FROM forecast_approval_requests WHERE shadow_version_id=?`).bind(shadowVersionId).first(),
  ]);
  return {
    version,
    runVersions: runVersions.results || [],
    tasks: tasks.results || [],
    application,
    approval,
  };
}

async function currentAuthority(db: any) {
  const row = await db.prepare(`SELECT revision FROM shadow_schedule_authority_guard WHERE guard_id='GLOBAL'`).first();
  if (!row) throw new ShadowScheduleError('SHADOW_AUTHORITY_STALE', 409);
  return Number(row.revision);
}

async function currentVersions(db: any, projectIds: string[]) {
  if (!projectIds.length) return new Map<string, any>();
  const placeholders = projectIds.map(() => '?').join(',');
  const rows = await db.prepare(`SELECT * FROM schedule_versions WHERE project_id IN (${placeholders}) ORDER BY project_id,version_number`)
    .bind(...projectIds).all();
  return latestByProject(rows.results || []);
}

async function staleShadowAndEnqueue(
  db: any,
  bundle: Awaited<ReturnType<typeof loadShadowBundle>>,
  reason: 'SHADOW_AUTHORITY_STALE' | 'SHADOW_INPUT_CHANGED',
) {
  const now = new Date().toISOString();
  const idempotencyKey = `forecast-stale:${bundle.version.run_id}:${reason}`;
  const requestShape = {
    triggerType: 'FORECAST_CANDIDATE_STALE', runId: bundle.version.run_id,
    projectId: bundle.version.project_id, sourceWorklogId: bundle.version.source_worklog_id || null,
    sourceRevisionId: bundle.version.source_revision_id || null, reason,
  };
  const requestFingerprint = await sha256Hex(canonicalJson(requestShape));
  await db.batch([
    db.prepare(`UPDATE shadow_schedule_versions SET status='STALE'
      WHERE run_id=?1 AND status IN ('CURRENT','BLOCKED') AND COALESCE(apply_status,'NOT_APPLIED')='NOT_APPLIED'`)
      .bind(bundle.version.run_id),
    db.prepare(`UPDATE forecast_approval_requests SET status='STALE',updated_at=?2
      WHERE shadow_run_id=?1 AND status='PENDING'`).bind(bundle.version.run_id, now),
    db.prepare(`INSERT OR IGNORE INTO schedule_recalculation_requests
      (request_id,trigger_type,source_worklog_id,source_revision_id,project_id,employee_id,requested_by,requested_at,
       idempotency_key,request_fingerprint,status,attempt_count)
      VALUES (?1,'FORECAST_CANDIDATE_STALE',?2,?3,?4,NULL,'FORECAST_STALE_GUARD',?5,?6,?7,'PENDING',0)`)
      .bind(uuid('srr'), bundle.version.source_worklog_id || null, bundle.version.source_revision_id || null,
        bundle.version.project_id, now, idempotencyKey, requestFingerprint),
  ]);
}

async function assertFreshShadow(db: any, bundle: Awaited<ReturnType<typeof loadShadowBundle>>, requireApproval: boolean) {
  const version = bundle.version;
  if (bundle.application || applicationStatus(version) === 'APPLIED') throw new ShadowScheduleError('SHADOW_ALREADY_APPLIED', 409);
  if (applicationStatus(version) === 'REJECTED') throw new ShadowScheduleError('APPROVAL_ALREADY_DECIDED', 409);
  if (version.status !== 'CURRENT' || version.run_status !== 'COMPLETED') throw new ShadowScheduleError('SHADOW_STALE', 409);
  if (version.approval_classification === 'BLOCKED' || version.data_confidence === 'BLOCKED') throw new ShadowScheduleError('SHADOW_BLOCKED', 409);
  if (requireApproval && version.approval_classification !== 'APPROVAL_REQUIRED') {
    throw new ShadowScheduleError('APPROVAL_ALREADY_DECIDED', 409, { reason: 'SHADOW_DOES_NOT_REQUIRE_APPROVAL' });
  }
  const revision = await currentAuthority(db);
  if (revision !== Number(version.authority_revision)) {
    await staleShadowAndEnqueue(db, bundle, 'SHADOW_AUTHORITY_STALE');
    throw new ShadowScheduleError('SHADOW_AUTHORITY_STALE', 409);
  }
  const fingerprint = await officialDataFingerprint(db);
  if (fingerprint !== version.official_data_before_hash) {
    await staleShadowAndEnqueue(db, bundle, 'SHADOW_INPUT_CHANGED');
    throw new ShadowScheduleError('SHADOW_INPUT_CHANGED', 409);
  }
}

function restoreConstraintDate(constraint: any): string | null {
  if (constraint.constraint_timestamp_utc) {
    if (!isValidUtcTimestamp(String(constraint.constraint_timestamp_utc))) {
      throw new ShadowScheduleError('RESTORE_TARGET_INVALID', 409, { taskId: constraint.task_id, constraint: constraint.constraint_type, reason: 'INVALID_CONSTRAINT_TIMESTAMP' });
    }
    // Forecast snapshots deliberately preserve dates rather than work-time
    // instants.  An active UTC constraint is therefore not provable during a
    // historical restore (especially after an effective Temporary Primary
    // changes the calendar/timezone).  Failing closed is the only way to
    // avoid re-applying an incompatible official schedule.
    throw new ShadowScheduleError('RESTORE_TARGET_INVALID', 409, {
      taskId: constraint.task_id, constraint: constraint.constraint_type,
      reason: 'TIMESTAMP_CONSTRAINT_PRECISION_UNPROVABLE',
    });
  }
  if (!constraint.constraint_date) return null;
  if (!isValidIsoLocalDate(String(constraint.constraint_date))) {
    throw new ShadowScheduleError('RESTORE_TARGET_INVALID', 409, { taskId: constraint.task_id, constraint: constraint.constraint_type, reason: 'INVALID_CONSTRAINT_DATE' });
  }
  return String(constraint.constraint_date);
}

function assertRestoreConstraint(constraint: any, targetTask: any) {
  const constraintDate = restoreConstraintDate(constraint);
  if (!constraintDate || constraint.constraint_type === 'AS_SOON_AS_POSSIBLE') return;
  const fail = () => { throw new ShadowScheduleError('RESTORE_TARGET_INVALID', 409, { taskId: targetTask.task_id, constraint: constraint.constraint_type, constraintDate }); };
  if (constraint.constraint_type === 'FIXED_START' && targetTask.forecast_start !== constraintDate) fail();
  if (constraint.constraint_type === 'FIXED_END' && (!targetTask.forecast_end || targetTask.forecast_end > constraintDate)) fail();
  if (constraint.constraint_type === 'NOT_BEFORE' && (!targetTask.forecast_start || targetTask.forecast_start < constraintDate)) fail();
  if (constraint.constraint_type === 'MILESTONE' && (targetTask.forecast_start !== constraintDate || targetTask.forecast_end !== constraintDate)) fail();
}

async function targetVersionsForApply(db: any, bundle: Awaited<ReturnType<typeof loadShadowBundle>>, mode: ApplyMode) {
  const crossProject = Number((await db.prepare(`SELECT cross_project_impact FROM shadow_impact_summaries WHERE run_id=?`).bind(bundle.version.run_id).first())?.cross_project_impact || 0) === 1;
  const ids = crossProject ? bundle.runVersions.map((item: any) => item.shadow_version_id) : [bundle.version.shadow_version_id];
  const versions: any[] = [];
  for (const id of ids) {
    const item = id === bundle.version.shadow_version_id ? bundle : await loadShadowBundle(db, id);
    // A cross-project run is approved as one correlation.  The selected
    // version must require approval, but sibling versions can legitimately
    // be classified AUTO_APPLY_ELIGIBLE while still being part of the same
    // mandatory cross-project approval transaction.
    await assertFreshShadow(db, item, mode === 'APPROVE' && id === bundle.version.shadow_version_id);
    if (mode === 'DIRECT' && item.version.approval_classification !== 'AUTO_APPLY_ELIGIBLE') {
      throw new ShadowScheduleError('APPROVAL_REQUIRED', 409, { shadowVersionId: id });
    }
    versions.push(item);
  }
  return versions.sort((a, b) => String(a.version.project_id).localeCompare(String(b.version.project_id)));
}

async function shadowVersionsForCorrelation(db: any, bundle: Awaited<ReturnType<typeof loadShadowBundle>>) {
  const crossProject = Number((await db.prepare(`SELECT cross_project_impact FROM shadow_impact_summaries WHERE run_id=?`).bind(bundle.version.run_id).first())?.cross_project_impact || 0) === 1;
  const ids = crossProject ? bundle.runVersions.map((item: any) => item.shadow_version_id) : [bundle.version.shadow_version_id];
  const versions = await Promise.all(ids.map((id: string) => id === bundle.version.shadow_version_id ? bundle : loadShadowBundle(db, id)));
  return versions.sort((a, b) => String(a.version.project_id).localeCompare(String(b.version.project_id)));
}

async function latestTaskSnapshots(db: any, projectId: string, versionId: string) {
  const rows = await db.prepare(`SELECT * FROM schedule_version_tasks WHERE project_id=? AND version_id=? ORDER BY task_id`)
    .bind(projectId, versionId).all();
  return new Map((rows.results || []).map((row: any) => [row.task_id, row]));
}

async function projectTasks(db: any, projectId: string) {
  const rows = await db.prepare(`SELECT id,task_group_id,start_date,end_date FROM tasks WHERE project_id=? ORDER BY task_sort_order,id`)
    .bind(projectId).all();
  return rows.results || [];
}

async function assertNoActiveProjectWorklogConflict(db: any, projectId: string) {
  // Restore is intentionally conservative: an unfinalized worklog that is
  // already tied to this project must be resolved before an historical
  // Forecast can be reintroduced.  EOD-effective facts remain immutable and
  // do not block a Forecast-only restore.
  const conflict = await db.prepare(`
    SELECT w.id,w.status,w.local_work_date
    FROM daily_worklogs w
    JOIN daily_worklog_entries e ON e.worklog_id=w.id
    JOIN daily_worklog_revisions r ON r.id=e.revision_id AND r.is_effective=1
    WHERE e.project_id=?1
      AND w.status IN ('MORNING_SUBMITTED','CORRECTION_REQUESTED','RETROACTIVE_PENDING_REVIEW')
    ORDER BY w.local_work_date DESC LIMIT 1
  `).bind(projectId).first();
  if (conflict) {
    throw new ShadowScheduleError('RESTORE_TARGET_INVALID', 409, {
      reason: 'ACTIVE_WORKLOG_CONFLICT', worklogId: conflict.id, worklogStatus: conflict.status,
    });
  }
}

function applicationResponse(input: { correlationId: string; sourceShadowVersionId: string; versions: any[]; classification: string; approvalStatus: string }) {
  return {
    correlation_id: input.correlationId,
    source_shadow_version_id: input.sourceShadowVersionId,
    classification: input.classification,
    approval_status: input.approvalStatus,
    applied: true,
    official_versions: input.versions.map((version) => ({
      project_id: version.project_id,
      forecast_version_id: version.forecast_version_id,
      version_number: version.version_number,
      project_forecast_start: version.project_forecast_start,
      project_forecast_end: version.project_forecast_end,
      adjustment_id: version.adjustment_id,
    })),
  };
}

async function applyShadowAtomically(
  db: any,
  actor: ForecastActor,
  sourceShadowVersionId: string,
  mode: ApplyMode,
  commit: any,
) {
  const source = await loadShadowBundle(db, sourceShadowVersionId);
  // Replay with a different idempotency key must identify the immutable
  // applied Shadow before any newer Official Version is considered.
  await assertFreshShadow(db, source, mode === 'APPROVE');
  // Report a changed Official Forecast as its own deterministic conflict
  // before checking the more general Authority revision.  The write trigger
  // remains the final concurrent CAS guard for this exact same condition.
  const correlationVersions = await shadowVersionsForCorrelation(db, source);
  const projectIds = correlationVersions.map((item) => item.version.project_id);
  const currentByProject = await currentVersions(db, projectIds);
  for (const item of correlationVersions) {
    const current = currentByProject.get(item.version.project_id);
    if (!current || current.id !== item.version.based_on_forecast_version_id) {
      await staleShadowAndEnqueue(db, source, 'SHADOW_INPUT_CHANGED');
      throw new ShadowScheduleError(correlationVersions.length > 1 ? 'CROSS_PROJECT_FORECAST_CONFLICT' : 'FORECAST_VERSION_CONFLICT', 409);
    }
  }
  const targets = await targetVersionsForApply(db, source, mode);
  const authorityRevision = await currentAuthority(db);
  const guardToken = uuid('fag');
  const correlationId = uuid('fcor');
  const now = new Date().toISOString();
  const planned: any[] = [];

  for (const item of targets) {
    const shadow = item.version;
    const current = currentByProject.get(shadow.project_id);
    if (!current || current.id !== shadow.based_on_forecast_version_id) {
      await staleShadowAndEnqueue(db, source, 'SHADOW_INPUT_CHANGED');
      throw new ShadowScheduleError(targets.length > 1 ? 'CROSS_PROJECT_FORECAST_CONFLICT' : 'FORECAST_VERSION_CONFLICT', 409);
    }
    const forecastVersionId = uuid('ofv');
    const adjustmentId = uuid('sae');
    planned.push({ item, current, forecastVersionId, adjustmentId, versionNumber: Number(current.version_number) + 1 });
  }

  const response = applicationResponse({
    correlationId,
    sourceShadowVersionId,
    classification: source.version.approval_classification,
    approvalStatus: mode === 'APPROVE' ? 'APPROVED' : 'AUTO_APPLIED',
    versions: planned.map((entry) => ({
      project_id: entry.item.version.project_id, forecast_version_id: entry.forecastVersionId,
      version_number: entry.versionNumber, project_forecast_start: entry.item.version.shadow_forecast_start_date,
      project_forecast_end: entry.item.version.shadow_forecast_end_date, adjustment_id: entry.adjustmentId,
    })),
  });
  const statements: any[] = [
    db.prepare(`UPDATE shadow_schedule_authority_guard SET lock_token=?1,updated_at=CURRENT_TIMESTAMP
      WHERE guard_id='GLOBAL' AND revision=?2`).bind(guardToken, authorityRevision),
  ];

  // Insert every Version before the task snapshots. schedule_version_tasks also advance authority revision,
  // so each Version carries the revision expected at its precise point in this atomic batch.
  for (let index = 0; index < planned.length; index += 1) {
    const entry = planned[index];
    const shadow = entry.item.version;
    statements.push(db.prepare(`INSERT INTO schedule_versions (
      id,project_id,baseline_id,version_number,based_on_version_id,source_type,status,
      project_forecast_start,project_forecast_end,change_summary,schema_version,created_at,created_by,
      actor_mode,actor_user_id,subject_employee_id,test_session_id,source_shadow_version_id,source_shadow_run_id,
      source_worklog_id,source_revision_id,source_adjustment_id,approved_by,approved_at,restores_version_id,
      authority_revision,input_fingerprint,apply_guard_token
    ) VALUES (?1,?2,?3,?4,?5,?6,'APPLIED',?7,?8,?9,'V3_CHECKPOINT_3B',?10,?11,?12,?13,NULL,?14,?15,?16,?17,?18,?19,?20,?21,NULL,?22,?23,?24)`)
      .bind(
        entry.forecastVersionId, shadow.project_id, entry.current.baseline_id || null, entry.versionNumber, entry.current.id,
        mode === 'APPROVE' ? 'SHADOW_APPROVED' : 'SHADOW_AUTO_APPLY',
        shadow.shadow_forecast_start_date, shadow.shadow_forecast_end_date,
        `Checkpoint 3B ${mode === 'APPROVE' ? 'approved' : 'controlled'} Shadow apply from ${shadow.shadow_version_id}`,
        now, actor.worker.id, actor.actorMode, actor.actorUserId, actor.testSessionId,
        shadow.shadow_version_id, shadow.run_id, shadow.source_worklog_id || null, shadow.source_revision_id || null,
        entry.adjustmentId, mode === 'APPROVE' ? actor.worker.id : null, mode === 'APPROVE' ? now : null,
        authorityRevision + index, shadow.input_fingerprint, guardToken,
      ));
  }

  for (const entry of planned) {
    const shadow = entry.item.version;
    const [currentTasks, projectTaskRows] = await Promise.all([
      latestTaskSnapshots(db, shadow.project_id, entry.current.id), projectTasks(db, shadow.project_id),
    ]);
    const shadowTasks = new Map<string, any>((await db.prepare(`SELECT * FROM shadow_schedule_tasks WHERE shadow_version_id=? ORDER BY task_id`)
      .bind(shadow.shadow_version_id).all()).results?.map((row: any) => [row.task_id, row]) || []);
    for (const task of projectTaskRows) {
      const sourceTask: any = currentTasks.get(task.id) || {};
      const calculated = shadowTasks.get(task.id);
      statements.push(db.prepare(`INSERT INTO schedule_version_tasks (
        id,version_id,project_id,task_id,task_group_id,forecast_start,forecast_end,planned_effort_minutes,
        effort_status,primary_assignment_json,support_assignments_json,original_raw_json,created_at
      ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)`)
        .bind(
          uuid('ofvt'), entry.forecastVersionId, shadow.project_id, task.id,
          sourceTask.task_group_id || task.task_group_id || null,
          calculated?.shadow_start ?? sourceTask.forecast_start ?? task.start_date ?? null,
          calculated?.shadow_end ?? sourceTask.forecast_end ?? task.end_date ?? null,
          sourceTask.planned_effort_minutes ?? null, sourceTask.effort_status || 'PROPOSED',
          sourceTask.primary_assignment_json || null, sourceTask.support_assignments_json || null,
          sourceTask.original_raw_json || null, now,
        ));
    }
    const impactRows = (await db.prepare(`SELECT * FROM shadow_schedule_tasks WHERE shadow_version_id=? ORDER BY task_id`)
      .bind(shadow.shadow_version_id).all()).results || [];
    statements.push(db.prepare(`INSERT INTO schedule_adjustment_events (
      adjustment_id,correlation_id,project_id,employee_id,source_worklog_id,source_revision_id,source_shadow_run_id,
      source_shadow_version_id,forecast_version_before,forecast_version_after,project_end_before,project_end_after,
      delta_workdays,classification,approval_status,reason_codes_json,affected_task_count,affected_project_count,
      cross_project,created_by,created_at,applied_by,applied_at
    ) VALUES (?1,?2,?3,NULL,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22)`)
      .bind(
        entry.adjustmentId, correlationId, shadow.project_id, shadow.source_worklog_id || null, shadow.source_revision_id || null,
        shadow.run_id, shadow.shadow_version_id, entry.current.id, entry.forecastVersionId,
        entry.current.project_forecast_end, shadow.shadow_forecast_end_date,
        Number(shadow.schedule_variance_workdays || 0), shadow.approval_classification,
        mode === 'APPROVE' ? 'APPROVED' : 'AUTO_APPLIED', shadow.approval_reasons_json || '[]',
        impactRows.length, planned.length, planned.length > 1 ? 1 : 0, actor.worker.id, now, actor.worker.id, now,
      ));
    for (const task of impactRows) {
      statements.push(db.prepare(`INSERT INTO schedule_adjustment_impacts (
        adjustment_impact_id,adjustment_id,project_id,task_id,employee_id,forecast_start_before,forecast_start_after,
        forecast_end_before,forecast_end_after,delta_start_workdays,delta_end_workdays,reason_codes_json,constraint_result,dependency_result,created_at
      ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)`)
        .bind(uuid('sai'), entry.adjustmentId, shadow.project_id, task.task_id, task.employee_id || null,
          task.official_forecast_start, task.shadow_start, task.official_forecast_end, task.shadow_end,
          Number(task.delta_start_workdays || 0), Number(task.delta_end_workdays || 0),
          task.impact_reason_codes_json || '[]', task.constraint_result || null, task.dependency_result || null, now));
    }
    statements.push(db.prepare(`INSERT INTO shadow_forecast_applications
      (application_id,shadow_version_id,shadow_run_id,correlation_id,status,adjustment_id,official_version_id,applied_by,applied_at)
      VALUES (?1,?2,?3,?4,'APPLIED',?5,?6,?7,?8)`)
      .bind(uuid('sfa'), shadow.shadow_version_id, shadow.run_id, correlationId, entry.adjustmentId, entry.forecastVersionId, actor.worker.id, now));
    statements.push(db.prepare(`UPDATE shadow_schedule_versions SET apply_status='APPLIED',applied_at=?1,applied_forecast_version_id=?2
      WHERE shadow_version_id=?3 AND status='CURRENT' AND COALESCE(apply_status,'NOT_APPLIED')='NOT_APPLIED'`)
      .bind(now, entry.forecastVersionId, shadow.shadow_version_id));
    if (mode === 'APPROVE') {
      statements.push(db.prepare(`INSERT INTO forecast_approval_requests
        (approval_request_id,shadow_version_id,shadow_run_id,project_id,status,requested_by,requested_at,decided_by,decided_at,decision_reason,applied_adjustment_id,created_at,updated_at)
        VALUES (?1,?2,?3,?4,'APPLIED',?5,?6,?5,?6,'APPROVED_AND_APPLIED',?7,?6,?6)
        ON CONFLICT(shadow_version_id) DO UPDATE SET status='APPLIED',decided_by=excluded.decided_by,decided_at=excluded.decided_at,
          decision_reason=excluded.decision_reason,applied_adjustment_id=excluded.applied_adjustment_id,updated_at=excluded.updated_at
        WHERE forecast_approval_requests.status='PENDING'`)
        .bind(uuid('far'), shadow.shadow_version_id, shadow.run_id, shadow.project_id, actor.worker.id, now, entry.adjustmentId));
    }
    statements.push(db.prepare(`INSERT INTO shadow_engine_audit_events
      (audit_id,event_type,entity_type,entity_id,actor_employee_id,actor_mode,event_time_utc,before_json,after_json,reason,test_session_id,request_id)
      VALUES (?1,?2,'OFFICIAL_FORECAST_VERSION',?3,?4,?5,?6,?7,?8,?9,?10,NULL)`)
      .bind(uuid('sea'), mode === 'APPROVE' ? 'FORECAST_APPROVED_APPLIED' : 'FORECAST_CONTROLLED_APPLIED', entry.forecastVersionId,
        actor.worker.id, actor.actorMode, now,
        canonicalJson({ official_version_id: entry.current.id, project_forecast_end: entry.current.project_forecast_end }),
        canonicalJson({ official_version_id: entry.forecastVersionId, project_forecast_end: shadow.shadow_forecast_end_date, shadow_version_id: shadow.shadow_version_id }),
        shadow.approval_reasons_json || null, actor.testSessionId));
  }
  statements.push(commit(response));
  let results: any[];
  try {
    results = await db.batch(statements);
  } catch (error) {
    const message = String((error as any)?.message || error);
    if (message.includes('FORECAST_VERSION_CONFLICT') || message.includes('SHADOW_AUTHORITY_STALE')) {
      // A check-then-append race has invalidated this calculation. The failed
      // D1 batch is already atomic; persist the stale lifecycle separately.
      await staleShadowAndEnqueue(db, source, 'SHADOW_INPUT_CHANGED');
    }
    normalizeForecastDbError(error);
  }
  if (Number(results[0]?.meta?.changes || 0) !== 1 || Number(results.at(-1)?.meta?.changes || 0) !== 1) {
    await staleShadowAndEnqueue(db, source, 'SHADOW_AUTHORITY_STALE');
    throw new ShadowScheduleError('SHADOW_AUTHORITY_STALE', 409);
  }
  return response;
}

export async function applyShadowForecast(
  db: any, actorContext: ActorContextServer, shadowVersionId: string, idempotencyKey: string, flags: ForecastFlags,
) {
  requireFlag(flags.officialApplyEnabled, 'OFFICIAL_APPLY_DISABLED');
  const actor = await resolveActor(db, actorContext, true);
  requireManager(actor);
  return idempotentShadowMutation(db, idempotencyKey, 'FORECAST_APPLY', { shadowVersionId, mode: 'DIRECT' },
    (commit) => applyShadowAtomically(db, actor, shadowVersionId, 'DIRECT', commit));
}

export async function approveShadowForecast(
  db: any, actorContext: ActorContextServer, shadowVersionId: string, idempotencyKey: string, flags: ForecastFlags,
) {
  requireFlag(flags.officialApplyEnabled, 'OFFICIAL_APPLY_DISABLED');
  requireFlag(flags.approvalEnabled, 'APPROVAL_DISABLED');
  const actor = await resolveActor(db, actorContext, true);
  requireManager(actor);
  return idempotentShadowMutation(db, idempotencyKey, 'FORECAST_APPROVE', { shadowVersionId, mode: 'APPROVE' },
    (commit) => applyShadowAtomically(db, actor, shadowVersionId, 'APPROVE', commit));
}

export async function rejectShadowForecast(
  db: any, actorContext: ActorContextServer, shadowVersionId: string, reason: string, idempotencyKey: string, flags: ForecastFlags,
) {
  requireFlag(flags.officialApplyEnabled, 'OFFICIAL_APPLY_DISABLED');
  requireFlag(flags.approvalEnabled, 'APPROVAL_DISABLED');
  if (!reason?.trim()) throw new ShadowScheduleError('REJECT_REASON_REQUIRED', 400);
  const actor = await resolveActor(db, actorContext, true);
  requireManager(actor);
  return idempotentShadowMutation(db, idempotencyKey, 'FORECAST_REJECT', { shadowVersionId, reason: reason.trim() }, async (commit) => {
    const bundle = await loadShadowBundle(db, shadowVersionId);
    await assertFreshShadow(db, bundle, true);
    // A cross-project Shadow is one all-or-none correlation for application.
    // Rejecting only its selected project would leave the sibling candidate
    // visible even though it could never be approved independently. Close all
    // affected project candidates in the same atomic decision instead.
    const targets = await shadowVersionsForCorrelation(db, bundle);
    for (const target of targets) await assertFreshShadow(db, target, target.version.shadow_version_id === shadowVersionId);
    const now = new Date().toISOString();
    const response = {
      shadow_version_id: shadowVersionId,
      rejected_shadow_version_ids: targets.map((target) => target.version.shadow_version_id),
      status: 'REJECTED', official_forecast_changed: false,
    };
    const statements: any[] = [];
    for (const target of targets) {
      const targetShadow = target.version;
      statements.push(
        db.prepare(`INSERT INTO forecast_approval_requests
        (approval_request_id,shadow_version_id,shadow_run_id,project_id,status,requested_by,requested_at,decided_by,decided_at,decision_reason,created_at,updated_at)
        VALUES (?1,?2,?3,?4,'REJECTED',?5,?6,?5,?6,?7,?6,?6)
        ON CONFLICT(shadow_version_id) DO UPDATE SET status='REJECTED',decided_by=excluded.decided_by,decided_at=excluded.decided_at,
          decision_reason=excluded.decision_reason,updated_at=excluded.updated_at
        WHERE forecast_approval_requests.status='PENDING'`)
          .bind(uuid('far'), targetShadow.shadow_version_id, targetShadow.run_id, targetShadow.project_id, actor.worker.id, now, reason.trim()),
        db.prepare(`UPDATE shadow_schedule_versions SET apply_status='REJECTED' WHERE shadow_version_id=?1
          AND status='CURRENT' AND COALESCE(apply_status,'NOT_APPLIED')='NOT_APPLIED'`).bind(targetShadow.shadow_version_id),
        db.prepare(`INSERT INTO shadow_engine_audit_events
        (audit_id,event_type,entity_type,entity_id,actor_employee_id,actor_mode,event_time_utc,before_json,after_json,reason,test_session_id,request_id)
        VALUES (?1,'FORECAST_APPROVAL_REJECTED','SHADOW_VERSION',?2,?3,?4,?5,NULL,?6,?7,?8,NULL)`)
          .bind(uuid('sea'), targetShadow.shadow_version_id, actor.worker.id, actor.actorMode, now, canonicalJson(response), reason.trim(), actor.testSessionId),
      );
    }
    statements.push(commit(response));
    const results = await db.batch(statements);
    if (results.some((result: any) => Number(result?.meta?.changes || 0) !== 1)) throw new ShadowScheduleError('APPROVAL_ALREADY_DECIDED', 409);
    return response;
  });
}

export async function getCurrentForecast(db: any, actorContext: ActorContextServer, projectId: string) {
  await resolveActor(db, actorContext);
  const [versions, shadow, staleShadow, adjustment] = await Promise.all([
    db.prepare(`SELECT * FROM schedule_versions WHERE project_id=? ORDER BY version_number DESC LIMIT 1`).bind(projectId).first(),
    // A candidate is current only when its persisted run still has the
    // current authority revision and the exact Forecast it was based on.
    // This mirrors the write-side CAS guard so the management UI never
    // presents a stale candidate as executable.
    db.prepare(`SELECT sv.*,sr.engine_version,sr.authority_revision AS run_authority_revision,
        req.source_worklog_id,req.source_revision_id,
        (SELECT json_group_array(constraint_result) FROM (
          SELECT DISTINCT COALESCE(st.constraint_result,'NONE') AS constraint_result
          FROM shadow_schedule_tasks st WHERE st.shadow_version_id=sv.shadow_version_id
          ORDER BY constraint_result
        )) AS constraint_results_json
      FROM shadow_schedule_versions sv
      JOIN schedule_recalculation_runs sr ON sr.run_id=sv.run_id
      JOIN schedule_recalculation_requests req ON req.request_id=sr.request_id
      WHERE sv.project_id=?1 AND sv.status='CURRENT' AND COALESCE(sv.apply_status,'NOT_APPLIED')='NOT_APPLIED'
        AND sr.status='COMPLETED'
        AND sr.authority_revision=(SELECT revision FROM shadow_schedule_authority_guard WHERE guard_id='GLOBAL')
        AND sv.based_on_forecast_version_id=(SELECT id FROM schedule_versions WHERE project_id=sv.project_id ORDER BY version_number DESC LIMIT 1)
      ORDER BY sv.shadow_version_number DESC LIMIT 1`).bind(projectId).first(),
    db.prepare(`SELECT sv.shadow_version_id,sv.run_id,sv.project_id,sv.shadow_version_number,
        sv.approval_classification,sv.apply_status,sv.status,sr.engine_version,
        sr.authority_revision AS run_authority_revision,
        (SELECT revision FROM shadow_schedule_authority_guard WHERE guard_id='GLOBAL') AS current_authority_revision,
        req.source_worklog_id,req.source_revision_id
      FROM shadow_schedule_versions sv
      JOIN schedule_recalculation_runs sr ON sr.run_id=sv.run_id
      JOIN schedule_recalculation_requests req ON req.request_id=sr.request_id
      WHERE sv.project_id=?1 AND sv.status IN ('CURRENT','STALE') AND COALESCE(sv.apply_status,'NOT_APPLIED')='NOT_APPLIED'
        AND (sv.status='STALE' OR sr.status<>'COMPLETED'
          OR sr.authority_revision<>(SELECT revision FROM shadow_schedule_authority_guard WHERE guard_id='GLOBAL')
          OR sv.based_on_forecast_version_id IS NOT (SELECT id FROM schedule_versions WHERE project_id=sv.project_id ORDER BY version_number DESC LIMIT 1))
      ORDER BY sv.shadow_version_number DESC LIMIT 1`).bind(projectId).first(),
    db.prepare(`SELECT * FROM schedule_adjustment_events WHERE project_id=? ORDER BY created_at DESC LIMIT 1`).bind(projectId).first(),
  ]);
  const approval = shadow
    ? await db.prepare(`SELECT * FROM forecast_approval_requests WHERE shadow_version_id=?`).bind(shadow.shadow_version_id).first()
    : null;
  return {
    official_forecast: versions || null,
    shadow_version: shadow || null,
    stale_shadow_version: staleShadow ? { ...staleShadow, status: 'STALE', stale_reason: 'SHADOW_AUTHORITY_STALE' } : null,
    approval_request: approval || null,
    latest_adjustment: adjustment || null,
  };
}

export async function getForecastHistory(db: any, actorContext: ActorContextServer, projectId: string) {
  await resolveActor(db, actorContext);
  const [versions, adjustments, approvals] = await Promise.all([
    db.prepare(`SELECT * FROM schedule_versions WHERE project_id=? ORDER BY version_number DESC`).bind(projectId).all(),
    db.prepare(`SELECT * FROM schedule_adjustment_events WHERE project_id=? ORDER BY created_at DESC`).bind(projectId).all(),
    db.prepare(`SELECT * FROM forecast_approval_requests WHERE project_id=? ORDER BY requested_at DESC`).bind(projectId).all(),
  ]);
  return { versions: versions.results || [], adjustments: adjustments.results || [], approvals: approvals.results || [] };
}

export async function getScheduleAdjustments(db: any, actorContext: ActorContextServer, adjustmentId?: string | null) {
  await resolveActor(db, actorContext);
  if (adjustmentId) {
    const [adjustment, impacts] = await Promise.all([
      db.prepare(`SELECT * FROM schedule_adjustment_events WHERE adjustment_id=?`).bind(adjustmentId).first(),
      db.prepare(`SELECT * FROM schedule_adjustment_impacts WHERE adjustment_id=? ORDER BY task_id`).bind(adjustmentId).all(),
    ]);
    if (!adjustment) throw new ShadowScheduleError('SHADOW_NOT_FOUND', 404);
    return { adjustment, impacts: impacts.results || [] };
  }
  const rows = await db.prepare(`SELECT * FROM schedule_adjustment_events ORDER BY created_at DESC LIMIT 200`).all();
  return { adjustments: rows.results || [] };
}

export async function getRestorePreview(db: any, actorContext: ActorContextServer, projectId: string, targetVersionId: string) {
  await resolveActor(db, actorContext);
  const [current, target] = await Promise.all([
    db.prepare(`SELECT * FROM schedule_versions WHERE project_id=? ORDER BY version_number DESC LIMIT 1`).bind(projectId).first(),
    db.prepare(`SELECT * FROM schedule_versions WHERE project_id=? AND id=?`).bind(projectId, targetVersionId).first(),
  ]);
  if (!target) throw new ShadowScheduleError('RESTORE_VERSION_NOT_FOUND', 404);
  if (!current) throw new ShadowScheduleError('RESTORE_TARGET_INVALID', 409);
  const [currentTasks, targetTasks] = await Promise.all([
    db.prepare(`SELECT * FROM schedule_version_tasks WHERE version_id=? ORDER BY task_id`).bind(current.id).all(),
    db.prepare(`SELECT * FROM schedule_version_tasks WHERE version_id=? ORDER BY task_id`).bind(target.id).all(),
  ]);
  const currentMap = new Map((currentTasks.results || []).map((item: any) => [item.task_id, item]));
  const diffs = (targetTasks.results || []).map((item: any) => {
    const before: any = currentMap.get(item.task_id) || {};
    return {
      task_id: item.task_id, forecast_start_before: before.forecast_start || null, forecast_start_after: item.forecast_start || null,
      forecast_end_before: before.forecast_end || null, forecast_end_after: item.forecast_end || null,
    };
  });
  return { current_version: current, target_version: target, project_end_before: current.project_forecast_end,
    project_end_after: target.project_forecast_end, diffs };
}

export async function restoreForecastVersion(
  db: any, actorContext: ActorContextServer, projectId: string, targetVersionId: string, input: any, idempotencyKey: string, flags: ForecastFlags,
) {
  requireFlag(flags.officialApplyEnabled, 'OFFICIAL_APPLY_DISABLED');
  requireFlag(flags.restoreEnabled, 'RESTORE_DISABLED');
  const actor = await resolveActor(db, actorContext, true);
  requireManager(actor, 'RESTORE_PERMISSION_DENIED');
  return idempotentShadowMutation(db, idempotencyKey, 'FORECAST_RESTORE', { projectId, targetVersionId, expectedVersionId: input?.expected_version_id || null }, async (commit) => {
    const preview = await getRestorePreview(db, actorContext, projectId, targetVersionId);
    if (input?.expected_version_id && input.expected_version_id !== preview.current_version.id) throw new ShadowScheduleError('FORECAST_VERSION_CONFLICT', 409);
    await assertNoActiveProjectWorklogConflict(db, projectId);
    const authorityRevision = await currentAuthority(db);
    const [constraints, currentFingerprint] = await Promise.all([
      db.prepare(`SELECT c.*,t.project_id
        FROM task_constraints c
        JOIN tasks t ON t.id=c.task_id
        WHERE t.project_id=? AND c.status='ACTIVE'`).bind(projectId).all(),
      officialDataFingerprint(db),
    ]);
    const targetTasks = await db.prepare(`SELECT * FROM schedule_version_tasks WHERE version_id=? ORDER BY task_id`).bind(targetVersionId).all();
    const targetByTask = new Map((targetTasks.results || []).map((item: any) => [item.task_id, item]));
    for (const constraint of constraints.results || []) {
      const task: any = targetByTask.get(constraint.task_id);
      if (!task) throw new ShadowScheduleError('RESTORE_TARGET_INVALID', 409);
      assertRestoreConstraint(constraint, task);
    }
    const now = new Date().toISOString();
    const guardToken = uuid('frg');
    const versionId = uuid('ofv');
    const adjustmentId = uuid('sae');
    const versionNumber = Number(preview.current_version.version_number) + 1;
    const response = {
      project_id: projectId, restored_version_id: targetVersionId, forecast_version_id: versionId,
      version_number: versionNumber, project_forecast_start: preview.target_version.project_forecast_start,
      project_forecast_end: preview.target_version.project_forecast_end, adjustment_id: adjustmentId, restored: true,
    };
    const statements: any[] = [
      db.prepare(`UPDATE shadow_schedule_authority_guard SET lock_token=?1,updated_at=CURRENT_TIMESTAMP WHERE guard_id='GLOBAL' AND revision=?2`)
        .bind(guardToken, authorityRevision),
      db.prepare(`INSERT INTO schedule_versions (
        id,project_id,baseline_id,version_number,based_on_version_id,source_type,status,project_forecast_start,project_forecast_end,
        change_summary,schema_version,created_at,created_by,actor_mode,actor_user_id,subject_employee_id,test_session_id,
        source_adjustment_id,approved_by,approved_at,restores_version_id,authority_revision,input_fingerprint,apply_guard_token
      ) VALUES (?1,?2,?3,?4,?5,'MANAGER_RESTORE','APPLIED',?6,?7,?8,'V3_CHECKPOINT_3B',?9,?10,?11,?12,NULL,?13,?14,?10,?9,?15,?16,?17,?18)`)
        .bind(versionId, projectId, preview.current_version.baseline_id || null, versionNumber, preview.current_version.id,
          preview.target_version.project_forecast_start, preview.target_version.project_forecast_end,
          `Checkpoint 3B restore of Forecast Version ${preview.target_version.version_number}`,
          now, actor.worker.id, actor.actorMode, actor.actorUserId, actor.testSessionId,
          adjustmentId, targetVersionId, authorityRevision, currentFingerprint, guardToken),
    ];
    for (const task of targetTasks.results || []) {
      statements.push(db.prepare(`INSERT INTO schedule_version_tasks
        (id,version_id,project_id,task_id,task_group_id,forecast_start,forecast_end,planned_effort_minutes,effort_status,primary_assignment_json,support_assignments_json,original_raw_json,created_at)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)`)
        .bind(uuid('ofvt'), versionId, projectId, task.task_id, task.task_group_id || null, task.forecast_start, task.forecast_end,
          task.planned_effort_minutes || null, task.effort_status || 'PROPOSED', task.primary_assignment_json || null,
          task.support_assignments_json || null, task.original_raw_json || null, now));
    }
    statements.push(db.prepare(`INSERT INTO schedule_adjustment_events
      (adjustment_id,correlation_id,project_id,forecast_version_before,forecast_version_after,project_end_before,project_end_after,
       delta_workdays,classification,approval_status,reason_codes_json,affected_task_count,affected_project_count,cross_project,created_by,created_at,applied_by,applied_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,0,'APPROVAL_REQUIRED','RESTORED','["MANAGER_RESTORE"]',?8,1,0,?9,?10,?9,?10)`)
      .bind(adjustmentId, uuid('fcor'), projectId, preview.current_version.id, versionId,
        preview.current_version.project_forecast_end, preview.target_version.project_forecast_end,
        (targetTasks.results || []).length, actor.worker.id, now));
    for (const diff of preview.diffs) {
      statements.push(db.prepare(`INSERT INTO schedule_adjustment_impacts
        (adjustment_impact_id,adjustment_id,project_id,task_id,forecast_start_before,forecast_start_after,forecast_end_before,forecast_end_after,delta_start_workdays,delta_end_workdays,reason_codes_json,created_at)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,0,0,'["MANAGER_RESTORE"]',?9)`)
        .bind(uuid('sai'), adjustmentId, projectId, diff.task_id, diff.forecast_start_before, diff.forecast_start_after,
          diff.forecast_end_before, diff.forecast_end_after, now));
    }
    statements.push(db.prepare(`INSERT INTO shadow_engine_audit_events
      (audit_id,event_type,entity_type,entity_id,actor_employee_id,actor_mode,event_time_utc,before_json,after_json,reason,test_session_id,request_id)
      VALUES (?1,'FORECAST_VERSION_RESTORED','OFFICIAL_FORECAST_VERSION',?2,?3,?4,?5,?6,?7,'MANAGER_RESTORE',?8,NULL)`)
      .bind(uuid('sea'), versionId, actor.worker.id, actor.actorMode, now,
        canonicalJson({ version_id: preview.current_version.id, end: preview.current_version.project_forecast_end }),
        canonicalJson(response), actor.testSessionId));
    statements.push(commit(response));
    let results: any[];
    try {
      results = await db.batch(statements);
    } catch (error) {
      normalizeForecastDbError(error);
    }
    if (Number(results[0]?.meta?.changes || 0) !== 1 || Number(results.at(-1)?.meta?.changes || 0) !== 1) {
      throw new ShadowScheduleError('SHADOW_AUTHORITY_STALE', 409);
    }
    return response;
  });
}

export function forecastFeatureFlags(env: any): ForecastFlags {
  return {
    officialApplyEnabled: String(env.DYNAMIC_SCHEDULER_OFFICIAL_APPLY_ENABLED) === 'true',
    autoApplyEnabled: String(env.DYNAMIC_SCHEDULER_AUTO_APPLY_ENABLED) === 'true',
    approvalEnabled: String(env.DYNAMIC_SCHEDULER_APPROVAL_ENABLED) === 'true',
    restoreEnabled: String(env.DYNAMIC_SCHEDULER_RESTORE_ENABLED) === 'true',
  };
}
