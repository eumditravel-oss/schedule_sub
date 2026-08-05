-- 0013_manual_country_holidays_cascade_v2.sql

CREATE TABLE IF NOT EXISTS country_holiday_shift_events (
  id TEXT PRIMARY KEY,
  country_code TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  holiday_date TEXT NOT NULL,
  action_type TEXT NOT NULL,
  event_status TEXT NOT NULL DEFAULT 'ACTIVE',
  affected_project_count INTEGER NOT NULL DEFAULT 0,
  affected_task_count INTEGER NOT NULL DEFAULT 0,
  shifted_status_count INTEGER NOT NULL DEFAULT 0,
  changed_by_id TEXT,
  changed_by_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  restored_at TEXT,
  restore_token TEXT
);

CREATE TABLE IF NOT EXISTS country_holiday_task_logs (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  old_start_date TEXT NOT NULL,
  old_end_date TEXT NOT NULL,
  new_start_date TEXT NOT NULL,
  new_end_date TEXT NOT NULL,
  task_revision_after_shift INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES country_holiday_shift_events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS country_holiday_status_logs (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  daily_status_id TEXT NOT NULL,
  old_work_date TEXT NOT NULL,
  new_work_date TEXT NOT NULL,
  status TEXT NOT NULL,
  original_updated_by_name TEXT,
  original_updated_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES country_holiday_shift_events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_country_holiday_shift_events_country_date ON country_holiday_shift_events(country_code, holiday_date);
CREATE INDEX IF NOT EXISTS idx_country_holiday_shift_events_restore_token ON country_holiday_shift_events(restore_token);
CREATE INDEX IF NOT EXISTS idx_country_holiday_task_logs_event ON country_holiday_task_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_country_holiday_task_logs_task ON country_holiday_task_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_country_holiday_status_logs_event ON country_holiday_status_logs(event_id);
