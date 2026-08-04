-- 0009_leave_schedule_cascade_and_restore.sql

-- 1. Calendar Override Groups Table
CREATE TABLE IF NOT EXISTS calendar_override_groups (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL,
  override_type TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  label_ko TEXT,
  label_vi TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_by_name TEXT NOT NULL,
  updated_by_name TEXT NOT NULL,
  deleted_by_name TEXT,
  deleted_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Add override_group_id column to calendar_overrides
ALTER TABLE calendar_overrides ADD COLUMN override_group_id TEXT;

-- 3. Leave Schedule Shift Events Table
CREATE TABLE IF NOT EXISTS leave_schedule_shift_events (
  id TEXT PRIMARY KEY,
  override_group_id TEXT NOT NULL UNIQUE,
  worker_id TEXT NOT NULL,
  leave_start_date DATE NOT NULL,
  leave_end_date DATE NOT NULL,
  working_leave_days INTEGER NOT NULL,
  affected_project_count INTEGER NOT NULL DEFAULT 0,
  affected_task_count INTEGER NOT NULL DEFAULT 0,
  shifted_future_status_count INTEGER NOT NULL DEFAULT 0,
  event_status TEXT NOT NULL DEFAULT 'ACTIVE',
  restore_token TEXT,
  changed_by_name TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  leave_deleted_at DATETIME,
  restored_at DATETIME
);

-- 4. Leave Schedule Shift Task Logs Table
CREATE TABLE IF NOT EXISTS leave_schedule_shift_task_logs (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  old_start_date DATE NOT NULL,
  old_end_date DATE NOT NULL,
  new_start_date DATE NOT NULL,
  new_end_date DATE NOT NULL,
  shift_mode TEXT NOT NULL,
  task_revision_after_shift INTEGER,
  restore_status TEXT NOT NULL DEFAULT 'RESTORABLE',
  conflict_reason TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Leave Schedule Shift Status Logs Table
CREATE TABLE IF NOT EXISTS leave_schedule_shift_status_logs (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  daily_status_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  old_work_date DATE NOT NULL,
  new_work_date DATE NOT NULL,
  status TEXT NOT NULL,
  original_updated_by_name TEXT,
  original_created_at DATETIME,
  original_updated_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. Add schedule_revision to tasks table
ALTER TABLE tasks ADD COLUMN schedule_revision INTEGER NOT NULL DEFAULT 0;

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_override_groups_worker ON calendar_override_groups(worker_id);
CREATE INDEX IF NOT EXISTS idx_leave_events_group ON leave_schedule_shift_events(override_group_id);
CREATE INDEX IF NOT EXISTS idx_leave_task_logs_event ON leave_schedule_shift_task_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_leave_status_logs_event ON leave_schedule_shift_status_logs(event_id);
