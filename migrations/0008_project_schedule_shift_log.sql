-- Migration 0008: Add project schedule shift logs for cascade tracking
CREATE TABLE IF NOT EXISTS project_schedule_shift_logs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  old_start_date DATE NOT NULL,
  new_start_date DATE NOT NULL,
  old_end_date DATE NOT NULL,
  new_end_date DATE NOT NULL,
  delta_days INTEGER NOT NULL,
  shifted_task_count INTEGER NOT NULL DEFAULT 0,
  shifted_future_status_count INTEGER NOT NULL DEFAULT 0,
  preserved_past_status_count INTEGER NOT NULL DEFAULT 0,
  changed_by_name TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
