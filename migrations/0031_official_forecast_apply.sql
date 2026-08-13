-- Developer Scheduler V3 - Checkpoint 3B
-- Official Forecast versioning / approval / restore.
-- Additive only: Baseline, Actual, existing Forecast snapshots and project/task dates are never updated here.

ALTER TABLE schedule_versions ADD COLUMN source_shadow_version_id TEXT;
ALTER TABLE schedule_versions ADD COLUMN source_shadow_run_id TEXT;
ALTER TABLE schedule_versions ADD COLUMN source_worklog_id TEXT;
ALTER TABLE schedule_versions ADD COLUMN source_revision_id TEXT;
ALTER TABLE schedule_versions ADD COLUMN source_adjustment_id TEXT;
ALTER TABLE schedule_versions ADD COLUMN approved_by TEXT;
ALTER TABLE schedule_versions ADD COLUMN approved_at TEXT;
ALTER TABLE schedule_versions ADD COLUMN restores_version_id TEXT;
ALTER TABLE schedule_versions ADD COLUMN authority_revision INTEGER;
ALTER TABLE schedule_versions ADD COLUMN input_fingerprint TEXT;
ALTER TABLE schedule_versions ADD COLUMN apply_guard_token TEXT;
ALTER TABLE shadow_schedule_versions ADD COLUMN applied_at TEXT;
ALTER TABLE shadow_schedule_versions ADD COLUMN applied_forecast_version_id TEXT;
ALTER TABLE shadow_schedule_versions ADD COLUMN apply_status TEXT NOT NULL DEFAULT 'NOT_APPLIED';

CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_versions_source_shadow
  ON schedule_versions(source_shadow_version_id)
  WHERE source_shadow_version_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_schedule_versions_source_shadow_run
  ON schedule_versions(source_shadow_run_id, project_id);

CREATE TABLE IF NOT EXISTS schedule_adjustment_events (
  adjustment_id TEXT PRIMARY KEY,
  correlation_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  employee_id TEXT,
  source_worklog_id TEXT,
  source_revision_id TEXT,
  source_shadow_run_id TEXT,
  source_shadow_version_id TEXT,
  forecast_version_before TEXT,
  forecast_version_after TEXT,
  project_end_before TEXT,
  project_end_after TEXT,
  delta_workdays INTEGER NOT NULL DEFAULT 0,
  classification TEXT NOT NULL,
  approval_status TEXT NOT NULL,
  reason_codes_json TEXT NOT NULL DEFAULT '[]',
  affected_task_count INTEGER NOT NULL DEFAULT 0,
  affected_project_count INTEGER NOT NULL DEFAULT 1,
  cross_project INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_by TEXT,
  applied_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (forecast_version_before) REFERENCES schedule_versions(id),
  FOREIGN KEY (forecast_version_after) REFERENCES schedule_versions(id),
  FOREIGN KEY (source_shadow_run_id) REFERENCES schedule_recalculation_runs(run_id),
  FOREIGN KEY (source_shadow_version_id) REFERENCES shadow_schedule_versions(shadow_version_id),
  CHECK (classification IN ('AUTO_APPLY_ELIGIBLE','APPROVAL_REQUIRED','BLOCKED','NO_CHANGE')),
  CHECK (approval_status IN ('AUTO_APPLIED','APPROVED','REJECTED','RESTORED')),
  UNIQUE(source_shadow_version_id)
);

CREATE TABLE IF NOT EXISTS schedule_adjustment_impacts (
  adjustment_impact_id TEXT PRIMARY KEY,
  adjustment_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  employee_id TEXT,
  forecast_start_before TEXT,
  forecast_start_after TEXT,
  forecast_end_before TEXT,
  forecast_end_after TEXT,
  delta_start_workdays INTEGER NOT NULL DEFAULT 0,
  delta_end_workdays INTEGER NOT NULL DEFAULT 0,
  reason_codes_json TEXT NOT NULL DEFAULT '[]',
  constraint_result TEXT,
  dependency_result TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (adjustment_id) REFERENCES schedule_adjustment_events(adjustment_id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  UNIQUE(adjustment_id, task_id)
);

CREATE TABLE IF NOT EXISTS forecast_approval_requests (
  approval_request_id TEXT PRIMARY KEY,
  shadow_version_id TEXT NOT NULL,
  shadow_run_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_by TEXT,
  decided_at TEXT,
  decision_reason TEXT,
  applied_adjustment_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shadow_version_id) REFERENCES shadow_schedule_versions(shadow_version_id),
  FOREIGN KEY (shadow_run_id) REFERENCES schedule_recalculation_runs(run_id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (applied_adjustment_id) REFERENCES schedule_adjustment_events(adjustment_id),
  CHECK (status IN ('PENDING','APPROVED','REJECTED','STALE','CANCELLED','APPLIED')),
  UNIQUE(shadow_version_id)
);

CREATE TABLE IF NOT EXISTS shadow_forecast_applications (
  application_id TEXT PRIMARY KEY,
  shadow_version_id TEXT NOT NULL,
  shadow_run_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'APPLIED',
  adjustment_id TEXT NOT NULL,
  official_version_id TEXT NOT NULL,
  applied_by TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shadow_version_id) REFERENCES shadow_schedule_versions(shadow_version_id),
  FOREIGN KEY (shadow_run_id) REFERENCES schedule_recalculation_runs(run_id),
  FOREIGN KEY (adjustment_id) REFERENCES schedule_adjustment_events(adjustment_id),
  FOREIGN KEY (official_version_id) REFERENCES schedule_versions(id),
  CHECK (status = 'APPLIED'),
  UNIQUE(shadow_version_id),
  UNIQUE(adjustment_id),
  UNIQUE(official_version_id)
);

CREATE INDEX IF NOT EXISTS idx_adjustment_events_project_created
  ON schedule_adjustment_events(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_adjustment_events_correlation
  ON schedule_adjustment_events(correlation_id, project_id);
CREATE INDEX IF NOT EXISTS idx_adjustment_impacts_adjustment
  ON schedule_adjustment_impacts(adjustment_id, task_id);
CREATE INDEX IF NOT EXISTS idx_forecast_approval_project_status
  ON forecast_approval_requests(project_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_shadow_forecast_applications_run
  ON shadow_forecast_applications(shadow_run_id, shadow_version_id);

-- Reject and Apply can race from two manager sessions.  Application is
-- allowed only while the Shadow remains a current, unapplied candidate; this
-- trigger makes the decision and append-only Forecast transaction all-or-none.
CREATE TRIGGER IF NOT EXISTS trg_shadow_forecast_application_current_guard
BEFORE INSERT ON shadow_forecast_applications
BEGIN
  SELECT RAISE(ABORT, 'SHADOW_STALE')
  WHERE NOT EXISTS (
    SELECT 1 FROM shadow_schedule_versions
    WHERE shadow_version_id=NEW.shadow_version_id
      AND status='CURRENT'
      AND COALESCE(apply_status,'NOT_APPLIED')='NOT_APPLIED'
  );
END;

-- A forecast apply may only append from the version it calculated against.
-- An empty SELECT is insufficient because a batch could otherwise continue;
-- this trigger aborts the whole D1 transaction on a stale base version.
CREATE TRIGGER IF NOT EXISTS trg_forecast_append_version_cas
BEFORE INSERT ON schedule_versions
BEGIN
  SELECT RAISE(ABORT, 'FORECAST_VERSION_CONFLICT')
  WHERE NEW.source_type IN ('SHADOW_AUTO_APPLY','SHADOW_APPROVED','MANAGER_RESTORE')
    AND NEW.based_on_version_id IS NOT (
    SELECT id FROM schedule_versions
    WHERE project_id=NEW.project_id
    ORDER BY version_number DESC LIMIT 1
  );
  SELECT RAISE(ABORT, 'SHADOW_AUTHORITY_STALE')
  WHERE NEW.source_type IN ('SHADOW_AUTO_APPLY','SHADOW_APPROVED','MANAGER_RESTORE')
    AND NOT EXISTS (
    SELECT 1 FROM shadow_schedule_authority_guard
    WHERE guard_id='GLOBAL'
      AND revision=NEW.authority_revision
      AND lock_token=NEW.apply_guard_token
  );
END;
