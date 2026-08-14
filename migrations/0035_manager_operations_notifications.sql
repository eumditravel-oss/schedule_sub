-- Checkpoint 5: additive in-app manager notification storage.
-- No official, baseline, actual, worklog, or forecast rows are modified.
CREATE TABLE IF NOT EXISTS notification_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  correlation_id TEXT,
  worklog_id TEXT,
  adjustment_id TEXT,
  employee_id TEXT,
  project_id TEXT,
  local_work_date TEXT,
  dedupe_key TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (severity IN ('INFO','WARNING','ACTION_REQUIRED','BLOCKED'))
);

CREATE TABLE IF NOT EXISTS notification_recipients (
  event_id TEXT NOT NULL,
  recipient_employee_id TEXT NOT NULL,
  read_at TEXT,
  acknowledged_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, recipient_employee_id),
  FOREIGN KEY (event_id) REFERENCES notification_events(event_id),
  FOREIGN KEY (recipient_employee_id) REFERENCES workers(id)
);

CREATE TABLE IF NOT EXISTS notification_subscriptions (
  subscription_id TEXT PRIMARY KEY,
  recipient_employee_id TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_value TEXT NOT NULL,
  category TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (recipient_employee_id, scope_type, scope_value, category),
  FOREIGN KEY (recipient_employee_id) REFERENCES workers(id)
);

CREATE INDEX IF NOT EXISTS idx_notification_recipient_unread
  ON notification_recipients(recipient_employee_id, read_at, created_at);
CREATE INDEX IF NOT EXISTS idx_notification_event_source
  ON notification_events(source_type, source_id, created_at);
