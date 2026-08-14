-- Dynamic Scheduler V3 - Production Worklog Approval
-- Additive only. Submitted EOD remains visible but is not authoritative until
-- a manager explicitly approves the revision.

ALTER TABLE daily_worklogs ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE daily_worklogs ADD COLUMN approved_revision_id TEXT;
ALTER TABLE daily_worklogs ADD COLUMN approved_by_employee_id TEXT;
ALTER TABLE daily_worklogs ADD COLUMN approved_at TEXT;
ALTER TABLE daily_worklogs ADD COLUMN approval_reason TEXT;

ALTER TABLE daily_worklog_revisions ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE daily_worklog_revisions ADD COLUMN approval_action TEXT;
ALTER TABLE daily_worklog_revisions ADD COLUMN approval_reason TEXT;
ALTER TABLE daily_worklog_revisions ADD COLUMN approved_by_employee_id TEXT;
ALTER TABLE daily_worklog_revisions ADD COLUMN approved_at TEXT;

CREATE TABLE IF NOT EXISTS worklog_approval_events (
  id TEXT PRIMARY KEY,
  worklog_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  work_date TEXT NOT NULL,
  manager_employee_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (worklog_id) REFERENCES daily_worklogs(id),
  FOREIGN KEY (revision_id) REFERENCES daily_worklog_revisions(id),
  FOREIGN KEY (employee_id) REFERENCES workers(id),
  FOREIGN KEY (manager_employee_id) REFERENCES workers(id),
  CHECK (action IN ('APPROVE','RETURN','REJECT')),
  UNIQUE(revision_id, action)
);

CREATE INDEX IF NOT EXISTS idx_worklog_approval_queue
  ON daily_worklogs(approval_status, local_work_date, employee_id);
CREATE INDEX IF NOT EXISTS idx_worklog_approval_events_worklog
  ON worklog_approval_events(worklog_id, created_at);
