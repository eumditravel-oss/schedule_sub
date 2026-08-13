import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getPlatformProxy, type PlatformProxy } from 'wrangler';
import {
  applyShadowForecast,
  approveShadowForecast,
  getCurrentForecast,
  rejectShadowForecast,
  restoreForecastVersion,
} from '../worker/services/forecastApplyService';
import { getCurrentProjectShadow, officialDataFingerprint } from '../worker/services/shadowScheduleService';

const persistPath = process.env.FORECAST_LOCAL_D1_PERSIST_TO;
const configPath = process.env.FORECAST_LOCAL_WRANGLER_CONFIG;
const enabled = Boolean(persistPath && configPath);

const managerActor = {
  actorMode: 'TEST_SELECTOR' as const,
  actorUserId: 'manager', actorEmployeeId: 'manager', selectedViewEmployeeId: 'manager',
  testSessionId: 'CHECKPOINT3B_LOCAL_D1',
};
const executiveActor = { ...managerActor, actorUserId: 'executive', actorEmployeeId: 'executive', selectedViewEmployeeId: 'executive' };
const supportActor = { ...managerActor, actorUserId: 'support', actorEmployeeId: 'support', selectedViewEmployeeId: 'support' };
const flags = { officialApplyEnabled: true, autoApplyEnabled: false, approvalEnabled: true, restoreEnabled: true };

const schema = `
CREATE TABLE workers (id TEXT PRIMARY KEY,name TEXT,is_active INTEGER,access_role TEXT,can_manage_schedule_engine INTEGER);
CREATE TABLE projects (id TEXT PRIMARY KEY,name TEXT,start_date TEXT,end_date TEXT,progress REAL,status TEXT);
CREATE TABLE tasks (id TEXT PRIMARY KEY,project_id TEXT,task_group_id TEXT,start_date TEXT,end_date TEXT,task_sort_order INTEGER,task_name TEXT);
CREATE TABLE project_baselines (id TEXT PRIMARY KEY,project_id TEXT,version INTEGER,baseline_start_date TEXT,baseline_end_date TEXT,created_at TEXT);
CREATE TABLE task_baselines (id TEXT PRIMARY KEY,baseline_id TEXT,task_id TEXT,baseline_start_date TEXT,baseline_end_date TEXT,baseline_progress REAL,effort_status TEXT,proposed_effort_minutes INTEGER);
CREATE TABLE schedule_versions (
 id TEXT PRIMARY KEY,project_id TEXT,baseline_id TEXT,version_number INTEGER,based_on_version_id TEXT,source_type TEXT,status TEXT,
 project_forecast_start TEXT,project_forecast_end TEXT,change_summary TEXT,schema_version TEXT,created_at TEXT,created_by TEXT,
 actor_mode TEXT,actor_user_id TEXT,subject_employee_id TEXT,test_session_id TEXT,
 source_shadow_version_id TEXT,source_shadow_run_id TEXT,source_worklog_id TEXT,source_revision_id TEXT,source_adjustment_id TEXT,
 approved_by TEXT,approved_at TEXT,restores_version_id TEXT,authority_revision INTEGER,input_fingerprint TEXT,apply_guard_token TEXT,
 UNIQUE(project_id,version_number)
);
CREATE TABLE schedule_version_tasks (id TEXT PRIMARY KEY,version_id TEXT,project_id TEXT,task_id TEXT,task_group_id TEXT,forecast_start TEXT,forecast_end TEXT,planned_effort_minutes INTEGER,effort_status TEXT,primary_assignment_json TEXT,support_assignments_json TEXT,original_raw_json TEXT,created_at TEXT,UNIQUE(version_id,task_id));
CREATE TABLE task_actual_aggregates (task_id TEXT PRIMARY KEY,project_id TEXT,raw_actual_minutes INTEGER,approved_actual_minutes INTEGER,current_progress REAL,remaining_estimated_minutes INTEGER,completion_reported INTEGER,actual_status TEXT,last_actual_work_date TEXT,updated_at TEXT);
CREATE TABLE daily_worklogs (id TEXT PRIMARY KEY,employee_id TEXT,local_work_date TEXT,status TEXT);
CREATE TABLE daily_worklog_revisions (id TEXT PRIMARY KEY,worklog_id TEXT,is_effective INTEGER);
CREATE TABLE daily_worklog_entries (id TEXT PRIMARY KEY,worklog_id TEXT,revision_id TEXT,project_id TEXT);
CREATE TABLE task_actuals (id TEXT PRIMARY KEY,source_type TEXT);
CREATE TABLE task_completion_events (id TEXT PRIMARY KEY);
CREATE TABLE schedule_recalculation_runs (run_id TEXT PRIMARY KEY,input_fingerprint TEXT,official_data_before_hash TEXT,authority_revision INTEGER,status TEXT,source_worklog_id TEXT,source_revision_id TEXT,data_confidence TEXT);
CREATE TABLE shadow_schedule_authority_guard (guard_id TEXT PRIMARY KEY,revision INTEGER,lock_token TEXT,updated_at TEXT);
CREATE TABLE shadow_schedule_versions (shadow_version_id TEXT PRIMARY KEY,run_id TEXT,project_id TEXT,based_on_forecast_version_id TEXT,shadow_version_number INTEGER,shadow_forecast_start_date TEXT,shadow_forecast_end_date TEXT,schedule_variance_workdays INTEGER,approval_classification TEXT,approval_reasons_json TEXT,data_confidence TEXT,status TEXT,apply_status TEXT DEFAULT 'NOT_APPLIED',applied_at TEXT,applied_forecast_version_id TEXT);
CREATE TABLE shadow_schedule_tasks (shadow_task_id TEXT PRIMARY KEY,shadow_version_id TEXT,task_id TEXT,employee_id TEXT,official_forecast_start TEXT,official_forecast_end TEXT,shadow_start TEXT,shadow_end TEXT,delta_start_workdays INTEGER,delta_end_workdays INTEGER,impact_reason_codes_json TEXT,constraint_result TEXT,dependency_result TEXT);
CREATE TABLE shadow_capacity_allocations (allocation_id TEXT PRIMARY KEY,run_id TEXT,shadow_version_id TEXT,task_id TEXT,employee_id TEXT,local_work_date TEXT,timezone TEXT,available_capacity_minutes INTEGER,allocated_minutes INTEGER,capacity_source TEXT,priority_order INTEGER,allocation_sequence INTEGER,starts_at_utc TEXT,ends_at_utc TEXT);
CREATE TABLE shadow_impact_summaries (impact_summary_id TEXT PRIMARY KEY,run_id TEXT,cross_project_impact INTEGER);
CREATE TABLE shadow_impact_task_diffs (diff_id TEXT PRIMARY KEY,run_id TEXT,shadow_version_id TEXT,project_id TEXT,task_id TEXT,official_start TEXT,official_end TEXT,shadow_start TEXT,shadow_end TEXT,delta_start_workdays INTEGER,delta_end_workdays INTEGER,change_direction TEXT,reason_codes_json TEXT,approval_required INTEGER);
CREATE TABLE shadow_forecast_applications (application_id TEXT PRIMARY KEY,shadow_version_id TEXT UNIQUE,shadow_run_id TEXT,correlation_id TEXT,status TEXT,adjustment_id TEXT UNIQUE,official_version_id TEXT UNIQUE,applied_by TEXT,applied_at TEXT);
CREATE TABLE forecast_approval_requests (approval_request_id TEXT PRIMARY KEY,shadow_version_id TEXT UNIQUE,shadow_run_id TEXT,project_id TEXT,status TEXT,requested_by TEXT,requested_at TEXT,decided_by TEXT,decided_at TEXT,decision_reason TEXT,applied_adjustment_id TEXT,created_at TEXT,updated_at TEXT);
CREATE TABLE schedule_adjustment_events (adjustment_id TEXT PRIMARY KEY,correlation_id TEXT,project_id TEXT,employee_id TEXT,source_worklog_id TEXT,source_revision_id TEXT,source_shadow_run_id TEXT,source_shadow_version_id TEXT UNIQUE,forecast_version_before TEXT,forecast_version_after TEXT,project_end_before TEXT,project_end_after TEXT,delta_workdays INTEGER,classification TEXT,approval_status TEXT,reason_codes_json TEXT,affected_task_count INTEGER,affected_project_count INTEGER,cross_project INTEGER,created_by TEXT,created_at TEXT,applied_by TEXT,applied_at TEXT);
CREATE TABLE schedule_adjustment_impacts (adjustment_impact_id TEXT PRIMARY KEY,adjustment_id TEXT,project_id TEXT,task_id TEXT,employee_id TEXT,forecast_start_before TEXT,forecast_start_after TEXT,forecast_end_before TEXT,forecast_end_after TEXT,delta_start_workdays INTEGER,delta_end_workdays INTEGER,reason_codes_json TEXT,constraint_result TEXT,dependency_result TEXT,created_at TEXT,UNIQUE(adjustment_id,task_id));
CREATE TABLE shadow_engine_audit_events (audit_id TEXT PRIMARY KEY,event_type TEXT,entity_type TEXT,entity_id TEXT,actor_employee_id TEXT,actor_mode TEXT,event_time_utc TEXT,before_json TEXT,after_json TEXT,reason TEXT,test_session_id TEXT,request_id TEXT);
CREATE TABLE shadow_engine_idempotency_keys (idempotency_key TEXT PRIMARY KEY,operation TEXT,payload_hash TEXT,response_json TEXT,created_at TEXT);
CREATE TABLE task_constraints (constraint_id TEXT PRIMARY KEY,task_id TEXT,constraint_type TEXT,constraint_date TEXT,status TEXT);
CREATE TRIGGER trg_shadow_auth_schedule_versions_i AFTER INSERT ON schedule_versions BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1 WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER trg_shadow_auth_schedule_version_tasks_i AFTER INSERT ON schedule_version_tasks BEGIN UPDATE shadow_schedule_authority_guard SET revision=revision+1 WHERE guard_id='GLOBAL'; END;
CREATE TRIGGER trg_forecast_append_version_cas BEFORE INSERT ON schedule_versions BEGIN
 SELECT RAISE(ABORT,'FORECAST_VERSION_CONFLICT') WHERE NEW.source_type IN ('SHADOW_AUTO_APPLY','SHADOW_APPROVED','MANAGER_RESTORE') AND NEW.based_on_version_id IS NOT (SELECT id FROM schedule_versions WHERE project_id=NEW.project_id ORDER BY version_number DESC LIMIT 1);
 SELECT RAISE(ABORT,'SHADOW_AUTHORITY_STALE') WHERE NEW.source_type IN ('SHADOW_AUTO_APPLY','SHADOW_APPROVED','MANAGER_RESTORE') AND NOT EXISTS (SELECT 1 FROM shadow_schedule_authority_guard WHERE guard_id='GLOBAL' AND revision=NEW.authority_revision AND lock_token=NEW.apply_guard_token);
END;
`;

const dataTables = [
  'shadow_engine_idempotency_keys', 'shadow_engine_audit_events', 'schedule_adjustment_impacts', 'schedule_adjustment_events',
  'forecast_approval_requests', 'shadow_forecast_applications', 'shadow_impact_summaries', 'shadow_impact_task_diffs', 'shadow_capacity_allocations', 'shadow_schedule_tasks',
  'shadow_schedule_versions', 'schedule_recalculation_runs', 'task_constraints', 'task_completion_events', 'task_actuals',
  'daily_worklog_entries', 'daily_worklog_revisions', 'daily_worklogs', 'task_actual_aggregates', 'schedule_version_tasks',
  'schedule_versions', 'task_baselines', 'project_baselines', 'tasks', 'projects', 'workers',
];

describe.runIf(enabled)('Checkpoint 3B D1 append-only Forecast integration', { timeout: 60_000 }, () => {
  let platform: PlatformProxy<{ DB: D1Database }>;
  let schemaReady = false;

  beforeAll(async () => {
    platform = await getPlatformProxy<{ DB: D1Database }>({ configPath, persist: { path: persistPath! }, remoteBindings: false, envFiles: [] });
  }, 30_000);

  afterAll(async () => { await platform?.dispose(); });

  async function fixture(options: { classification?: 'AUTO_APPLY_ELIGIBLE' | 'APPROVAL_REQUIRED'; crossProject?: boolean } = {}) {
    const classification = options.classification || 'AUTO_APPLY_ELIGIBLE';
    const crossProject = Boolean(options.crossProject);
    const db = platform.env.DB;
    for (const triggerName of ['fail_forecast_version', 'fail_task_snapshot', 'fail_adjustment', 'fail_impact', 'fail_audit', 'fail_idempotency']) {
      await db.exec(`DROP TRIGGER IF EXISTS ${triggerName}`);
    }
    if (!schemaReady) {
      // D1 accepts one DDL unit at a time. Split only at top-level CREATE
      // lines, preserving trigger bodies that contain their own semicolons.
      const createStatements = schema.trim()
        .split(/\n(?=CREATE )/)
        .map((statement) => statement.trim()
          .replace(/^CREATE TABLE /, 'CREATE TABLE IF NOT EXISTS ')
          .replace(/^CREATE TRIGGER /, 'CREATE TRIGGER IF NOT EXISTS '));
      for (const statement of createStatements) {
        await db.prepare(statement).run();
      }
      schemaReady = true;
    }
    for (const table of dataTables) await db.prepare(`DELETE FROM ${table}`).run();
    await db.prepare(`DELETE FROM shadow_schedule_authority_guard`).run();
    await db.prepare(`INSERT INTO shadow_schedule_authority_guard (guard_id,revision,lock_token) VALUES ('GLOBAL',0,NULL)`).run();
    await db.batch([
      db.prepare(`INSERT INTO workers VALUES ('manager','Manager',1,'EDITOR',1),('executive','Executive',1,'VIEWER',0),('support','Support',1,'EDITOR',0)`),
      db.prepare(`INSERT INTO projects VALUES ('project-a','Project A','2026-08-10','2026-08-20',12,'ACTIVE')`),
      db.prepare(`INSERT INTO tasks VALUES ('task-a1','project-a','group-a','2026-08-10','2026-08-12',1,'Task A1'),('task-a2','project-a','group-a','2026-08-13','2026-08-14',2,'Task A2')`),
      db.prepare(`INSERT INTO project_baselines VALUES ('baseline-a','project-a',1,'2026-08-10','2026-08-20','2026-08-01')`),
      db.prepare(`INSERT INTO task_baselines VALUES ('tb-a1','baseline-a','task-a1','2026-08-10','2026-08-12',0,'CONFIRMED',240),('tb-a2','baseline-a','task-a2','2026-08-13','2026-08-14',0,'CONFIRMED',240)`),
      db.prepare(`INSERT INTO schedule_versions (id,project_id,baseline_id,version_number,source_type,status,project_forecast_start,project_forecast_end,created_at,created_by,actor_mode) VALUES ('forecast-a1','project-a','baseline-a',1,'INITIAL_BASELINE_CLONE','APPLIED','2026-08-10','2026-08-20','2026-08-01','system','SYSTEM')`),
      db.prepare(`INSERT INTO schedule_version_tasks VALUES ('snapshot-a1','forecast-a1','project-a','task-a1','group-a','2026-08-10','2026-08-12',240,'CONFIRMED',NULL,NULL,NULL,'2026-08-01'),('snapshot-a2','forecast-a1','project-a','task-a2','group-a','2026-08-13','2026-08-14',240,'CONFIRMED',NULL,NULL,NULL,'2026-08-01')`),
      db.prepare(`INSERT INTO task_actual_aggregates VALUES ('task-a1','project-a',60,60,25,180,0,'IN_PROGRESS','2026-08-12','2026-08-12')`),
    ]);
    if (crossProject) {
      await db.batch([
        db.prepare(`INSERT INTO projects VALUES ('project-b','Project B','2026-08-10','2026-08-20',0,'ACTIVE')`),
        db.prepare(`INSERT INTO tasks VALUES ('task-b1','project-b','group-b','2026-08-10','2026-08-12',1,'Task B1')`),
        db.prepare(`INSERT INTO project_baselines VALUES ('baseline-b','project-b',1,'2026-08-10','2026-08-20','2026-08-01')`),
        db.prepare(`INSERT INTO task_baselines VALUES ('tb-b1','baseline-b','task-b1','2026-08-10','2026-08-12',0,'CONFIRMED',240)`),
        db.prepare(`INSERT INTO schedule_versions (id,project_id,baseline_id,version_number,source_type,status,project_forecast_start,project_forecast_end,created_at,created_by,actor_mode) VALUES ('forecast-b1','project-b','baseline-b',1,'INITIAL_BASELINE_CLONE','APPLIED','2026-08-10','2026-08-20','2026-08-01','system','SYSTEM')`),
        db.prepare(`INSERT INTO schedule_version_tasks VALUES ('snapshot-b1','forecast-b1','project-b','task-b1','group-b','2026-08-10','2026-08-12',240,'CONFIRMED',NULL,NULL,NULL,'2026-08-01')`),
      ]);
    }
    const authority = Number((await db.prepare(`SELECT revision FROM shadow_schedule_authority_guard WHERE guard_id='GLOBAL'`).first<any>())?.revision || 0);
    const officialHash = await officialDataFingerprint(db);
    await db.batch([
      db.prepare(`INSERT INTO schedule_recalculation_runs VALUES ('run-1','input-1',?1,?2,'COMPLETED',NULL,NULL,'HIGH')`).bind(officialHash, authority),
      db.prepare(`INSERT INTO shadow_schedule_versions VALUES ('shadow-a','run-1','project-a','forecast-a1',1,'2026-08-10','2026-08-20',0,?1,'["TEST"]','HIGH','CURRENT','NOT_APPLIED',NULL,NULL)`).bind(classification),
      db.prepare(`INSERT INTO shadow_schedule_tasks VALUES ('shadow-task-a1','shadow-a','task-a1','manager','2026-08-10','2026-08-12','2026-08-09','2026-08-11',-1,-1,'["EARLY"]','NONE','NONE')`),
      db.prepare(`INSERT INTO shadow_impact_summaries VALUES ('impact-1','run-1',?1)`).bind(crossProject ? 1 : 0),
    ]);
    if (classification === 'APPROVAL_REQUIRED') {
      await db.prepare(`INSERT INTO forecast_approval_requests VALUES ('approval-a','shadow-a','run-1','project-a','PENDING','manager','2026-08-12',NULL,NULL,NULL,NULL,'2026-08-12','2026-08-12')`).run();
    }
    if (crossProject) {
      await db.batch([
        db.prepare(`INSERT INTO shadow_schedule_versions VALUES ('shadow-b','run-1','project-b','forecast-b1',1,'2026-08-10','2026-08-20',0,'AUTO_APPLY_ELIGIBLE','["CROSS"]','HIGH','CURRENT','NOT_APPLIED',NULL,NULL)`),
        db.prepare(`INSERT INTO shadow_schedule_tasks VALUES ('shadow-task-b1','shadow-b','task-b1','manager','2026-08-10','2026-08-12','2026-08-11','2026-08-13',1,1,'["CROSS"]','NONE','NONE')`),
      ]);
    }
    return db;
  }

  async function counts(db: D1Database) {
    return db.prepare(`SELECT
      (SELECT COUNT(*) FROM schedule_versions WHERE source_type IN ('SHADOW_AUTO_APPLY','SHADOW_APPROVED','MANAGER_RESTORE')) AS appended,
      (SELECT COUNT(*) FROM schedule_adjustment_events) AS adjustments,
      (SELECT COUNT(*) FROM schedule_adjustment_impacts) AS impacts,
      (SELECT COUNT(*) FROM shadow_forecast_applications) AS applications,
      (SELECT COUNT(*) FROM shadow_engine_audit_events) AS audit`).first<any>();
  }

  it('appends a full Official Forecast snapshot and replays the same apply exactly once', async () => {
    const db = await fixture();
    const baselineBefore = await db.prepare(`SELECT baseline_end_date FROM project_baselines WHERE id='baseline-a'`).first<any>();
    const actualBefore = await db.prepare(`SELECT current_progress,approved_actual_minutes FROM task_actual_aggregates WHERE task_id='task-a1'`).first<any>();
    const originalBefore = await db.prepare(`SELECT project_forecast_end FROM schedule_versions WHERE id='forecast-a1'`).first<any>();

    const first = await applyShadowForecast(db, managerActor, 'shadow-a', 'apply-once', flags);
    const replay = await applyShadowForecast(db, managerActor, 'shadow-a', 'apply-once', flags);
    expect(replay).toEqual(first);
    expect(first.official_versions).toHaveLength(1);
    const appliedId = first.official_versions[0].forecast_version_id;
    expect(await counts(db)).toMatchObject({ appended: 1, adjustments: 1, applications: 1, audit: 1 });
    expect(await db.prepare(`SELECT COUNT(*) AS count FROM schedule_version_tasks WHERE version_id=?`).bind(appliedId).first<any>()).toMatchObject({ count: 2 });
    expect(await db.prepare(`SELECT forecast_start,forecast_end FROM schedule_version_tasks WHERE version_id=? AND task_id='task-a1'`).bind(appliedId).first<any>())
      .toMatchObject({ forecast_start: '2026-08-09', forecast_end: '2026-08-11' });
    expect(await db.prepare(`SELECT forecast_start,forecast_end FROM schedule_version_tasks WHERE version_id=? AND task_id='task-a2'`).bind(appliedId).first<any>())
      .toMatchObject({ forecast_start: '2026-08-13', forecast_end: '2026-08-14' });
    expect(await db.prepare(`SELECT baseline_end_date FROM project_baselines WHERE id='baseline-a'`).first<any>()).toEqual(baselineBefore);
    expect(await db.prepare(`SELECT current_progress,approved_actual_minutes FROM task_actual_aggregates WHERE task_id='task-a1'`).first<any>()).toEqual(actualBefore);
    expect(await db.prepare(`SELECT project_forecast_end FROM schedule_versions WHERE id='forecast-a1'`).first<any>()).toEqual(originalBefore);
    expect(await db.prepare(`SELECT start_date,end_date FROM tasks WHERE id='task-a1'`).first<any>()).toMatchObject({ start_date: '2026-08-10', end_date: '2026-08-12' });
    await expect(applyShadowForecast(db, managerActor, 'shadow-a', 'apply-new-key', flags)).rejects.toMatchObject({ code: 'SHADOW_ALREADY_APPLIED', status: 409 });
    expect((await getCurrentForecast(db, executiveActor, 'project-a')).shadow_version).toBeNull();
    expect((await getCurrentProjectShadow(db, executiveActor, 'project-a')).run).toBeNull();
  });

  it('enforces manager-only approval, then atomically approves and applies', async () => {
    const db = await fixture({ classification: 'APPROVAL_REQUIRED' });
    await expect(approveShadowForecast(db, executiveActor, 'shadow-a', 'ceo-approve', flags)).rejects.toMatchObject({ code: 'APPROVAL_PERMISSION_DENIED', status: 403 });
    await expect(approveShadowForecast(db, supportActor, 'shadow-a', 'support-approve', flags)).rejects.toMatchObject({ code: 'APPROVAL_PERMISSION_DENIED', status: 403 });
    const result = await approveShadowForecast(db, managerActor, 'shadow-a', 'manager-approve', flags);
    expect(result.approval_status).toBe('APPROVED');
    expect(await db.prepare(`SELECT status FROM forecast_approval_requests WHERE shadow_version_id='shadow-a'`).first<any>()).toMatchObject({ status: 'APPLIED' });
    expect(await counts(db)).toMatchObject({ appended: 1, adjustments: 1, applications: 1, audit: 1 });
  });

  it('rejects without changing Official Forecast and requires a reason', async () => {
    const db = await fixture({ classification: 'APPROVAL_REQUIRED' });
    await expect(rejectShadowForecast(db, managerActor, 'shadow-a', '', 'reject-empty', flags)).rejects.toMatchObject({ code: 'REJECT_REASON_REQUIRED', status: 400 });
    const result = await rejectShadowForecast(db, managerActor, 'shadow-a', 'Business decision', 'reject-1', flags);
    expect(result).toMatchObject({ status: 'REJECTED', official_forecast_changed: false });
    expect(await counts(db)).toMatchObject({ appended: 0, adjustments: 0, applications: 0, audit: 1 });
    expect(await db.prepare(`SELECT status,decision_reason FROM forecast_approval_requests WHERE shadow_version_id='shadow-a'`).first<any>())
      .toMatchObject({ status: 'REJECTED', decision_reason: 'Business decision' });
  });

  it('restores a prior snapshot by appending a new version and keeps Actual immutable', async () => {
    const db = await fixture();
    const applied = await applyShadowForecast(db, managerActor, 'shadow-a', 'apply-before-restore', flags);
    const currentId = applied.official_versions[0].forecast_version_id;
    const actualBefore = await db.prepare(`SELECT current_progress,approved_actual_minutes FROM task_actual_aggregates WHERE task_id='task-a1'`).first<any>();
    const restored = await restoreForecastVersion(db, managerActor, 'project-a', 'forecast-a1', { expected_version_id: currentId }, 'restore-v1', flags);
    expect(restored).toMatchObject({ restored: true, version_number: 3, restored_version_id: 'forecast-a1' });
    expect(await db.prepare(`SELECT source_type,restores_version_id,project_forecast_end FROM schedule_versions WHERE id=?`).bind(restored.forecast_version_id).first<any>())
      .toMatchObject({ source_type: 'MANAGER_RESTORE', restores_version_id: 'forecast-a1', project_forecast_end: '2026-08-20' });
    expect(await db.prepare(`SELECT forecast_start,forecast_end FROM schedule_version_tasks WHERE version_id=? AND task_id='task-a1'`).bind(restored.forecast_version_id).first<any>())
      .toMatchObject({ forecast_start: '2026-08-10', forecast_end: '2026-08-12' });
    expect(await db.prepare(`SELECT current_progress,approved_actual_minutes FROM task_actual_aggregates WHERE task_id='task-a1'`).first<any>()).toEqual(actualBefore);
  });

  it.each([
    ['Forecast Version', `CREATE TRIGGER fail_forecast_version BEFORE INSERT ON schedule_versions WHEN NEW.source_type='SHADOW_AUTO_APPLY' BEGIN SELECT RAISE(ABORT,'FAIL_VERSION'); END`],
    ['Task Snapshot', `CREATE TRIGGER fail_task_snapshot BEFORE INSERT ON schedule_version_tasks WHEN NEW.version_id LIKE 'ofv_%' BEGIN SELECT RAISE(ABORT,'FAIL_SNAPSHOT'); END`],
    ['Adjustment', `CREATE TRIGGER fail_adjustment BEFORE INSERT ON schedule_adjustment_events BEGIN SELECT RAISE(ABORT,'FAIL_ADJUSTMENT'); END`],
    ['Impact', `CREATE TRIGGER fail_impact BEFORE INSERT ON schedule_adjustment_impacts BEGIN SELECT RAISE(ABORT,'FAIL_IMPACT'); END`],
    ['Audit', `CREATE TRIGGER fail_audit BEFORE INSERT ON shadow_engine_audit_events WHEN NEW.event_type='FORECAST_CONTROLLED_APPLIED' BEGIN SELECT RAISE(ABORT,'FAIL_AUDIT'); END`],
    ['Idempotency finalize', `CREATE TRIGGER fail_idempotency BEFORE UPDATE ON shadow_engine_idempotency_keys BEGIN SELECT RAISE(ABORT,'FAIL_IDEMPOTENCY'); END`],
  ])('rolls back every write when %s insertion fails', async (_label, triggerSql) => {
    const db = await fixture();
    await db.exec(triggerSql as string);
    await expect(applyShadowForecast(db, managerActor, 'shadow-a', `failure-${_label}`, flags)).rejects.toThrow();
    expect(await counts(db)).toMatchObject({ appended: 0, adjustments: 0, impacts: 0, applications: 0, audit: 0 });
    expect(await db.prepare(`SELECT apply_status FROM shadow_schedule_versions WHERE shadow_version_id='shadow-a'`).first<any>()).toMatchObject({ apply_status: 'NOT_APPLIED' });
  });

  it('rolls back every project when one cross-project version fails', async () => {
    const db = await fixture({ crossProject: true });
    await db.exec(`CREATE TRIGGER fail_forecast_version BEFORE INSERT ON schedule_versions WHEN NEW.project_id='project-b' BEGIN SELECT RAISE(ABORT,'FAIL_PROJECT_B'); END`);
    await expect(applyShadowForecast(db, managerActor, 'shadow-a', 'cross-project-failure', flags)).rejects.toThrow();
    expect(await db.prepare(`SELECT project_id,COUNT(*) AS count FROM schedule_versions GROUP BY project_id ORDER BY project_id`).all<any>()).toMatchObject({
      results: [{ project_id: 'project-a', count: 1 }, { project_id: 'project-b', count: 1 }],
    });
    expect(await counts(db)).toMatchObject({ appended: 0, adjustments: 0, applications: 0, audit: 0 });
  });

  it('blocks stale Authority revision before any Official Forecast mutation', async () => {
    const db = await fixture();
    await db.prepare(`UPDATE shadow_schedule_authority_guard SET revision=revision+1 WHERE guard_id='GLOBAL'`).run();
    await expect(applyShadowForecast(db, managerActor, 'shadow-a', 'stale-authority', flags)).rejects.toMatchObject({ code: 'SHADOW_AUTHORITY_STALE', status: 409 });
    expect(await counts(db)).toMatchObject({ appended: 0, adjustments: 0, applications: 0, audit: 0 });
  });
});
