-- Developer Scheduler V3 - Checkpoint 2
-- Daily Worklog API and Daily Capacity Foundation
-- Additive only: Baseline/Forecast dates and Legacy Bootstrap facts are untouched.

ALTER TABLE office_work_policies ADD COLUMN lunch_start_local TEXT NOT NULL DEFAULT '12:00';
ALTER TABLE office_work_policies ADD COLUMN lunch_end_local TEXT NOT NULL DEFAULT '13:00';
ALTER TABLE office_work_policies ADD COLUMN morning_normal_deadline_local TEXT NOT NULL DEFAULT '10:00';

UPDATE office_work_policies
SET lunch_start_local = '12:00',
    lunch_end_local = '13:00',
    morning_normal_deadline_local = CASE country_code WHEN 'VN' THEN '09:00' ELSE '10:00' END,
    updated_at = CURRENT_TIMESTAMP
WHERE country_code IN ('KR', 'VN');

CREATE TABLE IF NOT EXISTS daily_worklogs (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  local_work_date TEXT NOT NULL,
  office_code TEXT NOT NULL,
  timezone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NOT_CREATED',
  current_revision_number INTEGER NOT NULL DEFAULT 0,
  current_morning_revision_id TEXT,
  current_eod_revision_id TEXT,
  morning_submitted_at_utc TEXT,
  eod_submitted_at_utc TEXT,
  morning_late INTEGER NOT NULL DEFAULT 0,
  morning_missing INTEGER NOT NULL DEFAULT 0,
  retroactive_submission INTEGER NOT NULL DEFAULT 0,
  capacity_minutes INTEGER NOT NULL DEFAULT 0,
  actual_recorded_minutes INTEGER NOT NULL DEFAULT 0,
  capacity_variance_minutes INTEGER NOT NULL DEFAULT 0,
  gap_reason_code TEXT,
  gap_reason_text TEXT,
  overtime_candidate_minutes INTEGER NOT NULL DEFAULT 0,
  overtime_approval_status TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
  has_gap INTEGER NOT NULL DEFAULT 0,
  has_overtime_candidate INTEGER NOT NULL DEFAULT 0,
  requires_manager_review INTEGER NOT NULL DEFAULT 0,
  contains_other_project_work INTEGER NOT NULL DEFAULT 0,
  contains_company_duty INTEGER NOT NULL DEFAULT 0,
  contains_emergency_leave INTEGER NOT NULL DEFAULT 0,
  self_edit_deadline_utc TEXT,
  actor_mode TEXT NOT NULL DEFAULT 'TEST_SELECTOR',
  actor_user_id TEXT,
  subject_employee_id TEXT NOT NULL,
  test_session_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES workers(id),
  UNIQUE(employee_id, local_work_date)
);

CREATE TABLE IF NOT EXISTS daily_worklog_revisions (
  id TEXT PRIMARY KEY,
  worklog_id TEXT NOT NULL,
  revision_number INTEGER NOT NULL,
  phase TEXT NOT NULL,
  previous_revision_id TEXT,
  created_by_employee_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reason TEXT,
  change_type TEXT NOT NULL,
  payload_snapshot TEXT NOT NULL,
  is_effective INTEGER NOT NULL DEFAULT 1,
  actor_mode TEXT NOT NULL DEFAULT 'TEST_SELECTOR',
  actor_user_id TEXT,
  subject_employee_id TEXT NOT NULL,
  test_session_id TEXT,
  request_fingerprint TEXT,
  FOREIGN KEY (worklog_id) REFERENCES daily_worklogs(id),
  FOREIGN KEY (previous_revision_id) REFERENCES daily_worklog_revisions(id),
  UNIQUE(worklog_id, revision_number)
);

CREATE TABLE IF NOT EXISTS daily_worklog_entries (
  id TEXT PRIMARY KEY,
  worklog_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  project_id TEXT,
  task_id TEXT,
  assignment_id TEXT,
  assignment_role TEXT,
  work_category TEXT NOT NULL,
  planned_minutes INTEGER,
  target_progress REAL,
  expected_deliverable TEXT,
  known_blocker TEXT,
  actual_minutes INTEGER,
  work_result TEXT,
  deliverable TEXT,
  blocker TEXT,
  progress_before REAL,
  progress_after REAL,
  remaining_estimated_minutes INTEGER,
  completion_reported INTEGER NOT NULL DEFAULT 0,
  exception_reason TEXT,
  related_project_id TEXT,
  related_task_id TEXT,
  reason_source TEXT,
  local_start_time TEXT,
  local_end_time TEXT,
  meeting_record_json TEXT,
  attachment_reference TEXT,
  leave_link_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (worklog_id) REFERENCES daily_worklogs(id),
  FOREIGN KEY (revision_id) REFERENCES daily_worklog_revisions(id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE TABLE IF NOT EXISTS worklog_audit_events (
  id TEXT PRIMARY KEY,
  worklog_id TEXT NOT NULL,
  revision_id TEXT,
  event_type TEXT NOT NULL,
  actor_mode TEXT NOT NULL,
  actor_user_id TEXT,
  actor_employee_id TEXT,
  subject_employee_id TEXT NOT NULL,
  local_work_date TEXT NOT NULL,
  event_time_utc TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  test_session_id TEXT,
  request_id TEXT,
  source_ip_hash TEXT,
  FOREIGN KEY (worklog_id) REFERENCES daily_worklogs(id),
  FOREIGN KEY (revision_id) REFERENCES daily_worklog_revisions(id)
);

CREATE TABLE IF NOT EXISTS employee_capacity_events (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  local_work_date TEXT NOT NULL,
  event_type TEXT NOT NULL,
  adjustment_minutes INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_reference_id TEXT NOT NULL,
  worklog_id TEXT,
  revision_id TEXT,
  approval_status TEXT NOT NULL DEFAULT 'EFFECTIVE',
  requires_manager_review INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_mode TEXT NOT NULL DEFAULT 'TEST_SELECTOR',
  actor_user_id TEXT,
  test_session_id TEXT,
  FOREIGN KEY (employee_id) REFERENCES workers(id),
  FOREIGN KEY (worklog_id) REFERENCES daily_worklogs(id),
  FOREIGN KEY (revision_id) REFERENCES daily_worklog_revisions(id),
  UNIQUE(employee_id, local_work_date, source_type, source_reference_id)
);

CREATE TABLE IF NOT EXISTS overtime_candidates (
  id TEXT PRIMARY KEY,
  worklog_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  local_work_date TEXT NOT NULL,
  raw_actual_minutes INTEGER NOT NULL,
  effective_capacity_minutes INTEGER NOT NULL,
  candidate_minutes INTEGER NOT NULL,
  reason TEXT NOT NULL,
  evidence_json TEXT,
  approval_status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  reviewed_by_employee_id TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (worklog_id) REFERENCES daily_worklogs(id),
  FOREIGN KEY (revision_id) REFERENCES daily_worklog_revisions(id),
  UNIQUE(worklog_id, revision_id)
);

CREATE TABLE IF NOT EXISTS task_actual_contributions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  worklog_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  local_work_date TEXT NOT NULL,
  assignment_role TEXT NOT NULL,
  raw_actual_minutes INTEGER NOT NULL,
  approved_actual_minutes INTEGER NOT NULL,
  progress_before REAL,
  progress_after REAL,
  remaining_estimated_minutes INTEGER,
  completion_reported INTEGER NOT NULL DEFAULT 0,
  source_type TEXT NOT NULL DEFAULT 'DAILY_WORKLOG_EOD',
  is_effective INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (worklog_id) REFERENCES daily_worklogs(id),
  FOREIGN KEY (revision_id) REFERENCES daily_worklog_revisions(id),
  UNIQUE(task_id, worklog_id, revision_id, employee_id)
);

CREATE TABLE IF NOT EXISTS task_actual_aggregates (
  task_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  raw_actual_minutes INTEGER NOT NULL DEFAULT 0,
  approved_actual_minutes INTEGER NOT NULL DEFAULT 0,
  current_progress REAL NOT NULL DEFAULT 0,
  remaining_estimated_minutes INTEGER,
  completion_reported INTEGER NOT NULL DEFAULT 0,
  actual_status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  last_actual_work_date TEXT,
  last_effective_worklog_id TEXT,
  progress_source TEXT NOT NULL DEFAULT 'LEGACY_BOOTSTRAP',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS worklog_correction_requests (
  id TEXT PRIMARY KEY,
  worklog_id TEXT NOT NULL,
  requested_revision_id TEXT,
  requested_by_employee_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  proposed_payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  reviewed_by_employee_id TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_mode TEXT NOT NULL DEFAULT 'TEST_SELECTOR',
  test_session_id TEXT,
  FOREIGN KEY (worklog_id) REFERENCES daily_worklogs(id)
);

CREATE TABLE IF NOT EXISTS temporary_primary_assignments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  temporary_primary_employee_id TEXT NOT NULL,
  effective_start_date TEXT NOT NULL,
  effective_end_date TEXT NOT NULL,
  assigned_by_employee_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (temporary_primary_employee_id) REFERENCES workers(id),
  UNIQUE(task_id, temporary_primary_employee_id, effective_start_date, effective_end_date)
);

CREATE TABLE IF NOT EXISTS worklog_idempotency_keys (
  idempotency_key TEXT PRIMARY KEY,
  operation TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  worklog_id TEXT,
  revision_id TEXT,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (worklog_id) REFERENCES daily_worklogs(id),
  FOREIGN KEY (revision_id) REFERENCES daily_worklog_revisions(id)
);

CREATE INDEX IF NOT EXISTS idx_daily_worklogs_employee_date ON daily_worklogs(employee_id, local_work_date);
CREATE INDEX IF NOT EXISTS idx_daily_worklogs_review ON daily_worklogs(requires_manager_review, local_work_date);
CREATE INDEX IF NOT EXISTS idx_worklog_revisions_worklog ON daily_worklog_revisions(worklog_id, revision_number);
CREATE INDEX IF NOT EXISTS idx_worklog_entries_revision ON daily_worklog_entries(revision_id, phase);
CREATE INDEX IF NOT EXISTS idx_worklog_entries_task ON daily_worklog_entries(task_id, phase);
CREATE INDEX IF NOT EXISTS idx_worklog_audit_worklog ON worklog_audit_events(worklog_id, event_time_utc);
CREATE INDEX IF NOT EXISTS idx_capacity_events_employee_date ON employee_capacity_events(employee_id, local_work_date);
CREATE INDEX IF NOT EXISTS idx_overtime_review ON overtime_candidates(approval_status, local_work_date);
CREATE INDEX IF NOT EXISTS idx_actual_contributions_task ON task_actual_contributions(task_id, is_effective, local_work_date);
CREATE INDEX IF NOT EXISTS idx_actual_contributions_worklog ON task_actual_contributions(worklog_id, revision_id, is_effective);
CREATE INDEX IF NOT EXISTS idx_correction_requests_status ON worklog_correction_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_temporary_primary_effective ON temporary_primary_assignments(task_id, effective_start_date, effective_end_date, status);
