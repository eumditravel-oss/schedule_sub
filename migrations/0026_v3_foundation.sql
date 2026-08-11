-- Developer Scheduler V3 - Checkpoint 1 Foundation
-- Additive-only migration. Do not replay 0015-0025.

-- Existing Baseline anchors: enrich snapshots without replacing any row.
ALTER TABLE project_baselines ADD COLUMN baseline_status TEXT NOT NULL DEFAULT 'APPROVED';
ALTER TABLE project_baselines ADD COLUMN baseline_project_progress REAL NOT NULL DEFAULT 0;
ALTER TABLE project_baselines ADD COLUMN snapshot_source TEXT NOT NULL DEFAULT 'CURRENT_SCHEDULE_SNAPSHOT';
ALTER TABLE project_baselines ADD COLUMN source_schema_fingerprint TEXT;
ALTER TABLE project_baselines ADD COLUMN source_project_json TEXT;
ALTER TABLE project_baselines ADD COLUMN actor_mode TEXT NOT NULL DEFAULT 'SYSTEM_MIGRATION';
ALTER TABLE project_baselines ADD COLUMN actor_user_id TEXT;
ALTER TABLE project_baselines ADD COLUMN test_session_id TEXT;

ALTER TABLE task_baselines ADD COLUMN task_group_id TEXT;
ALTER TABLE task_baselines ADD COLUMN baseline_progress REAL NOT NULL DEFAULT 0;
ALTER TABLE task_baselines ADD COLUMN baseline_status TEXT NOT NULL DEFAULT 'PLANNED';
ALTER TABLE task_baselines ADD COLUMN primary_assignment_json TEXT;
ALTER TABLE task_baselines ADD COLUMN support_assignments_json TEXT;
ALTER TABLE task_baselines ADD COLUMN assignment_fte_raw_json TEXT;
ALTER TABLE task_baselines ADD COLUMN proposed_effort_minutes INTEGER;
ALTER TABLE task_baselines ADD COLUMN effort_status TEXT NOT NULL DEFAULT 'PROPOSED';
ALTER TABLE task_baselines ADD COLUMN original_raw_json TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_baselines_project_version
  ON project_baselines(project_id, version);
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_baselines_baseline_task
  ON task_baselines(baseline_id, task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_group
  ON tasks(task_group_id);

CREATE TABLE IF NOT EXISTS office_work_policies (
  office_code TEXT PRIMARY KEY,
  country_code TEXT NOT NULL,
  timezone TEXT NOT NULL,
  work_start_local TEXT NOT NULL,
  work_end_local TEXT NOT NULL,
  schedulable_minutes INTEGER NOT NULL,
  provisional_break_minutes INTEGER NOT NULL DEFAULT 60,
  config_status TEXT NOT NULL DEFAULT 'PROVISIONAL_CONFIG',
  effective_from TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schedule_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  baseline_id TEXT,
  version_number INTEGER NOT NULL,
  based_on_version_id TEXT,
  source_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'INITIALIZED',
  project_forecast_start TEXT,
  project_forecast_end TEXT,
  change_summary TEXT,
  schema_version TEXT NOT NULL DEFAULT 'V3_FOUNDATION_1',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT NOT NULL,
  actor_mode TEXT NOT NULL DEFAULT 'SYSTEM_MIGRATION',
  actor_user_id TEXT,
  subject_employee_id TEXT,
  test_session_id TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (baseline_id) REFERENCES project_baselines(id),
  FOREIGN KEY (based_on_version_id) REFERENCES schedule_versions(id),
  UNIQUE(project_id, version_number)
);

CREATE TABLE IF NOT EXISTS schedule_version_tasks (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  task_group_id TEXT,
  forecast_start TEXT,
  forecast_end TEXT,
  planned_effort_minutes INTEGER,
  effort_status TEXT NOT NULL DEFAULT 'PROPOSED',
  primary_assignment_json TEXT,
  support_assignments_json TEXT,
  original_raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (version_id) REFERENCES schedule_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  UNIQUE(version_id, task_id)
);

CREATE TABLE IF NOT EXISTS task_actuals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  cutover_date TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_detail TEXT NOT NULL,
  legacy_progress_source TEXT NOT NULL,
  existing_progress REAL NOT NULL DEFAULT 0,
  actual_progress REAL NOT NULL DEFAULT 0,
  actual_minutes INTEGER NOT NULL DEFAULT 0,
  remaining_effort_minutes INTEGER,
  assumed_actual_end_date TEXT,
  bootstrap_rule TEXT NOT NULL,
  exception_code TEXT,
  generated_by TEXT NOT NULL,
  display_label_ko TEXT NOT NULL,
  display_label_vi TEXT NOT NULL,
  employee_worklog_eligible INTEGER NOT NULL DEFAULT 0,
  attendance_metric_eligible INTEGER NOT NULL DEFAULT 0,
  capacity_usage_eligible INTEGER NOT NULL DEFAULT 0,
  overtime_metric_eligible INTEGER NOT NULL DEFAULT 0,
  digest_missing_worklog_eligible INTEGER NOT NULL DEFAULT 0,
  actor_mode TEXT NOT NULL DEFAULT 'SYSTEM_MIGRATION',
  actor_user_id TEXT,
  subject_employee_id TEXT,
  test_session_id TEXT,
  original_raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  UNIQUE(project_id, task_id, cutover_date, source_type)
);

CREATE TABLE IF NOT EXISTS task_completion_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  actual_end_date TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_detail TEXT NOT NULL,
  generated_by TEXT NOT NULL,
  source_reference_id TEXT NOT NULL,
  actor_mode TEXT NOT NULL DEFAULT 'SYSTEM_MIGRATION',
  actor_user_id TEXT,
  subject_employee_id TEXT,
  test_session_id TEXT,
  employee_worklog_eligible INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  UNIQUE(source_type, source_reference_id)
);

CREATE TABLE IF NOT EXISTS progress_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  as_of_date TEXT NOT NULL,
  baseline_planned_progress REAL NOT NULL,
  current_actual_overall_progress REAL NOT NULL,
  progress_variance_percentage_point REAL NOT NULL,
  legacy_project_progress REAL NOT NULL,
  legacy_v3_difference REAL NOT NULL,
  difference_reason TEXT NOT NULL,
  baseline_end_date TEXT,
  current_forecast_end_date TEXT,
  schedule_variance_workdays INTEGER NOT NULL DEFAULT 0,
  weight_source TEXT NOT NULL,
  progress_confidence TEXT NOT NULL,
  source_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id, as_of_date, source_type)
);

CREATE TABLE IF NOT EXISTS v3_migration_runs (
  id TEXT PRIMARY KEY,
  environment_name TEXT NOT NULL,
  cutover_date TEXT NOT NULL,
  source_schema_fingerprint TEXT NOT NULL,
  source_head TEXT,
  mode TEXT NOT NULL,
  baseline_insert_count INTEGER NOT NULL DEFAULT 0,
  forecast_insert_count INTEGER NOT NULL DEFAULT 0,
  bootstrap_insert_count INTEGER NOT NULL DEFAULT 0,
  completion_event_insert_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  result_json TEXT,
  actor_mode TEXT NOT NULL DEFAULT 'SYSTEM_MIGRATION',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(environment_name, cutover_date, mode, source_schema_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_schedule_versions_project
  ON schedule_versions(project_id, version_number);
CREATE INDEX IF NOT EXISTS idx_schedule_version_tasks_project
  ON schedule_version_tasks(project_id, task_id);
CREATE INDEX IF NOT EXISTS idx_task_actuals_project
  ON task_actuals(project_id, task_id, cutover_date);
CREATE INDEX IF NOT EXISTS idx_completion_events_project
  ON task_completion_events(project_id, task_id, actual_end_date);
CREATE INDEX IF NOT EXISTS idx_progress_snapshots_project
  ON progress_snapshots(project_id, as_of_date);

INSERT OR IGNORE INTO office_work_policies (
  office_code, country_code, timezone, work_start_local, work_end_local,
  schedulable_minutes, provisional_break_minutes, config_status, effective_from
) VALUES
  ('VN', 'VN', 'Asia/Ho_Chi_Minh', '08:00', '17:00', 480, 60, 'PROVISIONAL_CONFIG', '2026-08-11'),
  ('KR', 'KR', 'Asia/Seoul', '09:00', '17:00', 420, 60, 'PROVISIONAL_CONFIG', '2026-08-11');
