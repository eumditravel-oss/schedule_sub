-- Developer Scheduler V3 - Checkpoint 3A
-- Shadow Dynamic Schedule Recalculation
-- Additive only. This migration never updates Baseline, official Forecast,
-- Project/Task schedule dates, progress, completion, or Worklog revisions.

ALTER TABLE workers ADD COLUMN can_manage_schedule_engine INTEGER NOT NULL DEFAULT 0;

-- Derive schedule-manager authority from existing relationship permissions.
-- No person name is embedded in application or migration policy.
UPDATE workers
SET can_manage_schedule_engine = 1
WHERE can_manage_country_calendar = 1 OR can_manage_integrations = 1;

CREATE TABLE IF NOT EXISTS task_dependencies (
  dependency_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  predecessor_task_id TEXT NOT NULL,
  successor_task_id TEXT NOT NULL,
  dependency_type TEXT NOT NULL DEFAULT 'FINISH_TO_START',
  lag_work_minutes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PROPOSED',
  confidence_score INTEGER NOT NULL DEFAULT 0,
  confidence_level TEXT NOT NULL DEFAULT 'LOW',
  proposal_source TEXT NOT NULL,
  proposal_evidence_json TEXT NOT NULL DEFAULT '[]',
  proposed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  proposed_by TEXT NOT NULL,
  confirmed_at TEXT,
  confirmed_by TEXT,
  rejected_at TEXT,
  rejected_by TEXT,
  rejection_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (predecessor_task_id) REFERENCES tasks(id),
  FOREIGN KEY (successor_task_id) REFERENCES tasks(id),
  CHECK (predecessor_task_id <> successor_task_id),
  CHECK (dependency_type IN ('FINISH_TO_START')),
  CHECK (status IN ('PROPOSED','CONFIRMED','REJECTED','DISABLED')),
  CHECK (confidence_level IN ('HIGH','MEDIUM','LOW')),
  CHECK (lag_work_minutes >= 0),
  UNIQUE(project_id, predecessor_task_id, successor_task_id, dependency_type)
);

CREATE TABLE IF NOT EXISTS task_constraints (
  constraint_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  constraint_type TEXT NOT NULL,
  constraint_date TEXT,
  constraint_timestamp_utc TEXT,
  constraint_minutes INTEGER,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  CHECK (constraint_type IN ('AS_SOON_AS_POSSIBLE','NOT_BEFORE','FIXED_START','FIXED_END','MILESTONE')),
  CHECK (status IN ('ACTIVE','SUPERSEDED','DISABLED'))
);

CREATE TABLE IF NOT EXISTS project_priorities (
  project_id TEXT PRIMARY KEY,
  priority_rank INTEGER NOT NULL,
  priority_label TEXT,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  set_by TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  CHECK (priority_rank > 0)
);

CREATE TABLE IF NOT EXISTS schedule_recalculation_requests (
  request_id TEXT PRIMARY KEY,
  trigger_type TEXT NOT NULL,
  source_worklog_id TEXT,
  source_revision_id TEXT,
  project_id TEXT,
  employee_id TEXT,
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  last_error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_worklog_id) REFERENCES daily_worklogs(id),
  FOREIGN KEY (source_revision_id) REFERENCES daily_worklog_revisions(id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (employee_id) REFERENCES workers(id),
  CHECK (status IN ('PENDING','RUNNING','COMPLETED','FAILED_RETRYABLE','FAILED_BLOCKED','CANCELLED','STALE'))
);

CREATE TABLE IF NOT EXISTS schedule_recalculation_runs (
  run_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'SHADOW',
  input_fingerprint TEXT NOT NULL,
  result_fingerprint TEXT,
  based_on_baseline_version INTEGER,
  based_on_forecast_version INTEGER,
  planning_cutoff_utc TEXT NOT NULL,
  planning_cutoff_local_date TEXT NOT NULL,
  status TEXT NOT NULL,
  data_confidence TEXT NOT NULL,
  affected_project_count INTEGER NOT NULL DEFAULT 0,
  affected_task_count INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_by TEXT NOT NULL,
  validation_summary_json TEXT NOT NULL DEFAULT '{}',
  official_data_before_hash TEXT NOT NULL,
  official_data_after_hash TEXT,
  FOREIGN KEY (request_id) REFERENCES schedule_recalculation_requests(request_id),
  CHECK (mode = 'SHADOW'),
  CHECK (status IN ('RUNNING','COMPLETED','BLOCKED','FAILED')),
  CHECK (data_confidence IN ('HIGH','PROVISIONAL','LOW','BLOCKED')),
  UNIQUE(engine_version, input_fingerprint)
);

CREATE TABLE IF NOT EXISTS schedule_engine_input_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE,
  input_fingerprint TEXT NOT NULL,
  canonical_input_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES schedule_recalculation_runs(run_id)
);

CREATE TABLE IF NOT EXISTS shadow_schedule_versions (
  shadow_version_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  based_on_forecast_version_id TEXT,
  shadow_version_number INTEGER NOT NULL,
  baseline_start_date TEXT,
  baseline_end_date TEXT,
  official_forecast_start_date TEXT,
  official_forecast_end_date TEXT,
  shadow_forecast_start_date TEXT,
  shadow_forecast_end_date TEXT,
  schedule_variance_workdays INTEGER NOT NULL DEFAULT 0,
  variance_calendar_employee_id TEXT,
  variance_calendar_timezone TEXT,
  variance_calendar_basis TEXT,
  approval_classification TEXT NOT NULL,
  approval_reasons_json TEXT NOT NULL DEFAULT '[]',
  data_confidence TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CURRENT',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES schedule_recalculation_runs(run_id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (based_on_forecast_version_id) REFERENCES schedule_versions(id),
  CHECK (approval_classification IN ('AUTO_APPLY_ELIGIBLE','APPROVAL_REQUIRED','BLOCKED','NO_CHANGE')),
  CHECK (data_confidence IN ('HIGH','PROVISIONAL','LOW','BLOCKED')),
  CHECK (status IN ('CURRENT','STALE','INVALIDATED','BLOCKED','EXPIRED')),
  UNIQUE(project_id, shadow_version_number)
);

CREATE TABLE IF NOT EXISTS shadow_schedule_tasks (
  shadow_task_id TEXT PRIMARY KEY,
  shadow_version_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  employee_id TEXT,
  baseline_start TEXT,
  baseline_end TEXT,
  official_forecast_start TEXT,
  official_forecast_end TEXT,
  shadow_start TEXT,
  shadow_end TEXT,
  delta_start_workdays INTEGER NOT NULL DEFAULT 0,
  delta_end_workdays INTEGER NOT NULL DEFAULT 0,
  remaining_minutes INTEGER NOT NULL DEFAULT 0,
  allocation_source TEXT NOT NULL,
  constraint_result TEXT NOT NULL,
  dependency_result TEXT NOT NULL,
  priority_result TEXT NOT NULL,
  impact_reason_codes_json TEXT NOT NULL DEFAULT '[]',
  approval_required INTEGER NOT NULL DEFAULT 0,
  data_confidence TEXT NOT NULL,
  FOREIGN KEY (shadow_version_id) REFERENCES shadow_schedule_versions(shadow_version_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (employee_id) REFERENCES workers(id),
  UNIQUE(shadow_version_id, task_id)
);

CREATE TABLE IF NOT EXISTS shadow_capacity_allocations (
  allocation_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  shadow_version_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  local_work_date TEXT NOT NULL,
  timezone TEXT NOT NULL,
  available_capacity_minutes INTEGER NOT NULL,
  allocated_minutes INTEGER NOT NULL,
  capacity_source TEXT NOT NULL,
  priority_order INTEGER NOT NULL,
  allocation_sequence INTEGER NOT NULL,
  starts_at_utc TEXT NOT NULL,
  ends_at_utc TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES schedule_recalculation_runs(run_id),
  FOREIGN KEY (shadow_version_id) REFERENCES shadow_schedule_versions(shadow_version_id),
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (employee_id) REFERENCES workers(id),
  UNIQUE(run_id, task_id, employee_id, local_work_date, allocation_sequence),
  CHECK (available_capacity_minutes >= 0),
  CHECK (allocated_minutes >= 0)
);

CREATE TABLE IF NOT EXISTS shadow_impact_summaries (
  impact_summary_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE,
  source_worklog_id TEXT,
  employee_id TEXT,
  primary_project_id TEXT,
  affected_project_count INTEGER NOT NULL,
  affected_task_count INTEGER NOT NULL,
  tasks_advanced_count INTEGER NOT NULL,
  tasks_delayed_count INTEGER NOT NULL,
  unchanged_task_count INTEGER NOT NULL,
  primary_project_end_before TEXT,
  primary_project_end_after TEXT,
  cross_project_impact INTEGER NOT NULL DEFAULT 0,
  approval_required INTEGER NOT NULL DEFAULT 0,
  approval_reason_codes_json TEXT NOT NULL DEFAULT '[]',
  summary_ko TEXT NOT NULL,
  summary_vi TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES schedule_recalculation_runs(run_id),
  FOREIGN KEY (source_worklog_id) REFERENCES daily_worklogs(id),
  FOREIGN KEY (employee_id) REFERENCES workers(id),
  FOREIGN KEY (primary_project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS shadow_impact_task_diffs (
  diff_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  shadow_version_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  official_start TEXT,
  official_end TEXT,
  shadow_start TEXT,
  shadow_end TEXT,
  delta_start_workdays INTEGER NOT NULL DEFAULT 0,
  delta_end_workdays INTEGER NOT NULL DEFAULT 0,
  change_direction TEXT NOT NULL,
  reason_codes_json TEXT NOT NULL DEFAULT '[]',
  approval_required INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (run_id) REFERENCES schedule_recalculation_runs(run_id),
  FOREIGN KEY (shadow_version_id) REFERENCES shadow_schedule_versions(shadow_version_id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  UNIQUE(run_id, task_id),
  CHECK (change_direction IN ('ADVANCED','DELAYED','UNCHANGED','BLOCKED'))
);

CREATE TABLE IF NOT EXISTS shadow_engine_audit_events (
  audit_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  actor_employee_id TEXT,
  actor_mode TEXT NOT NULL,
  event_time_utc TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  test_session_id TEXT,
  request_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_dependencies_project_status ON task_dependencies(project_id, status);
CREATE INDEX IF NOT EXISTS idx_dependencies_successor ON task_dependencies(successor_task_id, status);
CREATE INDEX IF NOT EXISTS idx_constraints_task_status ON task_constraints(task_id, status);
CREATE INDEX IF NOT EXISTS idx_priorities_effective ON project_priorities(effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_recalc_requests_status ON schedule_recalculation_requests(status, requested_at);
CREATE INDEX IF NOT EXISTS idx_recalc_requests_worklog ON schedule_recalculation_requests(source_worklog_id, source_revision_id);
CREATE INDEX IF NOT EXISTS idx_recalc_runs_request ON schedule_recalculation_runs(request_id);
CREATE INDEX IF NOT EXISTS idx_shadow_versions_project ON shadow_schedule_versions(project_id, status, shadow_version_number);
CREATE INDEX IF NOT EXISTS idx_shadow_tasks_version ON shadow_schedule_tasks(shadow_version_id, task_id);
CREATE INDEX IF NOT EXISTS idx_shadow_allocations_run ON shadow_capacity_allocations(run_id, employee_id, local_work_date);
CREATE INDEX IF NOT EXISTS idx_shadow_diffs_run ON shadow_impact_task_diffs(run_id, project_id, task_id);
